const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const net = require("node:net");
const { spawn } = require("node:child_process");
const { app, BrowserWindow, ipcMain, screen, dialog, shell } = require("electron");

const pool = require("./db/pool.cjs");
const repo = require("./db/repo.cjs");
const discover = require("./db/discover.cjs");
const sqlAdmin = require("./db/admin-pool.cjs");
const driverInstall = require("./db/driver-install.cjs");
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
// Every channel argument arriving from the window goes through these checks.
const guard = require("./ipc-guard.cjs");
const diagnostics = require("./diagnostics.cjs");
const serverKeys = require("./server-keys.cjs");
const staffAuth = require("./staff-auth.cjs");
const adminSession = require("./admin-session.cjs");
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

   An unhandled error must never be the reason a shop cannot ring up a sale.
   Everything is written to the connection diagnostics log and the till keeps
   running; the native SQL driver is isolated in its own process, so the only
   faults that can reach here are ordinary JavaScript ones.
   --------------------------------------------------------------------------- */
process.on("uncaughtException", (error) => {
  try {
    const detail = {
      error: error?.message ?? String(error),
      stack: String(error?.stack ?? "")
        .split("\n")
        .slice(0, 4)
        .join(" | "),
    };
    pool.logConnection("main.uncaught-exception", detail);
    diagnostics.logCrash("main.uncaught-exception", detail);
  } catch {
    console.error("[pos] uncaught exception:", error);
  }
});
process.on("unhandledRejection", (reason) => {
  try {
    const detail = { error: reason?.message ?? String(reason) };
    pool.logConnection("main.unhandled-rejection", detail);
    diagnostics.logCrash("main.unhandled-rejection", detail);
  } catch {
    console.error("[pos] unhandled rejection:", reason);
  }
});

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
let reconnectAttempt = 0;
let lastConnectionError = null;
let cloudConfig = null;

function enterSafeMode(reason) {
  if (safeMode) return;
  safeMode = true;
  if (reason) health.markFailed(reason);
  else health.beginRecovery("Repeated failed launches");
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

function instrument(win, route) {
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

function broadcastStatus(payload) {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send("pos:status-changed", payload);
  }
}

async function statusPayload() {
  const status = await worker.status();
  const config = pool.getConfig();
  return {
    ...status,
    cloudConfigured: !!cloudConfig,
    server: config?.server ?? null,
    database: config?.database ?? null,
    resolved: config?.resolved ?? null,
  };
}

async function connectLocal(config) {
  await pool.connect(config);
  // A pool object is not proof of a usable database: prove it with a real
  // round-trip before anything is told the till is connected.
  const verified = await pool.verify();
  reconnectDelay = 5_000;
  reconnectAttempt = 0;
  lastConnectionError = null;
  broadcastStatus(await statusPayload());
  return verified;
}

/** Rejects instead of hanging for ever when a driver never answers. */
function withTimeout(promise, ms, message) {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_r, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    }),
  ]);
}

/** One reconnect attempt may never outlive its own slot. */
const RECONNECT_ATTEMPT_MS = 60_000;

/**
 * Set while the operator removes the saved connection: the backoff loop must
 * not re-arm itself between the cancel and the file being unlinked.
 */
let reconnectSuppressed = false;
/** Structured reason for the last failure — shown verbatim in the UI banner. */
let lastConnectionDetail = null;

/** Stops the backoff loop dead. */
function stopReconnectLoop() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  reconnectAttempt = 0;
  reconnectDelay = 5_000;
}

/**
 * Tells the renderer the loop is alive: which attempt is running, when the
 * next one starts, and why the last one failed. A bare spinner with no reason
 * is what left the till reading "Reconnecting…" for ever.
 */
function broadcastReconnecting(nextRetryAt) {
  broadcastStatus({
    connected: false,
    reconnecting: true,
    attempt: reconnectAttempt,
    nextRetryAt: nextRetryAt ?? null,
    error: lastConnectionError,
    lastError: lastConnectionError,
    errorCode: lastConnectionDetail?.code ?? null,
    errorHint: lastConnectionDetail?.hint ?? null,
    errorStage: lastConnectionDetail?.stage ?? null,
    tables: [],
    queue: [],
    server: null,
    database: null,
    resolved: null,
    cloudConfigured: !!cloudConfig,
  });
}

/**
 * Backoff 5s -> 10s -> 20s -> 40s -> 60s, capped, retrying for as long as a
 * connection is saved. `immediate` is the operator pressing "Retry now".
 */
function scheduleReconnect(immediate = false) {
  if (reconnectSuppressed) return;
  const savedForRetry = dbConfigStore.read();
  if (!savedForRetry) return;
  // Three driver crashes in a row against the same server is a deterministic
  // fault, not bad luck. Retrying it forever only hides the real problem.
  const audit = pool.auditConnectionConfig(savedForRetry);
  if (audit.target && pool.driverDiagnostics().crashTargets.some((t) => t.blocked)) {
    lastConnectionDetail = {
      code: "EDRIVER_CRASH_LOOP",
      stage: "driver",
      error: `The database driver stopped unexpectedly three times in a row while connecting to ${audit.target}.`,
      hint: "Automatic retrying has been stopped. Check the ODBC driver version and the server name, then use Reconnect now.",
    };
    lastConnectionError = lastConnectionDetail.error;
    broadcastReconnecting(null);
    return;
  }
  if (reconnectTimer) {
    if (!immediate) return;
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (immediate) {
    reconnectDelay = 5_000;
    reconnectAttempt = 0;
  }
  const delay = immediate ? 0 : reconnectDelay;
  broadcastReconnecting(new Date(Date.now() + delay).toISOString());
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    if (reconnectSuppressed) return;
    const config = dbConfigStore.read();
    if (!config) return;
    reconnectAttempt += 1;
    try {
      await withTimeout(
        connectLocal(config),
        RECONNECT_ATTEMPT_MS,
        "The local database did not answer in time.",
      );
      console.log(`[pos] local database reconnected on attempt ${reconnectAttempt}`);
    } catch (error) {
      lastConnectionDetail = pool.describeSqlError(error);
      lastConnectionError = lastConnectionDetail.error ?? fail(error).error;
      console.warn(`[pos] reconnect attempt ${reconnectAttempt} failed: ${lastConnectionError}`);
      reconnectDelay = Math.min(reconnectDelay * 2, 60_000);
      scheduleReconnect();
    }
  }, delay);
}

/**
 * Escape hatch that keeps the credentials: drop everything that might be
 * wedged and open the connection again, right now.
 *
 * `override` carries the values currently typed into the wizard. Retrying the
 * sealed file when the operator has just corrected the port is how "Reconnect
 * now" used to repeat the very failure they were fixing. The override is used
 * for the attempt only and is sealed just once it actually works.
 */
async function reconnectNow(override) {
  const saved = dbConfigStore.read();
  const usingOverride = !!(override && override.server && override.database);
  const config = usingOverride ? { ...saved, ...override } : saved;
  stopReconnectLoop();
  try {
    await sqlAdmin.cancel();
  } catch {
    /* nothing was running */
  }
  try {
    await sqlAdmin.disconnect();
  } catch {
    /* already gone */
  }
  try {
    await pool.close();
  } catch {
    /* already gone */
  }
  if (!config) {
    lastConnectionError = null;
    lastConnectionDetail = null;
    reconnectAttempt = 0;
    broadcastStatus({
      connected: false,
      reconnecting: false,
      tables: [],
      queue: [],
      server: null,
      database: null,
      resolved: null,
      cloudConfigured: !!cloudConfig,
    });
    return {
      ok: false,
      stage: "config",
      error: "No local database connection is saved on this till.",
      hint: "Run Setup connection in Local database settings.",
    };
  }
  reconnectAttempt = 1;
  broadcastReconnecting(new Date().toISOString());
  try {
    const verified = await withTimeout(
      connectLocal(config),
      RECONNECT_ATTEMPT_MS,
      "The local database did not answer in time.",
    );
    // Only a proven-good override replaces the sealed credentials.
    if (usingOverride) dbConfigStore.write(config);
    return {
      ok: true,
      stage: "connected",
      usedFormValues: usingOverride,
      activeDb: verified?.activeDb ?? config.database ?? null,
      serverName: verified?.serverName ?? null,
      latencyMs: verified?.latencyMs ?? null,
    };
  } catch (error) {
    const described = pool.describeSqlError(error);
    lastConnectionError = described.error;
    lastConnectionDetail = described;
    // Keep trying in the background: the service may simply still be starting.
    scheduleReconnect();

    return { ok: false, stage: described.stage ?? "database", ...described };
  }
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

/**
 * The tenant URL and publishable key come from the OS-sealed store whenever
 * one exists — renderer-provided copies (from bundle fallbacks or older
 * settings) never win over what an admin saved on this device. Tokens the
 * renderer holds (session, cashier, terminal) still pass through unchanged.
 */
function withSealedCloud(cloud) {
  const sealed = cloudCredentials.read();
  if (sealed) return { ...(cloud ?? {}), url: sealed.url, key: sealed.key };
  return cloud;
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
    const state = health.markHealthy();
    // This build reached the till, so a previous bad start may no longer keep
    // automatic updates switched off.
    const resumed = updater.resume();
    if (resumed.resumed) console.log("[pos] automatic updates resumed after a healthy launch");
    return { ok: true, health: state, updatesResumed: resumed.resumed };
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

  ipcMain.handle("health:resume-updates", () => {
    health.reset();
    return updater.resume();
  });

  ipcMain.handle("health:retry", () => {
    health.reset();
    app.relaunch();
    app.exit(0);
  });

  ipcMain.handle("health:open-logs", () => shell.openPath(app.getPath("userData")));
  // One file a shop can attach to an email, instead of a folder of logs they
  // have to understand.
  ipcMain.handle("health:collect-diagnostics", () => {
    const result = diagnostics.writeReport({
      appVersion: app.getVersion(),
      driver: (() => {
        try {
          return pool.driverDiagnostics?.() ?? null;
        } catch {
          return null;
        }
      })(),
    });
    if (result.ok) shell.showItemInFolder(result.file);
    return result;
  });
  ipcMain.handle("health:quit", () => app.quit());

  ipcMain.handle("print:silent", async (_e, html, options) =>
    guard.guarded(async () => {
      const body = guard.text(html, { name: "receipt", max: 2 * 1024 * 1024 });
      const opts = guard.plainObject(options, { name: "print options" });
      const device = guard.shellSafeText(opts.deviceName, { name: "printer name" });
      const paper = guard.text(opts.paper, { name: "paper size", max: 32, allowEmpty: true });
      try {
        return await printSilent(body, device || undefined, paper || undefined, !!opts.dialog);
      } catch (err) {
        return fail(err);
      }
    }),
  );

  ipcMain.handle("print:raw", async (_e, bytes, options) =>
    guard.guarded(async () => {
    const payload = guard.bytes(bytes);
    const opts = guard.plainObject(options, { name: "print options" });
    try {
      const result = await printRaw(payload, {
        // Both reach a Windows command line, so no punctuation is allowed.
        deviceName: guard.shellSafeText(opts.deviceName, { name: "printer name" }),
        share: guard.shellSafeText(opts.share, { name: "printer share" }),
      });
      // No page fallback on purpose: rendering escape sequences through the
      // driver only produces a slip and never kicks the drawer.
      if (!result.ok) console.error("[pos] raw print failed:", result.error);
      return result;
    } catch (err) {
      return fail(err);
    }
    }),
  );

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

  ipcMain.handle("pos:connect", async (_e, rawConfig, cloud) => {
    let verified;
    let config;
    try {
      config = guard.connectionConfig(rawConfig);
    } catch (err) {
      return guard.refuse(err.message);
    }
    try {
      verified = await withTimeout(
        connectLocal(config),
        45_000,
        "The local database did not answer in time. Check the server name, instance and firewall.",
      );
      const saved = dbConfigStore.write(config);
      if (!saved.ok) console.warn("[pos] could not seal SQL config:", saved.error);
    } catch (err) {
      return { ok: false, ...pool.describeSqlError(err) };
    }
    // Cloud sync is started but never awaited: a slow or unreachable cloud must
    // not hold the setup wizard open. Its outcome arrives on pos:status-changed.
    Promise.resolve()
      .then(() => initializeWorker(withSealedCloud(cloud)))
      .catch(async (error) => {
        const message = fail(error).error;
        console.warn("[pos] cloud sync could not start:", message);
        broadcastStatus({ ...(await statusPayload()), cloudError: message });
      });
    return {
      ok: true,
      verified: true,
      activeDb: verified?.activeDb ?? config?.database ?? null,
      serverName: verified?.serverName ?? null,
      latencyMs: verified?.latencyMs ?? null,
    };
  });

  ipcMain.handle("pos:configure-cloud", async (_e, cloud) => {
    try {
      await initializeWorker(withSealedCloud(cloud));
      return { ok: true };
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("pos:test", async (_e, config) => {
    try {
      return await pool.test(guard.connectionConfig(config));
    } catch (err) {
      return { ok: false, ...pool.describeSqlError(err) };
    }
  });
  ipcMain.handle("pos:database-config", () => dbConfigStore.read());

  /**
   * Migration guard plus driver health, for the local database panel.
   *
   * A named instance with no pinned port cannot work on the direct path, so it
   * is reported here rather than failing silently at the first sale.
   */
  ipcMain.handle("pos:connection-audit", () => {
    const saved = dbConfigStore.read();
    const audit = pool.auditConnectionConfig(saved);
    const driver = pool.driverDiagnostics();
    return {
      ...audit,
      driver: {
        workers: driver.workers,
        maxWorkers: driver.maxWorkers,
        orphanedSessions: driver.sessions.unresolved,
        sessionWarning: driver.sessions.warn,
        crashTargets: driver.crashTargets,
        crashBlocked: driver.crashTargets.some((t) => t.blocked),
      },
    };
  });

  /*
    Escape hatch. Cancels any handshake still walking its ladder, closes both
    the administration and the operational pool, and forgets the sealed
    credentials so the wizard starts from a clean slate.
  */
  ipcMain.handle("pos:reconnect", async (_e, override) => {
    // An operator asking to reconnect is an explicit "try again": clear the
    // crash-loop block so the attempt is actually made.
    pool.resetDriverCrashState();
    try {
      return await reconnectNow(override);
    } catch (error) {
      return { ok: false, stage: "database", ...pool.describeSqlError(error) };
    }
  });

  /** Operator asked for an immediate background retry (non-blocking). */
  ipcMain.handle("pos:retry-connection", () => {
    scheduleReconnect(true);
    return { ok: true };
  });

  /**
   * Deletes the sealed credentials for good: cancels anything in flight, stops
   * the backoff loop (and keeps it stopped while the file is unlinked), then
   * reports a clean, unconfigured till.
   */
  async function removeStoredConnection() {
    reconnectSuppressed = true;
    stopReconnectLoop();
    lastConnectionError = null;
    lastConnectionDetail = null;
    try {
      await sqlAdmin.cancel();
    } catch {
      /* nothing was running */
    }
    try {
      await sqlAdmin.disconnect();
    } catch {
      /* already gone */
    }
    try {
      await pool.close();
    } catch {
      /* already gone */
    }
    pool.shutdownDrivers("connection-removed");
    pool.resetDriverCrashState();
    const cleared = dbConfigStore.remove();
    reconnectSuppressed = false;
    broadcastStatus({
      connected: false,
      reconnecting: false,
      configured: false,
      tables: [],
      queue: [],
      server: null,
      database: null,
      resolved: null,
      cloudConfigured: !!cloudConfig,
    });
    return {
      ok: cleared.ok !== false,
      stage: "forgotten",
      removed: cleared.removed === true,
      error: cleared.error ?? null,
    };
  }

  ipcMain.handle("pos:forget-connection", removeStoredConnection);
  ipcMain.handle("pos:remove-connection", removeStoredConnection);

  /*
    Schema lifecycle. Reading the master file is always safe; applying it only
    ever happens because an operator pressed the button in settings.
  */
  ipcMain.handle("pos:read-schema", () => pool.readSchema());
  ipcMain.handle("pos:apply-schema", async () => {
    try {
      return await pool.applySchemaNow();
    } catch (err) {
      return { ok: false, ...pool.describeSqlError(err) };
    }
  });
  /* Per-table schema manager: live status, selective repair, SQL export. */
  ipcMain.handle("pos:schema-status", async () => {
    try {
      return await pool.schemaStatus();
    } catch (err) {
      return { ok: false, ...pool.describeSqlError(err) };
    }
  });
  ipcMain.handle("pos:schema-inventory", async () => {
    try {
      return await pool.schemaInventory();
    } catch (err) {
      return { ok: false, ...pool.describeSqlError(err) };
    }
  });
  ipcMain.handle("pos:apply-schema-tables", async (_e, tables) => {
    try {
      return await pool.applySchemaTables(tables);
    } catch (err) {
      return { ok: false, ...pool.describeSqlError(err) };
    }
  });
  ipcMain.handle("pos:schema-table-sql", (_e, tables) => {
    try {
      return pool.schemaTableSql(tables);
    } catch (err) {
      return { ok: false, error: err?.message ?? "SQL could not be prepared" };
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

  /* ---------------- SSMS-style administration connection ---------------- */

  /*
    Every administration channel carries its own deadline. An IPC handler that
    never settles leaves the renderer spinning for ever with no way back, so a
    slow driver must always come back as a timeout result instead.
  */
  const bounded = async (ms, message, work, attemptId) => {
    const started = Date.now();
    try {
      return await withTimeout(Promise.resolve().then(work), ms, message);
    } catch (err) {
      return {
        ok: false,
        code: err?.code ?? "ETIMEOUT",
        stage: "driver",
        status: "timed_out",
        attemptId: attemptId ?? null,
        elapsedMs: Date.now() - started,
        error: fail(err).error,
        attempts: [],
      };
    }
  };

  /**
   * Administration is a privileged surface: the desktop process refuses every
   * one of these channels until an administrator has unlocked it here with
   * their own username and PIN. Hiding the screen in the window is not a
   * control — anything running in the window can call the bridge directly.
   */
  ipcMain.handle("admin:unlock", (_e, username, pin) =>
    adminSession.unlock(username, pin),
  );
  ipcMain.handle("admin:lock", () => adminSession.lock());
  ipcMain.handle("admin:status", () => adminSession.status());

  const admin = (work) => adminSession.requireAdmin(work);

  ipcMain.handle("sqladmin:connect", (_e, credentials) =>
    admin(() =>
      bounded(
        45_000,
        "The SQL driver did not finish the authentication handshake in time.",
        () => sqlAdmin.connectInstance(credentials),
        credentials?.attemptId ?? null,
      ),
    ),
  );
  ipcMain.handle("sqladmin:cancel", (_e, attemptId) =>
    admin(() =>
      bounded(5_000, "The cancel request did not finish in time.", () => sqlAdmin.cancel(attemptId)),
    ),
  );
  ipcMain.handle("sqladmin:probe-port", (_e, credentials) =>
    admin(() =>
      bounded(15_000, "The port probe did not finish in time.", () => sqlAdmin.probePort(credentials)),
    ),
  );
  ipcMain.handle("sqladmin:lock", (_e, credentials) =>
    admin(() =>
      bounded(45_000, "The database could not be opened in time.", () =>
        sqlAdmin.lockDatabase(credentials),
      ),
    ),
  );
  ipcMain.handle("sqladmin:databases", () =>
    admin(() =>
      bounded(15_000, "The database list did not arrive in time.", () => sqlAdmin.listDatabases()),
    ),
  );

  /* Write verification runs on the OPERATIONAL pool the till itself uses. */
  ipcMain.handle("pos:verify-write", () =>
    bounded(20_000, "The write check did not finish in time.", () => pool.verifyWrite()),
  );
  ipcMain.handle("sqladmin:tables", (_e, dbName) =>
    admin(() =>
      bounded(15_000, "The table list did not arrive in time.", () => sqlAdmin.getTables(dbName)),
    ),
  );
  ipcMain.handle("sqladmin:columns", (_e, dbName, tableName, schemaName) =>
    admin(() =>
      bounded(15_000, "The column list did not arrive in time.", () =>
        sqlAdmin.getTableColumns(dbName, tableName, schemaName),
      ),
    ),
  );
  ipcMain.handle("sqladmin:query", (_e, dbName, queryText) =>
    admin(() =>
      bounded(30_000, "The query did not finish in time.", () =>
        sqlAdmin.executeQuery(dbName, queryText),
      ),
    ),
  );
  ipcMain.handle("sqladmin:disconnect", () =>
    admin(() =>
      bounded(10_000, "The disconnect did not finish in time.", () => sqlAdmin.disconnect()),
    ),
  );
  // Reading whether a connection exists reveals nothing and is what the screen
  // uses to decide whether to ask for the unlock at all.
  ipcMain.handle("sqladmin:status", () =>
    bounded(5_000, "The connection status did not arrive in time.", () => sqlAdmin.status()),
  );

  /*
    Elevated schema repair. The operational POS login may read and write rows
    yet lack CREATE/ALTER rights; when the self-heal layer reports a
    permission failure the operator signs in once with a database
    administrator login and the guarded master-schema batches for the failing
    tables replay through that session. The repair session is torn down
    straight afterwards and the operational pool is never touched. Only
    batches parsed from database/schema.sql may run — the renderer supplies
    table names, never SQL.
  */
  ipcMain.handle("sqladmin:repair", async (_e, payload) =>
    admin(async () => {
    try {
      const tables = Array.isArray(payload?.tables) ? payload.tables : [];
      const database = String(payload?.database ?? "").trim();
      if (!tables.length) return { ok: false, stage: "prepare", error: "Choose at least one table." };
      if (!database) {
        return { ok: false, stage: "prepare", error: "The POS database name is missing." };
      }
      const got = pool.schemaTableBatches(tables);
      if (!got.batches?.length) {
        return { ok: false, stage: "prepare", error: got.error ?? "No repair statements found." };
      }
      const creds = payload?.credentials ?? {};
      const connect = await bounded(35_000, "The administrator sign-in did not finish in time.", () =>
        sqlAdmin.connectInstance({ ...creds, database: "master" }),
      );
      if (!connect?.ok) return { ok: false, stage: "connect", ...(connect ?? {}) };
      let repair;
      try {
        repair = await bounded(120_000, "The repair script did not finish in time.", () =>
          sqlAdmin.runRepair(database, got.batches),
        );
      } finally {
        await sqlAdmin.disconnect().catch(() => {});
      }
      if (!repair?.ok && !repair?.results) return { ok: false, stage: "repair", ...(repair ?? {}) };
      // The operational pool must forget what it cached about the schema.
      try {
        require("./db/repo.cjs").forgetColumnCache();
      } catch {
        /* repo not loaded yet */
      }
      return {
        ok: repair.ok,
        stage: "repair",
        ran: repair.ran,
        total: repair.total,
        repairedTables: got.tables,
        unknownTables: got.unknownTables,
        error: repair.error ?? null,
        results: repair.results,
      };
    } catch (err) {
      return { ok: false, stage: "repair", ...pool.describeSqlError(err) };
    }
  });

  ipcMain.handle("pos:write", async (_e, _context, op) =>
    guard.guarded(async () => {
      const checked = guard.writeOp(op);
      try {
        await repo.applyOp(checked);
        void worker.run();
        return { ok: true };
      } catch (err) {
        return fail(err);
      }
    }),
  );
  ipcMain.handle("pos:write-batch", async (_e, _context, ops) =>
    guard.guarded(async () => {
      const checked = guard.writeOps(ops);
      try {
        await repo.applyOps(checked);
        void worker.run();
        return { ok: true };
      } catch (err) {
        return fail(err);
      }
    }),
  );


  ipcMain.handle("pos:status", () => statusPayload());
  ipcMain.handle("pos:housekeep", async (_e, raw) => {
    try {
      const options = guard.options(raw, { name: "housekeeping options" });
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

  /* ------------------- missing SQL Server driver install --------------- */

  ipcMain.handle("driver:list", () => {
    try {
      return driverInstall.listDrivers();
    } catch (error) {
      return { ok: false, error: fail(error).error };
    }
  });
  ipcMain.handle("driver:install", async (_e, id) => {
    try {
      // Catalogue identifier only; never a path or a command.
      return await driverInstall.installDriver(
        guard.text(id, { name: "driver", max: 64, pattern: /^[A-Za-z0-9._-]+$/ }),
        {
          onProgress: (progress) => {
            for (const win of BrowserWindow.getAllWindows()) {
              win.webContents.send("driver:progress", progress);
            }
          },
        },
      );
    } catch (error) {
      if (error instanceof guard.BadArg) return guard.refuse(error.message);
      // The installer already reports its own failures; this is the last net.
      return { ok: false, code: "EFAILED", error: fail(error).error };
    }
  });

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
  ipcMain.handle("terminal:write", async (_e, raw) => {
    let config;
    try {
      config = guard.terminalConfig(raw);
    } catch (err) {
      return guard.refuse(err.message);
    }
    const result = terminalStore.write(config);
    if (!result.ok) return result;
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
      return {
        ok: true,
        value: localDb.getState(`setting:${String(key)}`),
        degraded: error.message,
      };
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
  ipcMain.handle("config:write", (_e, patch) =>
    guard.guarded(() => configStore.merge(guard.plainObject(patch, { name: "settings" }))),
  );
  ipcMain.handle("config:get", (_e, key) =>
    guard.guarded(() => ({ ok: true, value: configStore.get(guard.key(key)) })),
  );
  ipcMain.handle("config:set", (_e, key, value) =>
    guard.guarded(() => configStore.set(guard.key(key), value)),
  );
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
  }));
  ipcMain.handle("local:mirror", (_e, entity, rows) =>
    guard.guarded(() => ({
      ok: true,
      written: localDb.mirror(guard.key(entity, { name: "table" }), guard.list(rows ?? [], { name: "rows", max: 5000 })),
    })),
  );
  ipcMain.handle("local:list", (_e, entity, limit) =>
    guard.guarded(() => ({
      ok: true,
      rows: localDb.listMirror(
        guard.key(entity, { name: "table" }),
        Math.min(Math.max(Number(limit) || 500, 1), 5000),
      ),
    })),
  );
  ipcMain.handle("local:audit-log", (_e, entry) =>
    guard.guarded(() => ({
      ok: true,
      row: localDb.logAudit(guard.plainObject(entry, { name: "audit entry" })),
    })),
  );
  ipcMain.handle("local:audit-list", (_e, limit) =>
    guard.guarded(() => ({
      ok: true,
      rows: localDb.listAudit(Math.min(Math.max(Number(limit) || 200, 1), 2000)),
    })),
  );
  ipcMain.handle("local:audit-clear", () => {
    localDb.clearAudit();
    return { ok: true };
  });
  ipcMain.handle("local:rollback", (_e, op) =>
    guard.guarded(() => localDb.rollbackOp(guard.plainObject(op, { name: "entry" }))),
  );

  /* ---------------------- offline staff sign-in ---------------------- */
  ipcMain.handle("staff:roster", (_e, storeId) => ({
    ok: true,
    rows: localDb.listStaffRoster(storeId ? String(storeId) : ""),
  }));
  ipcMain.handle("staff:cache-roster", (_e, rows) => ({
    ok: true,
    written: localDb.upsertStaffRoster(Array.isArray(rows) ? rows : []),
  }));
  ipcMain.handle("staff:verify-pin", (_e, username, pin) =>
    staffAuth.verifyPin(String(username ?? ""), String(pin ?? "")),
  );
  ipcMain.handle("staff:remember-pin", (_e, username, pin) =>
    staffAuth.rememberPin(String(username ?? ""), String(pin ?? "")),
  );
  ipcMain.handle("staff:forget-pin", (_e, username) => ({
    ok: localDb.forgetStaffVerifier(String(username ?? "")),
  }));

  /* ---------------------- app server keys ---------------------- */
  // Presence only. No privileged credential is stored on this machine any
  // more; privileged work is answered by the hosted backend.
  ipcMain.handle("server-keys:status", () => ({ ok: true, ...serverKeys.status() }));

  /* ------- backend address this device talks to (non-secret) ------- */
  ipcMain.handle("backend:get", () => ({
    ok: true,
    url: String(configStore.get("backendUrl") ?? "").trim(),
  }));
  ipcMain.handle("backend:set", (_e, value) => {
    const next = String(value ?? "")
      .trim()
      .replace(/\/+$/, "");
    if (next && !/^https?:\/\/.+/i.test(next))
      return { ok: false, error: "Enter a full address starting with https://" };
    const saved = configStore.set("backendUrl", next || null);
    if (saved && saved.ok === false) return saved;
    return { ok: true, url: next };
  });

  /* ------------- tenant cloud credentials (OS-sealed store) ------------- */

  ipcMain.handle("cloud:status", () => ({ ok: true, ...cloudCredentials.status() }));
  // Boot-time read so the renderer can point its own client at the tenant.
  // The key crosses the bridge only into this device's renderer, never to disk.
  ipcMain.handle("cloud:bootstrap", () => {
    const saved = cloudCredentials.read();
    return saved ? { ok: true, url: saved.url, key: saved.key } : { ok: false };
  });
  ipcMain.handle("cloud:set", async (_e, value) => {
    const saved = cloudCredentials.write(value);
    if (saved.ok === false) return saved;
    try {
      // Hot-switch the sync worker to the new tenant without an app restart.
      const sealed = cloudCredentials.read();
      if (sealed) {
        await initializeWorker({ ...(cloudConfig ?? {}), url: sealed.url, key: sealed.key });
      } else {
        worker.stop();
        cloudConfig = null;
      }
      broadcastStatus(await statusPayload());
    } catch (err) {
      return fail(err);
    }
    return { ok: true, ...cloudCredentials.status() };
  });
  ipcMain.handle("cloud:remove", async () => {
    const removed = cloudCredentials.remove();
    worker.stop();
    cloudConfig = null;
    broadcastStatus(await statusPayload());
    return removed;
  });
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
  // Operator-triggered history restore; never runs on the sync timer.
  ipcMain.handle("pos:restore", (_e, options) =>
    guard.guarded(() => worker.restore(guard.options(options, { name: "restore options" }))),
  );
  ipcMain.handle("pos:restore-status", () => worker.restoreStatus());
  // Rebuild check: counts only, safe at any time.
  ipcMain.handle("pos:restore-verify", (_e, options) =>
    guard.guarded(() => worker.verifyRestore(guard.options(options, { name: "restore options" }))),
  );
  // The drill: a real wipe and restore, guarded and reversible.
  ipcMain.handle("pos:restore-drill", (_e, options) =>
    guard.guarded(() => worker.restoreDrill(guard.options(options, { name: "restore options" }))),
  );
  ipcMain.handle("pos:restore-evidence", () => worker.restoreEvidence());

  /**
   * The sync contract, as the till actually runs it.
   *
   * The coverage screen compares what each feature says its data needs
   * against these three lists, so a table that was added to a feature but
   * never added to the sync loop shows up as a gap instead of being noticed
   * after a wipe.
   */
  ipcMain.handle("pos:sync-contract", () => {
    const name = (t) => (typeof t === "string" ? t : t?.table);
    return {
      push: repo.PUSH_TABLES.slice(),
      pull: [...repo.CATALOGUE_TABLES, ...repo.SCOPED_PULL_TABLES.map(name)].filter(Boolean),
      restore: repo.RESTORE_TABLES.map(name).filter(Boolean),
    };
  });

  ipcMain.handle("pos:set-sync-enabled", (_e, on) => worker.setEnabled(on));

  /* ---- shop side of the server/shop data comparison ---- */
  ipcMain.handle("pos:compare-summary", async (_e, options) => {
    try {
      return { ok: true, tables: await repo.compareSummary(guard.options(options, { name: "comparison options" })) };
    } catch (err) {
      return fail(err);
    }
  });
  ipcMain.handle("pos:compare-rows", async (_e, table, options) => {
    try {
      return {
        ok: true,
        rows: await repo.compareRows(
          guard.key(table, { name: "table name" }),
          guard.options(options, { name: "comparison options" }),
        ),
      };
    } catch (err) {
      return fail(err);
    }
  });
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
      // A destination chosen in the window must still be a plain local file.
      let destination = target ? guard.filePath(target, { name: "backup file", extension: "bak" }) : "";
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
  // A second launch (double-clicked shortcut) surfaces the running till
  // instead of doing nothing.
  app.on("second-instance", () => {
    const win = mainWindow ?? BrowserWindow.getAllWindows()[0];
    if (!win || win.isDestroyed()) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });
  // Keep only what the till needs: Chromium scratch is dropped on every
  // launch, and completely on the first launch after an update. Identity,
  // configuration and the local mirror are never touched.
  try {
    const hygiene = storageHygiene.runOnLaunch(app.getPath("userData"), app.getVersion());
    if (DEBUG) console.log("[pos] storage hygiene:", hygiene);
  } catch (error) {
    if (DEBUG) console.warn("[pos] storage hygiene skipped:", fail(error).error);
  }
  const engine = localDb.init(app.getPath("userData"));
  if (DEBUG) console.log("[pos] local database:", engine.engine, engine.path);
  registerIpc();
  const boot = health.beginBoot();
  if (health.shouldEnterSafeMode(boot)) {
    safeMode = true;
    // Clear the pending marker at once: time spent in recovery must never be
    // counted as further failed launches, or the till can never leave it.
    health.beginRecovery(boot.reason ?? "Repeated failed launches");
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
  // Cloud sync boots straight from the OS-sealed store — the till never waits
  // for a renderer to hand credentials over before the worker can start.
  const sealedCloud = cloudCredentials.read();
  if (sealedCloud) {
    void initializeWorker({ url: sealedCloud.url, key: sealedCloud.key }).catch((error) => {
      console.warn("[pos] cloud sync could not start from saved keys:", fail(error).error);
    });
  }
  // One-time migration from the legacy general config into the dedicated,
  // OS-encrypted SQL store. Afterwards there is one canonical copy only.
  let savedDbConfig = dbConfigStore.read();
  const legacyDbConfig = configStore.get("localDb");
  if (!savedDbConfig && legacyDbConfig) {
    const migrated = dbConfigStore.write(legacyDbConfig);
    if (migrated.ok) {
      savedDbConfig = legacyDbConfig;
      configStore.set("localDb", null);
    }
  } else if (savedDbConfig && legacyDbConfig) {
    configStore.set("localDb", null);
  }
  if (savedDbConfig) {
    // Never awaited: the register must be on screen and healthy before the
    // database is reached for, so a bad saved connection can no longer end on
    // the "POS did not start correctly" screen.
    const audit = pool.auditConnectionConfig(savedDbConfig);
    if (!audit.ok) {
      pool.logConnection("config.audit", { issues: audit.issues.map((i) => i.code) });
    }
    void connectLocal(savedDbConfig).catch((error) => {
      lastConnectionDetail = pool.describeSqlError(error);
      lastConnectionError = lastConnectionDetail.error ?? fail(error).error;
      console.error("[pos] automatic SQL reconnect failed:", lastConnectionError);
      scheduleReconnect();
    });
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

app.on("before-quit", () => {
  closeCustomerDisplay();
});

app.on("window-all-closed", async () => {
  if (readyWatchdog) clearTimeout(readyWatchdog);
  worker.stop();
  if (reconnectTimer) clearTimeout(reconnectTimer);
  updater.stop();
  stopAppServer();
  await pool.close();
  await sqlAdmin.disconnect().catch(() => {});
  pool.shutdownDrivers("app-exit");
  if (process.platform !== "darwin") app.quit();
});
