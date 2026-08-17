const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const net = require("node:net");
const { spawn } = require("node:child_process");
const { app, BrowserWindow, ipcMain, screen, dialog, shell } = require("electron");

const pool = require("./db/pool.cjs");
const repo = require("./db/repo.cjs");
const discover = require("./db/discover.cjs");
const worker = require("./sync/worker.cjs");
const updater = require("./updater.cjs");
const terminalStore = require("./terminal-store.cjs");
const dbConfigStore = require("./db-config-store.cjs");
const configStore = require("./config-store.cjs");
const localDb = require("./db/sqlite.cjs");
const brandingStore = require("./branding-store.cjs");
const health = require("./health.cjs");
const recovery = require("./recovery.cjs");
const netHttp = require("./net.cjs");

const DEV_URL = process.env.VITE_DEV_SERVER_URL;
const DEBUG = process.env.POS_DEBUG === "1";

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
let reconnectTimer = null;
let reconnectDelay = 5_000;
let cloudConfig = null;

function enterSafeMode(reason) {
  if (safeMode) return;
  safeMode = true;
  if (reason) health.markFailed(reason);
  updater.pause();
  for (const win of BrowserWindow.getAllWindows()) win.destroy();
  mainWindow = null;
  displayWindow = null;
  recovery.open();
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
  const port = await choosePort();
  // ELECTRON_RUN_AS_NODE makes the bundled Electron binary behave as plain
  // Node, so the packaged app needs no separate Node.js install.
  serverProcess = spawn(process.execPath, [serverEntry], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
      HOST: "127.0.0.1",
      PORT: String(port),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  serverProcess.stdout.on("data", (d) => console.log(`[app-server] ${String(d).trimEnd()}`));
  serverProcess.stderr.on("data", (d) => console.error(`[app-server] ${String(d).trimEnd()}`));
  serverProcess.on("exit", (code) => console.error(`[app-server] exited with code ${code}`));

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

function instrument(win, route) {
  win.webContents.on("did-fail-load", (_e, code, description, url) => {
    console.error(`[window] failed to load ${url || route}: ${description} (${code})`);
  });
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
  mainWindow.once("ready-to-show", () => mainWindow.show());

  // Keep the in-app maximise icon in step with the real window state.
  const sendWindowState = () =>
    mainWindow?.webContents.send("window:state", { maximized: mainWindow.isMaximized() });
  mainWindow.on("maximize", sendWindowState);
  mainWindow.on("unmaximize", sendWindowState);

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
    instrument(displayWindow, "/display");
    void load(displayWindow, "/display");
  }
}

function broadcastStatus(payload) {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send("pos:status-changed", payload);
  }
}

async function statusPayload() {
  const status = await worker.status();
  return { ...status, cloudConfigured: !!cloudConfig };
}

async function connectLocal(config) {
  await pool.connect(config);
  reconnectDelay = 5_000;
  broadcastStatus(await statusPayload());
}

function scheduleReconnect() {
  if (reconnectTimer || !dbConfigStore.read()) return;
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    try {
      await connectLocal(dbConfigStore.read());
    } catch (error) {
      broadcastStatus({ connected: false, error: fail(error).error, tables: [], queue: [] });
      reconnectDelay = Math.min(reconnectDelay * 2, 60_000);
      scheduleReconnect();
    }
  }, reconnectDelay);
}

/** Loose files a crashed update or print job can leave behind. */
function isJunkFile(name) {
  return (
    name.endsWith(".tmp") ||
    name.endsWith(".partial") ||
    name.endsWith(".download") ||
    /^pos-print-.*\.(bin|prn|txt)$/i.test(name) ||
    /^pending-print-/i.test(name)
  );
}

/**
 * Startup tidy-up: clears orphaned temp files and prunes mirrored rows the
 * central database has already confirmed. Never touches pending work.
 */
async function runHousekeeping() {
  const summary = { files: 0, bytes: 0, rows: 0 };
  const folders = [app.getPath("userData"), path.join(app.getPath("userData"), "Cache")];
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const folder of folders) {
    let entries = [];
    try {
      entries = await fs.promises.readdir(folder, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isFile() || !isJunkFile(entry.name)) continue;
      const full = path.join(folder, entry.name);
      try {
        const stat = await fs.promises.stat(full);
        if (stat.mtimeMs > cutoff) continue; // still in use
        await fs.promises.unlink(full);
        summary.files += 1;
        summary.bytes += stat.size;
      } catch {
        /* a locked file is simply left for next time */
      }
    }
  }
  if (pool.getConfig()) {
    try {
      const retentionDays = Number(await repo.getState("retention_days")) || 90;
      const pruned = await repo.housekeep({ retentionDays });
      summary.rows = pruned.removedRows;
    } catch (error) {
      if (DEBUG) console.warn("[pos] housekeeping skipped:", fail(error).error);
    }
  }
  console.log(
    `[pos] housekeeping: removed ${summary.files} temp file(s), ${summary.rows} confirmed row(s)`,
  );
  return summary;
}

async function initializeWorker(config) {
  if (!config?.url || !config?.key) return null;
  cloudConfig = config;
  worker.init({
    ...config,
    relayUrl: baseUrl ? `${baseUrl}/api/v1/pos/sync` : null,
    onChange: async () => broadcastStatus(await statusPayload()),
  });
  worker.start();
  return worker.run();
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
  /* ----------------------- boot health & safe mode -------------------- */

  // The healthy signal: the register mounted, so this build works.
  ipcMain.handle("app:ready", () => {
    if (readyWatchdog) clearTimeout(readyWatchdog);
    readyWatchdog = null;
    return { ok: true, health: health.markHealthy() };
  });

  ipcMain.handle("health:state", () => {
    const state = health.read();
    const lastGood = state.lastGoodVersion;
    const canRollback =
      process.platform === "win32" && Boolean(lastGood) && lastGood !== app.getVersion();
    return {
      ...state,
      version: app.getVersion(),
      safeMode,
      canRollback,
      rollbackHint: !lastGood
        ? "No earlier working version has been recorded on this machine yet."
        : lastGood === app.getVersion()
          ? "The installed version is already the last one that started cleanly."
          : null,
    };
  });

  ipcMain.handle("health:rollback", async () => {
    const { lastGoodVersion } = health.read();
    updater.pause();
    return updater.rollback(lastGoodVersion, (percent) => recovery.progress({ percent }));
  });

  ipcMain.handle("health:retry", () => {
    health.reset();
    app.relaunch();
    app.exit(0);
  });

  ipcMain.handle("health:open-logs", () => shell.openPath(app.getPath("userData")));
  ipcMain.handle("health:quit", () => app.quit());

  ipcMain.handle("print:silent", async (_e, html, options) => {
    try {
      return await printSilent(
        String(html),
        options?.deviceName || undefined,
        options?.paper || undefined,
        !!options?.dialog,
      );
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle("print:raw", async (_e, bytes, options) => {
    try {
      const result = await printRaw(bytes, {
        deviceName: options?.deviceName || "",
        share: options?.share || "",
      });
      // No page fallback on purpose: rendering escape sequences through the
      // driver only produces a slip and never kicks the drawer.
      if (!result.ok) console.error("[pos] raw print failed:", result.error);
      return result;
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle("print:list", async () => {
    try {
      const target = mainWindow ?? BrowserWindow.getAllWindows()[0];
      const printers = target ? await target.webContents.getPrintersAsync() : [];
      return {
        ok: true,
        printers: printers.map((p) => ({
          name: p.name,
          displayName: p.displayName || p.name,
          isDefault: Boolean(p.isDefault),
        })),
      };
    } catch (err) {
      return { ok: false, printers: [], error: fail(err).error };
    }
  });

  ipcMain.handle("pos:connect", async (_e, config, cloud) => {
    let cloudError;
    try {
      await connectLocal(config);
      const saved = dbConfigStore.write(config);
      if (!saved.ok) console.warn("[pos] could not seal SQL config:", saved.error);
      // Permanent copy: survives a missing OS keyring, so the till never
      // forgets its database after a restart.
      configStore.set("localDb", config);
    } catch (err) {
      return { ok: false, ...pool.describeSqlError(err) };
    }
    try {
      await initializeWorker(cloud);
    } catch (error) {
      cloudError = fail(error).error;
    }
    return { ok: true, ...(cloudError ? { cloudError } : {}) };
  });

  ipcMain.handle("pos:configure-cloud", async (_e, cloud) => {
    try {
      await initializeWorker(cloud);
      return { ok: true };
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("pos:test", async (_e, config) => {
    try {
      return await pool.test(config);
    } catch (err) {
      return { ok: false, ...pool.describeSqlError(err) };
    }
  });

  ipcMain.handle("pos:scan-network", async () => {
    try {
      return await discover.scan();
    } catch (err) {
      return { ok: false, servers: [], ...pool.describeSqlError(err) };
    }
  });

  ipcMain.handle("db:scan-local-instances", async () => {
    try {
      return await discover.scanLocalInstances();
    } catch (err) {
      return { ok: false, targets: [], servers: [], ...pool.describeSqlError(err) };
    }
  });

  ipcMain.handle("db:test-direct-connection", async (_e, params) => {
    try {
      return await pool.testDirect(params);
    } catch (err) {
      return { ok: false, ...pool.describeSqlError(err) };
    }
  });

  ipcMain.handle("pos:write", async (_e, _context, op) => {
    try {
      await repo.applyOp(op);
      void worker.run();
      return { ok: true };
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle("pos:status", () => worker.status());
  ipcMain.handle("pos:housekeep", async (_e, options) => {
    try {
      const retentionDays = Number(options?.retentionDays);
      if (Number.isFinite(retentionDays) && retentionDays >= 7) {
        await repo.setState("retention_days", String(Math.round(retentionDays)));
      }
      return { ok: true, ...(await runHousekeeping()) };
    } catch (error) {
      return fail(error);
    }
  });
  ipcMain.handle("pos:snapshot", async () => {
    try {
      return { ok: true, ...(await repo.snapshot()) };
    } catch (error) {
      return fail(error);
    }
  });

  /* ------------------- updates & terminal registration ---------------- */

  ipcMain.handle("update:status", () => updater.status());
  ipcMain.handle("update:check", () => updater.check());
  ipcMain.handle("update:install", () => updater.install());
  ipcMain.handle("app:version", () => app.getVersion());

  /**
   * Update-feed reads made outside the window: the renderer's own origin is
   * 127.0.0.1, so a browser request to the update bucket is blocked by CORS.
   */
  ipcMain.handle("net:get-json", (_e, url) => netHttp.getJson(String(url)));
  ipcMain.handle("net:head", (_e, url) => netHttp.head(String(url)));
  ipcMain.handle("net:get-binary", (_e, url) => netHttp.getBinary(String(url)));

  /**
   * The branch database is the home for the activation token and the branch it
   * binds this machine to. The sealed file store stays as the fallback for a
   * machine whose SQL Server is not up yet.
   */
  ipcMain.handle("terminal:read", async () => {
    const sealed = terminalStore.read();
    if (sealed) return { ok: true, config: sealed };
    try {
      const raw = await repo.getSetting("terminal_config");
      if (raw) return { ok: true, config: JSON.parse(raw) };
    } catch {
      /* local database unavailable — the sealed store is the answer */
    }
    return { ok: true, config: null };
  });
  ipcMain.handle("terminal:write", async (_e, config) => {
    const result = terminalStore.write(config);
    try {
      await repo.setSetting("terminal_config", config ? JSON.stringify(config) : null);
      await repo.setSetting("terminal_branch_id", config?.locationId ?? null);
      await repo.setSetting("activation_token_id", config?.tokenId ?? null);
    } catch {
      /* local database unavailable — the sealed store already has it */
    }
    return result;
  });

  ipcMain.handle("settings:get", async (_e, key) => {
    try {
      return { ok: true, value: await repo.getSetting(String(key)) };
    } catch (error) {
      // Offline fallback: the embedded database answers when SQL Server is out.
      return { ok: true, value: localDb.getState(`setting:${String(key)}`), degraded: error.message };
    }
  });
  ipcMain.handle("settings:set", async (_e, key, value) => {
    localDb.setState(`setting:${String(key)}`, value == null ? null : String(value));
    try {
      await repo.setSetting(String(key), value == null ? null : String(value));
      return { ok: true };
    } catch (error) {
      return { ok: true, degraded: error.message };
    }
  });

  /* ---------- permanent configuration + embedded local database ---------- */

  ipcMain.handle("config:read", () => ({
    ok: true,
    config: configStore.readAll(),
    path: configStore.filePath(),
    sealed: configStore.encryptionAvailable(),
  }));
  ipcMain.handle("config:write", (_e, patch) => configStore.merge(patch ?? {}));
  ipcMain.handle("config:get", (_e, key) => ({ ok: true, value: configStore.get(String(key)) }));
  ipcMain.handle("config:set", (_e, key, value) => configStore.set(String(key), value));
  /** Admin-only hard reset: configuration AND the mirrored local database. */
  ipcMain.handle("config:reset", () => {
    const cfg = configStore.reset();
    const wiped = localDb.erase();
    localDb.init(app.getPath("userData"));
    return { ok: cfg.ok && wiped.ok, error: cfg.error ?? wiped.error };
  });

  ipcMain.handle("local:info", () => ({
    ok: true,
    ...localDb.info(),
    counts: localDb.counts(),
    pending: localDb.pendingCounts(),
  }));
  ipcMain.handle("local:mirror", (_e, entity, rows) => ({
    ok: true,
    written: localDb.mirror(String(entity), rows ?? []),
  }));
  ipcMain.handle("local:list", (_e, entity, limit) =>
    ({ ok: true, rows: localDb.listMirror(String(entity), Number(limit) || 500) }));
  ipcMain.handle("local:enqueue", (_e, entity, payload) => ({
    ok: true,
    row: localDb.enqueue(String(entity), payload ?? {}),
  }));
  ipcMain.handle("local:pending", (_e, limit) => ({ ok: true, rows: localDb.pending(Number(limit) || 200) }));
  ipcMain.handle("local:mark", (_e, id, status, error) => {
    localDb.markOutbox(String(id), String(status), error ?? null);
    return { ok: true };
  });
  ipcMain.handle("local:audit-log", (_e, entry) => ({ ok: true, row: localDb.logAudit(entry ?? {}) }));
  ipcMain.handle("local:audit-list", (_e, limit) => ({
    ok: true,
    rows: localDb.listAudit(Number(limit) || 200),
  }));
  ipcMain.handle("local:audit-clear", () => {
    localDb.clearAudit();
    return { ok: true };
  });
  ipcMain.handle("local:rollback", (_e, op) => localDb.rollbackOp(op ?? {}));
  /** Offline relationship check straight from the local mirror's catalogue. */
  ipcMain.handle("local:relational-health", () => {
    try {
      return { ok: true, data: localDb.relationalHealth() };
    } catch (err) {
      return fail(err);
    }
  });

  /* branding mirror so first-run setup only ever runs once */
  ipcMain.handle("branding:read", () => ({ ok: true, branding: brandingStore.read() }));
  ipcMain.handle("branding:write", (_e, branding) => brandingStore.write(branding));

  /* in-window title bar buttons */
  const owner = (event) => BrowserWindow.fromWebContents(event.sender) ?? mainWindow;
  ipcMain.handle("window:minimize", (e) => {
    owner(e)?.minimize();
    return { ok: true };
  });
  ipcMain.handle("window:maximize", (e) => {
    const win = owner(e);
    if (!win) return { ok: false, maximized: false };
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
    return { ok: true, maximized: win.isMaximized() };
  });
  ipcMain.handle("window:close", (e) => {
    owner(e)?.close();
    return { ok: true };
  });
  ipcMain.handle("window:is-maximized", (e) => ({ maximized: !!owner(e)?.isMaximized() }));

  /* ---------------- offline register database surface ---------------- */

  ipcMain.handle("db:create-sale", async (_e, payload) => {
    try {
      const branchId = payload?.branchId ?? (await repo.getState("branch_id"));
      const result = await repo.createSale({ ...payload, branchId });
      void worker.run();
      return { ok: true, ...result };
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle("db:get-products", async () => {
    try {
      return { ok: true, products: await repo.getProducts() };
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle("db:get-pending-sync-count", async () => {
    try {
      const counts = await repo.pendingSyncCount();
      return { ok: true, ...counts };
    } catch (err) {
      return { ok: false, total: 0, sales: 0, error: fail(err).error };
    }
  });

  ipcMain.handle("db:get-branch", async () => {
    try {
      return {
        ok: true,
        branchId: await repo.getState("branch_id"),
        branchName: await repo.getState("branch_name"),
      };
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle("db:set-branch", async (_e, branch) => {
    try {
      await repo.setState("branch_id", branch?.branchId ?? null);
      await repo.setState("branch_name", branch?.branchName ?? null);
      return { ok: true };
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle("pos:push", () => worker.push());
  ipcMain.handle("pos:pull", () => worker.pull());
  ipcMain.handle("pos:set-sync-enabled", (_e, on) => worker.setEnabled(on));
  ipcMain.handle("pos:retry-errored", async () => {
    try {
      await repo.retryErrored();
      void worker.run();
      return { ok: true };
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle("pos:retry-row", async (_e, table, id) => {
    try {
      await repo.retryRow(String(table), id);
      broadcastStatus(await statusPayload());
      void worker.run();
      return { ok: true };
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle("pos:discard-row", async (_e, table, id) => {
    try {
      await repo.discardRow(String(table), id);
      broadcastStatus(await statusPayload());
      return { ok: true };
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle("pos:backup", async (_e, target) => {
    try {
      const config = pool.getConfig();
      let destination = target;
      if (!destination) {
        const res = await dialog.showSaveDialog(mainWindow, {
          title: "Back up local database",
          defaultPath: `${config.database}-${new Date().toISOString().slice(0, 10)}.bak`,
          filters: [{ name: "SQL Server backup", extensions: ["bak"] }],
        });
        if (res.canceled || !res.filePath) return { ok: false, error: "Cancelled" };
        destination = res.filePath;
      }
      await pool
        .getPool()
        .request()
        .input("path", pool.sql.NVarChar(400), destination)
        .query(
          `DECLARE @sql NVARCHAR(MAX) = N'BACKUP DATABASE [${config.database}] TO DISK = ''' + @path + ''' WITH INIT, COMPRESSION'; EXEC sp_executesql @sql;`,
        );
      return { ok: true, path: destination };
    } catch (err) {
      return fail(err);
    }
  });
}

app.whenReady().then(async () => {
  const engine = localDb.init(app.getPath("userData"));
  if (DEBUG) console.log("[pos] local database:", engine.engine, engine.path);
  registerIpc();
  const boot = health.beginBoot();
  if (health.shouldEnterSafeMode(boot)) {
    safeMode = true;
    updater.pause();
    recovery.open();
    return;
  }
  try {
    if (!baseUrl) baseUrl = await startAppServer();
  } catch (err) {
    console.error(err);
    // There is always a way back: recovery, not a dead end.
    enterSafeMode(err instanceof Error ? err.message : String(err));
    return;
  }
  createWindows();
  // The sealed store first, then the permanent JSON copy: whichever survived.
  const savedDbConfig = dbConfigStore.read() ?? configStore.get("localDb");
  if (savedDbConfig) {
    try {
      await connectLocal(savedDbConfig);
    } catch (error) {
      console.error("[pos] automatic SQL reconnect failed:", fail(error).error);
      scheduleReconnect();
    }
  }
  updater.start();
  // A few seconds after the till is usable, never before: housekeeping must
  // never sit between the operator and the register.
  setTimeout(() => {
    void runHousekeeping().catch((error) => {
      if (DEBUG) console.warn("[pos] housekeeping failed:", fail(error).error);
    });
  }, 8_000);
  // If the till never reports in, the build is broken — recover instead of
  // leaving the operator staring at a blank window.
  readyWatchdog = setTimeout(() => enterSafeMode("Startup timed out"), 60_000);
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindows();
  });
});

app.on("window-all-closed", async () => {
  if (readyWatchdog) clearTimeout(readyWatchdog);
  worker.stop();
  if (reconnectTimer) clearTimeout(reconnectTimer);
  updater.stop();
  stopAppServer();
  await pool.close();
  if (process.platform !== "darwin") app.quit();
});