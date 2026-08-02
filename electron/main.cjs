const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const net = require("node:net");
const { spawn } = require("node:child_process");
const { app, BrowserWindow, ipcMain, screen, dialog } = require("electron");

const pool = require("./db/pool.cjs");
const repo = require("./db/repo.cjs");
const worker = require("./sync/worker.cjs");

const DEV_URL = process.env.VITE_DEV_SERVER_URL;
const DEBUG = process.env.POS_DEBUG === "1";

/** Built Node server produced by `DESKTOP_BUILD=1 vite build`. */
const serverEntry = path.join(__dirname, "..", "dist-desktop", "server", "index.mjs");

let mainWindow = null;
let displayWindow = null;
let serverProcess = null;
let baseUrl = DEV_URL || null;

/* ------------------------- local app server ------------------------- */

function freePort() {
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
  const port = await freePort();
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
    // Frameless shell: Windows still draws the real minimise / maximise /
    // close buttons through the overlay, so the app owns the whole surface.
    titleBarStyle: "hidden",
    ...(process.platform === "darwin"
      ? { trafficLightPosition: { x: 12, y: 12 } }
      : {
          titleBarOverlay: { color: "#0b0b0c", symbolColor: "#e7e7ea", height: 34 },
        }),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  instrument(mainWindow, "/");
  void load(mainWindow, "/");
  mainWindow.once("ready-to-show", () => mainWindow.show());

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

const fail = (err) => ({ ok: false, error: err instanceof Error ? err.message : String(err) });

/* ----------------------------- printing ----------------------------- */

/**
 * Renders receipt HTML offscreen and prints it without any dialog. When no
 * printer name is configured the system default is used.
 */
function printSilent(html, deviceName) {
  return new Promise((resolve) => {
    const win = new BrowserWindow({
      show: false,
      webPreferences: { offscreen: true, contextIsolation: true, nodeIntegration: false },
    });
    const done = (result) => {
      if (!win.isDestroyed()) win.destroy();
      resolve(result);
    };
    win.webContents.once("did-finish-load", () => {
      // Small settle delay so fonts/QR SVG are laid out before the snapshot.
      setTimeout(() => {
        win.webContents.print(
          {
            silent: true,
            printBackground: true,
            margins: { marginType: "none" },
            ...(deviceName ? { deviceName } : {}),
          },
          (success, reason) => done(success ? { ok: true } : { ok: false, error: reason }),
        );
      }, 120);
    });
    win.webContents.once("did-fail-load", (_e, code, description) =>
      done({ ok: false, error: `${description} (${code})` }),
    );
    void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  });
}

/**
 * Writes raw ESC/POS bytes to the printer. Drawers are wired to the receipt
 * printer over RJ11, so the kick pulse has to reach the device unprocessed —
 * a driver-rendered page would swallow it.
 */
function printRaw(bytes, share) {
  return new Promise((resolve) => {
    const buffer = Buffer.from(bytes);
    const file = path.join(os.tmpdir(), `pos-raw-${Date.now()}.bin`);
    fs.writeFileSync(file, buffer);
    const cleanup = () => {
      try {
        fs.unlinkSync(file);
      } catch {
        /* temp file already gone */
      }
    };
    if (process.platform !== "win32") {
      cleanup();
      resolve({ ok: false, error: "Raw printing is only supported on Windows" });
      return;
    }
    const target = share && share.startsWith("\\\\") ? share : `\\\\localhost\\${share || "POS"}`;
    const child = spawn("cmd", ["/c", "copy", "/b", file, target], { windowsHide: true });
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += String(d)));
    child.on("error", (err) => {
      cleanup();
      resolve(fail(err));
    });
    child.on("exit", (code) => {
      cleanup();
      resolve(code === 0 ? { ok: true } : { ok: false, error: stderr.trim() || `copy exited ${code}` });
    });
  });
}

function registerIpc() {
  ipcMain.handle("print:silent", async (_e, html, options) => {
    try {
      return await printSilent(String(html), options?.deviceName || undefined);
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle("print:raw", async (_e, bytes, options) => {
    try {
      const result = await printRaw(bytes, options?.share || options?.deviceName);
      if (result.ok) return result;
      // Fall back to a silent one-line page carrying the same escape sequence,
      // which still avoids any print dialog.
      return await printSilent(
        `<!doctype html><meta charset="utf-8"><body style="margin:0"><pre style="font-size:1px;line-height:1px">${Buffer.from(
          bytes,
        ).toString("binary")}</pre></body>`,
        options?.deviceName || undefined,
      );
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

  ipcMain.handle("pos:connect", async (_e, config) => {
    try {
      await pool.connect(config);
      worker.init({
        url: process.env.SUPABASE_URL ?? config.cloudUrl,
        key: process.env.SUPABASE_PUBLISHABLE_KEY ?? config.cloudKey,
        onChange: async () => broadcastStatus(await worker.status()),
      });
      worker.start();
      return { ok: true };
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle("pos:test", async (_e, config) => {
    try {
      return await pool.test(config);
    } catch (err) {
      return fail(err);
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
  registerIpc();
  try {
    if (!baseUrl) baseUrl = await startAppServer();
  } catch (err) {
    console.error(err);
    dialog.showErrorBox("Cannot start the POS", err instanceof Error ? err.message : String(err));
    app.quit();
    return;
  }
  createWindows();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindows();
  });
});

app.on("window-all-closed", async () => {
  worker.stop();
  stopAppServer();
  await pool.close();
  if (process.platform !== "darwin") app.quit();
});