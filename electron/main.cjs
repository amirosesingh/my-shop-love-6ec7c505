const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const net = require("node:net");
const { spawn } = require("node:child_process");
const { app, BrowserWindow, ipcMain, screen, dialog, session, shell } = require("electron");

const updater = require("./updater.cjs");
const terminalStore = require("./terminal-store.cjs");
const configStore = require("./config-store.cjs");
const brandingStore = require("./branding-store.cjs");
const health = require("./health.cjs");
const recovery = require("./recovery.cjs");
const netHttp = require("./net.cjs");
// Every channel argument arriving from the window goes through these checks.
const guard = require("./ipc-guard.cjs");
const diagnostics = require("./diagnostics.cjs");
const serverKeys = require("./server-keys.cjs");
const cloudCredentials = require("./cloud-credentials.cjs");
const storageHygiene = require("./storage-hygiene.cjs");

const DEV_URL = process.env.VITE_DEV_SERVER_URL;
const DEBUG = process.env.POS_DEBUG === "1";

// Must run before the first window exists, otherwise a native crash in the GPU
// or a driver leaves nothing behind to look at.
diagnostics.startCrashReporter();
diagnostics.watchApp(app);

/* ---------------------------------------------------------------------------
   Safety net.

   An unhandled error must never be the reason a shop cannot ring up a sale, so
   an ordinary fault is written to the diagnostics log and the till keeps
   trading. A fault that means the till can no longer be trusted — the local
   database file, the sealed activation or the sealed credentials — is a
   different thing: swallowing it would let the register keep taking money on a
   broken foundation. Those are logged as fatal and the window is told to stop.
   --------------------------------------------------------------------------- */

/** Faults that mean the till's own records or identity are unsound. */
const FATAL_PATTERNS = [
  /terminal-config/i,
  /safeStorage|DPAPI|decryptString/i,
  /EROFS|ENOSPC/i,
];

function isFatal(error) {
  const text = `${error?.code ?? ""} ${error?.message ?? String(error ?? "")}`;
  return FATAL_PATTERNS.some((p) => p.test(text));
}

/** Tell every window the till must stop, then leave it on screen to be read. */
function haltForFatal(detail) {
  try {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send("app:fatal", {
        message:
          "This till has stopped because its own records or identity could not be trusted. Do not take payments on it. Call support and quote the diagnostics log.",
        detail,
      });
    }
  } catch {
    /* the window may already be gone */
  }
}

function recordFault(scope, error) {
  const fatal = isFatal(error);
  const detail = {
    error: error?.message ?? String(error),
    severity: fatal ? "fatal" : "recoverable",
    stack: String(error?.stack ?? "")
      .split("\n")
      .slice(0, 4)
      .join(" | "),
  };
  try {
    diagnostics.logCrash(scope, detail);
  } catch {
    console.error(`[pos] ${scope}:`, error);
  }
  if (fatal) haltForFatal(detail);
}

process.on("uncaughtException", (error) => recordFault("main.uncaught-exception", error));
process.on("unhandledRejection", (reason) => recordFault("main.unhandled-rejection", reason));


/* ---------------------------------------------------------------------------
   One till per PC.

   Two copies of the register on the same machine would each hold their own
   bill number, drawer state and sync queue, so the second launch is refused
   outright and the window that is already open is brought to the front.
   --------------------------------------------------------------------------- */
const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) {
  dialog.showErrorBox(
    "This terminal is already running",
    "The point of sale software is already open on this PC.\n\n" +
      "Switch to the window that is already running — only one till may run " +
      "on a machine at a time.",
  );
  app.quit();
  process.exit(0);
}

/** Built Node server produced by `DESKTOP_BUILD=1 vite build`. */
const serverEntry = path.join(__dirname, "..", "dist-desktop", "server", "index.mjs");

let mainWindow = null;
let displayWindow = null;
let serverProcess = null;
let baseUrl = DEV_URL || null;
/** Cleared as soon as the renderer reports that the till actually mounted. */
let readyWatchdog = null;
let safeMode = false;
/** Set once the operator (or the shell) has genuinely asked the till to close. */
let quitting = false;


/** The till reported in, the page painted, or a person is looking at a screen. */
function markStartupSettled() {
  if (!readyWatchdog) return;
  clearTimeout(readyWatchdog);
  readyWatchdog = null;
}

function enterSafeMode(reason) {
  if (safeMode) return;
  safeMode = true;
  markStartupSettled();
  if (reason) health.markFailed(reason);
  else health.beginRecovery("Repeated failed launches");
  updater.pause();
  // The repair window opens FIRST: destroying the last till window with no
  // replacement on screen fires `window-all-closed`, which used to quit the
  // whole app — the operator saw the till vanish instead of a repair screen.
  recovery.open();
  for (const win of BrowserWindow.getAllWindows()) {
    if (!recovery.isOwn(win)) win.destroy();
  }
  mainWindow = null;
  displayWindow = null;
}



/* ------------------------- local app server ------------------------- */

/**
 * The renderer keeps preferences (branding, theme, scale) in browser storage,
 * which is keyed by origin — so the local server must come back on the SAME
 * port every launch. Only fall back to a random port if it is taken.
 */
const PREFERRED_PORT = Number(process.env.POS_APP_PORT) || 43117;

function portFree(port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.unref();
    probe.once("error", () => resolve(false));
    probe.listen(port, "127.0.0.1", () => probe.close(() => resolve(true)));
  });
}

function randomPort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

async function choosePort() {
  if (await portFree(PREFERRED_PORT)) return PREFERRED_PORT;
  return randomPort();
}

function waitForPort(port, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = net.connect(port, "127.0.0.1");
      socket.once("connect", () => {
        socket.destroy();
        resolve();
      });
      socket.once("error", () => {
        socket.destroy();
        if (Date.now() > deadline)
          reject(new Error(`Local app server did not start on port ${port}`));
        else setTimeout(attempt, 250);
      });
    };
    attempt();
  });
}

async function startAppServer() {
  if (!fs.existsSync(serverEntry)) {
    throw new Error(`Desktop build missing (${serverEntry}). Run: npm run desktop:build`);
  }
  // Older builds sealed a central service key on this machine. It is no longer
  // used or accepted, so it is erased the first time this build starts.
  serverKeys.purgeLegacyServiceKey();
  const port = await choosePort();
  // ELECTRON_RUN_AS_NODE makes the bundled Electron binary behave as plain
  // Node, so the packaged app needs no separate Node.js install.
  serverProcess = spawn(process.execPath, [serverEntry], {
    env: {
      ...process.env,
      // Without these the bundled server cannot reach the central database and
      // every cashier sign-in fails with "no key configured".
      ...serverKeys.serverEnv(),
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
      HOST: "127.0.0.1",
      PORT: String(port),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  // Piped to a file as well as the console: on a shop PC nobody is watching a
  // console, and a server that refuses to start is exactly what the recovery
  // screen needs evidence for.
  serverProcess.stdout.on("data", (d) => {
    const line = String(d).trimEnd();
    console.log(`[app-server] ${line}`);
    diagnostics.logServer(line);
  });
  serverProcess.stderr.on("data", (d) => {
    const line = String(d).trimEnd();
    console.error(`[app-server] ${line}`);
    diagnostics.logServer(`ERR ${line}`);
  });
  serverProcess.on("exit", (code) => {
    console.error(`[app-server] exited with code ${code}`);
    diagnostics.logServer(`exited with code ${code}`);
    diagnostics.logCrash("app-server.exit", { code });
    // The pages the till is showing now point at a dead address. Go to the
    // repair screen instead of leaving a window that can never load again.
    if (!quitting && !safeMode) enterSafeMode("The local app server stopped");
  });


  await waitForPort(port);
  return `http://127.0.0.1:${port}`;
}

function stopAppServer() {
  if (serverProcess && !serverProcess.killed) serverProcess.kill();
  serverProcess = null;
}

function load(win, route) {
  return win.loadURL(`${baseUrl}${route}`);
}

/**
 * The window that holds the till bridge must stay on the till.
 *
 * Nothing here changes normal use: the app's own pages, the print preview and
 * the update flow all still work. What it stops is a stray or planted link
 * moving this privileged window to somewhere on the internet, or opening a
 * second window that inherits the same bridge. Links to elsewhere are handed
 * to the operator's normal browser instead, where they hold nothing.
 */
function sameApp(target) {
  try {
    const url = new URL(target);
    if (url.protocol === "data:" || url.protocol === "about:") return true;
    if (!baseUrl) return false;
    return url.origin === new URL(baseUrl).origin;
  } catch {
    return false;
  }
}

function lockDownNavigation(win, route) {
  win.webContents.on("will-navigate", (event, target) => {
    if (sameApp(target)) return;
    event.preventDefault();
    diagnostics.logCrash("window.navigation-blocked", { route, target });
    void shell.openExternal(target).catch(() => {});
  });
  win.webContents.on("will-redirect", (event, target) => {
    if (sameApp(target)) return;
    event.preventDefault();
    diagnostics.logCrash("window.redirect-blocked", { route, target });
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    // No second window ever gets the bridge; outside links go to the browser.
    if (!sameApp(url)) void shell.openExternal(url).catch(() => {});
    return { action: "deny" };
  });
  // A page in this window may not attach anything of its own to the shell.
  win.webContents.on("will-attach-webview", (event) => event.preventDefault());
}

function instrument(win, route) {
  lockDownNavigation(win, route);
  // A page that painted is proof the build works, whatever screen it landed on
  // — setup, sign-in or the register. Only a window that never renders at all
  // counts as a failed launch.
  win.webContents.on("did-finish-load", () => markStartupSettled());
  win.webContents.on("did-fail-load", (_e, code, description, url) => {
    console.error(`[window] failed to load ${url || route}: ${description} (${code})`);
    diagnostics.logCrash("window.did-fail-load", { route, code, description });
  });

  diagnostics.watchWindow(win, route);
  if (DEBUG) win.webContents.openDevTools({ mode: "detach" });
}

function createWindows() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    show: false,
    backgroundColor: "#0b0b0c",
    // Frameless shell. On Windows the app paints its own minimise / maximise /
    // close buttons inside the title strip so they follow the POS theme.
    titleBarStyle: "hidden",
    ...(process.platform === "darwin"
      ? { trafficLightPosition: { x: 12, y: 12 } }
      : { frame: false }),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  instrument(mainWindow, "/");
  void load(mainWindow, "/");
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    // No tenant keys sealed on this device yet: nudge once, never block.
    if (!cloudCredentials.read()) {
      mainWindow.webContents.send("cloud:setup-required", { platform: "electron" });
    }
  });

  // Keep the in-app maximise icon in step with the real window state.
  const sendWindowState = () =>
    mainWindow?.webContents.send("window:state", { maximized: mainWindow.isMaximized() });
  mainWindow.on("maximize", sendWindowState);
  mainWindow.on("unmaximize", sendWindowState);

  // The customer screen is a companion of the till, never the other way
  // round: closing the till takes the second screen with it.
  mainWindow.on("closed", () => {
    mainWindow = null;
    closeCustomerDisplay();
  });

  // A second monitor becomes the customer-facing display automatically.
  const external = screen.getAllDisplays().find((d) => d.bounds.x !== 0 || d.bounds.y !== 0);
  if (external) {
    displayWindow = new BrowserWindow({
      x: external.bounds.x,
      y: external.bounds.y,
      fullscreen: true,
      backgroundColor: "#0b0b0c",
      webPreferences: {
        preload: path.join(__dirname, "preload.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    // Closing only the customer screen leaves the till running.
    displayWindow.on("closed", () => {
      displayWindow = null;
    });
    instrument(displayWindow, "/display");
    void load(displayWindow, "/display");
  }
}

/** Destroy the customer-facing window if one is open. Safe to call twice. */
function closeCustomerDisplay() {
  const win = displayWindow;
  displayWindow = null;
  if (win && !win.isDestroyed()) win.destroy();
}
const fail = (err) => ({ ok: false, error: err instanceof Error ? err.message : String(err) });

/* ----------------------------- printing ----------------------------- */

/**
 * Renders receipt HTML in a hidden (but real) window and prints it without any
 * dialog. Offscreen windows are deliberately NOT used: they hand a job to the
 * spooler without a paint surface, so the printer reacts but nothing prints.
 * When no printer name is configured the system default is used.
 */
const PAGE_SIZES = {
  "58mm": { width: 58000, height: 297000 },
  "80mm": { width: 80000, height: 297000 },
};

function printSilent(html, deviceName, paper, dialog = false) {
  return new Promise((resolve) => {
    const win = new BrowserWindow({
      show: !!dialog,
      width: 420,
      height: 900,
      ...(dialog ? { title: "Print", autoHideMenuBar: true } : {}),
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: false },
    });
    // A receipt is printed content, never a place to browse from.
    win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    win.webContents.on("will-navigate", (event) => event.preventDefault());
    const done = (result) => {
      if (!win.isDestroyed()) win.destroy();
      resolve(result);
    };
    const pageSize =
      PAGE_SIZES[paper] ?? (paper === "letter" ? "Letter" : paper === "a4" ? "A4" : undefined);
    win.webContents.once("did-finish-load", () => {
      // Settle delay so fonts/QR SVG are laid out before the page is rasterised.
      setTimeout(() => {
        if (win.isDestroyed()) return;
        win.webContents.print(
          {
            silent: !dialog,
            printBackground: true,
            margins: { marginType: "none" },
            ...(pageSize ? { pageSize } : {}),
            ...(deviceName ? { deviceName } : {}),
          },
          (success, reason) =>
            done(
              success
                ? { ok: true }
                : reason === "cancelled"
                  ? { ok: true, cancelled: true }
                  : { ok: false, error: reason },
            ),
        );
      }, 350);
    });
    win.webContents.once("did-fail-load", (_e, code, description) =>
      done({ ok: false, error: `${description} (${code})` }),
    );
    void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  });
}

/**
 * PowerShell helper that pushes a file of bytes into the Windows spooler with
 * the RAW datatype. RAW bypasses the driver entirely, so an ESC/POS drawer
 * pulse reaches the printer untouched and is forwarded to the RJ11 drawer port.
 * Printing by *name* means the printer does not have to be shared.
 */
const RAW_PS = `param([string]$Payload,[string]$PrinterName)
$ErrorActionPreference = 'Stop'
if (-not $PrinterName) {
  $PrinterName = (Get-CimInstance Win32_Printer -Filter "Default=True" | Select-Object -First 1).Name
}
if (-not $PrinterName) { throw 'No printer selected and no Windows default printer found.' }
Add-Type -TypeDefinition @"
using System;
using System.IO;
using System.Runtime.InteropServices;
public static class PosRaw {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public class DOCINFO { [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPWStr)] public string pDataType; }
  [DllImport("winspool.drv", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern bool OpenPrinter(string src, out IntPtr h, IntPtr pd);
  [DllImport("winspool.drv", SetLastError=true)]
  public static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.drv", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern bool StartDocPrinter(IntPtr h, int level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFO di);
  [DllImport("winspool.drv", SetLastError=true)]
  public static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError=true)]
  public static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError=true)]
  public static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError=true)]
  public static extern bool WritePrinter(IntPtr h, IntPtr buf, int count, out int written);
  public static void Send(string printer, byte[] data) {
    IntPtr h;
    if (!OpenPrinter(printer, out h, IntPtr.Zero))
      throw new Exception("OpenPrinter failed for '" + printer + "' (" + Marshal.GetLastWin32Error() + ")");
    try {
      DOCINFO di = new DOCINFO();
      di.pDocName = "POS drawer pulse"; di.pDataType = "RAW";
      if (!StartDocPrinter(h, 1, di)) throw new Exception("StartDocPrinter failed (" + Marshal.GetLastWin32Error() + ")");
      try {
        if (!StartPagePrinter(h)) throw new Exception("StartPagePrinter failed (" + Marshal.GetLastWin32Error() + ")");
        IntPtr buf = Marshal.AllocCoTaskMem(data.Length);
        try {
          Marshal.Copy(data, 0, buf, data.Length);
          int written;
          if (!WritePrinter(h, buf, data.Length, out written))
            throw new Exception("WritePrinter failed (" + Marshal.GetLastWin32Error() + ")");
        } finally { Marshal.FreeCoTaskMem(buf); }
      } finally { EndPagePrinter(h); EndDocPrinter(h); }
    } finally { ClosePrinter(h); }
  }
}
"@
[PosRaw]::Send($PrinterName, [System.IO.File]::ReadAllBytes($Payload))
Write-Output ("sent:" + $PrinterName)
`;

function runProcess(cmd, args) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { windowsHide: true });
    let stderr = "";
    let stdout = "";
    child.stdout.on("data", (d) => (stdout += String(d)));
    child.stderr.on("data", (d) => (stderr += String(d)));
    child.on("error", (err) => resolve({ ok: false, error: err.message }));
    child.on("exit", (code) =>
      resolve(
        code === 0
          ? { ok: true, stdout: stdout.trim() }
          : { ok: false, error: stderr.trim() || stdout.trim() || `${cmd} exited ${code}` },
      ),
    );
  });
}

/**
 * Writes raw ESC/POS bytes to the printer. Drawers are wired to the receipt
 * printer over RJ11, so the kick pulse has to reach the device unprocessed —
 * a driver-rendered page would swallow it (and spit out a slip instead).
 *
 * Primary path: RAW spooler write to the printer by name (no share needed).
 * Secondary path: copy to a printer share, but only when one is configured.
 */
async function printRaw(bytes, options = {}) {
  const deviceName = options.deviceName || "";
  const share = options.share || "";
  if (process.platform !== "win32") {
    return { ok: false, error: "Raw printing is only supported on Windows" };
  }

  const stamp = Date.now();
  const binFile = path.join(os.tmpdir(), `pos-raw-${stamp}.bin`);
  const psFile = path.join(os.tmpdir(), `pos-raw-${stamp}.ps1`);
  const cleanup = () => {
    for (const f of [binFile, psFile]) {
      try {
        fs.unlinkSync(f);
      } catch {
        /* already gone */
      }
    }
  };

  try {
    fs.writeFileSync(binFile, Buffer.from(bytes));
    fs.writeFileSync(psFile, RAW_PS, "utf8");

    const primary = await runProcess("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      psFile,
      "-Payload",
      binFile,
      "-PrinterName",
      deviceName,
    ]);
    if (primary.ok) {
      cleanup();
      return { ok: true, via: "raw-spooler" };
    }

    if (share) {
      const target = share.startsWith("\\\\") ? share : `\\\\localhost\\${share}`;
      const copied = await runProcess("cmd", ["/c", "copy", "/b", binFile, target]);
      cleanup();
      return copied.ok
        ? { ok: true, via: "share" }
        : { ok: false, error: `${primary.error}; share copy: ${copied.error}` };
    }

    cleanup();
    return { ok: false, error: primary.error };
  } catch (err) {
    cleanup();
    return fail(err);
  }
}


function registerIpc() {
  ipcMain.handle("app:ready", () => {
    markStartupSettled();
    const state = health.markHealthy();
    const resumed = updater.resume();
    return { ok: true, health: state, updatesResumed: resumed.resumed };
  });
  ipcMain.handle("health:state", () => ({ ...health.read(), version: app.getVersion(), safeMode }));
  ipcMain.handle("health:rollback", async () => {
    const { lastGoodVersion } = health.read();
    updater.pause();
    return updater.rollback(lastGoodVersion, (percent) => recovery.progress({ percent }));
  });
  ipcMain.handle("health:resume-updates", () => { health.reset(); return updater.resume(); });
  ipcMain.handle("health:retry", () => { health.reset(); app.relaunch(); app.exit(0); });
  ipcMain.handle("health:open-logs", () => shell.openPath(app.getPath("userData")));
  ipcMain.handle("health:collect-diagnostics", () => {
    const result = diagnostics.writeReport({ appVersion: app.getVersion(), storage: "online-only" });
    if (result.ok) shell.showItemInFolder(result.file);
    return result;
  });
  ipcMain.handle("health:quit", () => app.quit());

  ipcMain.handle("print:silent", async (_e, html, options) => guard.guarded(async () => {
    const body = guard.text(html, { name: "receipt", max: 2 * 1024 * 1024 });
    const opts = guard.plainObject(options, { name: "print options" });
    try { return await printSilent(body, guard.shellSafeText(opts.deviceName, { name: "printer name" }) || undefined, guard.text(opts.paper, { name: "paper size", max: 32, allowEmpty: true }) || undefined, !!opts.dialog); }
    catch (err) { return fail(err); }
  }));
  ipcMain.handle("print:raw", async (_e, bytes, options) => guard.guarded(async () => {
    const opts = guard.plainObject(options, { name: "print options" });
    return printRaw(guard.bytes(bytes), {
      deviceName: guard.shellSafeText(opts.deviceName, { name: "printer name" }),
      share: guard.shellSafeText(opts.share, { name: "printer share" }),
    });
  }));
  ipcMain.handle("print:list", async () => {
    try {
      const target = mainWindow ?? BrowserWindow.getAllWindows()[0];
      const printers = target ? await target.webContents.getPrintersAsync() : [];
      return { ok: true, printers: printers.map((p) => ({ name: p.name, displayName: p.displayName || p.name, isDefault: Boolean(p.isDefault) })) };
    } catch (err) { return { ok: false, printers: [], error: fail(err).error }; }
  });

  ipcMain.handle("update:status", () => updater.status());
  ipcMain.handle("update:check", () => updater.check());
  ipcMain.handle("update:install", () => updater.install());
  ipcMain.handle("update:diagnose", () => updater.diagnose());
  ipcMain.handle("update:download-page", () => updater.downloadPage());
  ipcMain.handle("app:version", () => app.getVersion());
  ipcMain.handle("net:get-json", (_e, url) => netHttp.getJson(String(url)));
  ipcMain.handle("net:head", (_e, url) => netHttp.head(String(url)));
  ipcMain.handle("net:get-binary", (_e, url) => netHttp.getBinary(String(url)));

  ipcMain.handle("terminal:read", () => ({ ok: true, config: terminalStore.read() }));
  ipcMain.handle("terminal:write", (_e, raw) => {
    try { return terminalStore.write(guard.terminalConfig(raw)); }
    catch (err) { return guard.refuse(err.message); }
  });
  ipcMain.handle("terminal:clear", () => terminalStore.write(null));

  ipcMain.handle("config:read", () => ({ ok: true, config: configStore.readAll(), path: configStore.filePath(), sealed: configStore.encryptionAvailable() }));
  ipcMain.handle("config:write", (_e, patch) => guard.guarded(() => configStore.merge(guard.plainObject(patch, { name: "settings" }))));
  ipcMain.handle("config:get", (_e, key) => guard.guarded(() => ({ ok: true, value: configStore.get(guard.key(key)) })));
  ipcMain.handle("config:set", (_e, key, value) => guard.guarded(() => configStore.set(guard.key(key), value)));
  ipcMain.handle("config:reset", () => configStore.reset());
  ipcMain.handle("settings:get", (_e, key) => ({ ok: true, value: configStore.get(`setting:${String(key)}`) }));
  ipcMain.handle("settings:set", (_e, key, value) => configStore.set(`setting:${String(key)}`, value));

  ipcMain.handle("server-keys:status", () => ({ ok: true, ...serverKeys.status() }));
  ipcMain.handle("backend:get", () => ({ ok: true, url: String(configStore.get("backendUrl") ?? "").trim() }));
  ipcMain.handle("backend:set", (_e, value) => {
    const next = String(value ?? "").trim().replace(/\/+$/, "");
    if (next && !/^https?:\/\/.+/i.test(next)) return { ok: false, error: "Enter a full address starting with https://" };
    const saved = configStore.set("backendUrl", next || null);
    return saved?.ok === false ? saved : { ok: true, url: next };
  });
  ipcMain.handle("cloud:status", () => ({ ok: true, ...cloudCredentials.status() }));
  ipcMain.handle("cloud:bootstrap", () => {
    const saved = cloudCredentials.read();
    return saved ? { ok: true, url: saved.url, key: saved.key } : { ok: false };
  });
  ipcMain.handle("cloud:set", (_e, value) => {
    const saved = cloudCredentials.write(value);
    return saved.ok === false ? saved : { ok: true, ...cloudCredentials.status() };
  });
  ipcMain.handle("cloud:remove", () => cloudCredentials.remove());
  ipcMain.handle("branding:read", () => ({ ok: true, branding: brandingStore.read() }));
  ipcMain.handle("branding:write", (_e, branding) => brandingStore.write(branding));

  const owner = (event) => BrowserWindow.fromWebContents(event.sender) ?? mainWindow;
  ipcMain.handle("window:minimize", (e) => { owner(e)?.minimize(); return { ok: true }; });
  ipcMain.handle("window:maximize", (e) => { const win = owner(e); if (!win) return { ok: false, maximized: false }; win.isMaximized() ? win.unmaximize() : win.maximize(); return { ok: true, maximized: win.isMaximized() }; });
  ipcMain.handle("window:close", (e) => { owner(e)?.close(); return { ok: true }; });
  ipcMain.handle("window:is-maximized", (e) => ({ maximized: !!owner(e)?.isMaximized() }));
}

app.whenReady().then(async () => {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const headers = { ...details.responseHeaders };
    delete headers["content-security-policy"];
    delete headers["Content-Security-Policy"];
    headers["Content-Security-Policy"] = [["default-src 'self' data: blob:", "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:", "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob: https:", "font-src 'self' data:", "connect-src 'self' https: wss: http://127.0.0.1:* http://localhost:*", "frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'"].join("; ")];
    callback({ responseHeaders: headers });
  });
  app.on("second-instance", () => { const win = mainWindow ?? BrowserWindow.getAllWindows()[0]; if (!win || win.isDestroyed()) return; if (win.isMinimized()) win.restore(); win.show(); win.focus(); });
  try { storageHygiene.runOnLaunch(app.getPath("userData"), app.getVersion()); } catch (error) { if (DEBUG) console.warn("[pos] storage hygiene skipped:", fail(error).error); }
  registerIpc();
  const boot = health.beginBoot();
  if (health.shouldEnterSafeMode(boot)) { safeMode = true; health.beginRecovery(boot.reason ?? "Repeated failed launches"); updater.pause(); recovery.open(); return; }
  try { if (!baseUrl) baseUrl = await startAppServer(); }
  catch (err) { enterSafeMode(err instanceof Error ? err.message : String(err)); return; }
  createWindows();
  updater.start();
  readyWatchdog = setTimeout(() => enterSafeMode("Startup timed out"), 60_000);
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindows(); });
});

app.on("before-quit", () => { quitting = true; closeCustomerDisplay(); });
app.on("window-all-closed", () => {
  if (recovery.isOpen()) return;
  markStartupSettled(); updater.stop(); stopAppServer();
  if (process.platform !== "darwin") app.quit();
});
