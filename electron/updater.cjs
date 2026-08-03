/**
 * Background auto-update for the Windows till.
 *
 * The feed is configured at build time through POS_UPDATE_FEED:
 *   - "github"                          → GitHub releases (POS_UPDATE_REPO="owner/name")
 *   - any https URL                     → generic static folder hosting the
 *                                         installer + latest.yml
 * Updates download in the background and are only applied when the operator
 * restarts, so a shift is never interrupted.
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { app, BrowserWindow, net } = require("electron");

const SIX_HOURS = 6 * 60 * 60 * 1000;

/** Update folder used when nothing else is configured or baked in. */
const DEFAULT_FEED_URL = "https://updatecms.luckycharmsdnbhd.com/pos-app/";

let autoUpdater = null;
let state = { status: "idle", version: app.getVersion(), percent: 0, error: null };
let timer = null;
let paused = false;

function broadcast() {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send("update:status", state);
  }
}

function set(patch) {
  state = { ...state, ...patch };
  broadcast();
}

function feed() {
  const configured = (process.env.POS_UPDATE_FEED || "").trim();
  if (!configured) return bakedFeed() || { provider: "generic", url: DEFAULT_FEED_URL };
  if (configured.toLowerCase() === "github") {
    const repo = (process.env.POS_UPDATE_REPO || "").trim();
    if (!repo.includes("/")) return null;
    const [owner, name] = repo.split("/");
    return { provider: "github", owner, repo: name };
  }
  if (/^https?:\/\//i.test(configured)) return { provider: "generic", url: configured };
  return null;
}

/**
 * Feed baked into the installer at build time (electron-builder writes
 * app-update.yml from the `build.publish` config). Used when no
 * POS_UPDATE_FEED env var overrides it.
 */
function bakedFeed() {
  try {
    const file = path.join(process.resourcesPath || "", "app-update.yml");
    const text = fs.readFileSync(file, "utf8");
    const url = /^\s*url:\s*(.+)\s*$/m.exec(text)?.[1]?.trim().replace(/^["']|["']$/g, "");
    const owner = /^\s*owner:\s*(.+)\s*$/m.exec(text)?.[1]?.trim();
    const repo = /^\s*repo:\s*(.+)\s*$/m.exec(text)?.[1]?.trim();
    if (owner && repo) return { provider: "github", owner, repo };
    if (url && /^https?:\/\//i.test(url) && !/updates\.example\.com/i.test(url))
      return { provider: "generic", url };
  } catch {
    /* not packaged, or no feed baked in */
  }
  return null;
}

function load() {
  if (autoUpdater) return autoUpdater;
  try {
    ({ autoUpdater } = require("electron-updater"));
  } catch {
    set({ status: "unavailable", error: "Auto-update is not bundled in this build." });
    return null;
  }
  const target = feed();
  if (!target) {
    set({ status: "unavailable", error: "No update feed is configured for this build." });
    autoUpdater = null;
    return null;
  }
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.setFeedURL(target);
  autoUpdater.on("checking-for-update", () => set({ status: "checking", error: null }));
  autoUpdater.on("update-not-available", () => set({ status: "current", percent: 0 }));
  autoUpdater.on("update-available", (info) =>
    set({ status: "downloading", percent: 0, available: info?.version ?? null }),
  );
  autoUpdater.on("download-progress", (p) => set({ status: "downloading", percent: Math.round(p.percent || 0) }));
  autoUpdater.on("update-downloaded", (info) =>
    set({ status: "ready", percent: 100, available: info?.version ?? null }),
  );
  autoUpdater.on("error", (err) => set({ status: "error", error: String(err?.message || err) }));
  return autoUpdater;
}

async function check() {
  const updater = load();
  if (!updater) return state;
  if (paused) return state;
  if (!app.isPackaged) {
    set({ status: "unavailable", error: "Updates only run in the installed app." });
    return state;
  }
  try {
    await updater.checkForUpdates();
  } catch (err) {
    set({ status: "error", error: String(err?.message || err) });
  }
  return state;
}

function install() {
  if (state.status !== "ready" || !autoUpdater) return { ok: false, error: "No update is ready." };
  setImmediate(() => autoUpdater.quitAndInstall(false, true));
  return { ok: true };
}

function start() {
  if (paused) return;
  void check();
  timer = setInterval(() => void check(), SIX_HOURS);
  if (timer.unref) timer.unref();
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

/** Safe mode calls this so a broken build cannot keep reinstalling itself. */
function pause() {
  paused = true;
  stop();
}

/* ------------------------------ rollback ------------------------------ */

const artifact = (version) => `${app.getName()} Setup ${version}.exe`;

/** Where the installer for a given version lives on the configured feed. */
function rollbackUrl(version) {
  const target = feed();
  if (!target) return null;
  const file = encodeURIComponent(artifact(version));
  if (target.provider === "github") {
    return `https://github.com/${target.owner}/${target.repo}/releases/download/v${version}/${file}`;
  }
  return `${target.url.replace(/\/+$/, "")}/${file}`;
}

function download(url, destination, onProgress) {
  return new Promise((resolve, reject) => {
    const request = net.request({ url, redirect: "follow" });
    request.on("response", (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Download failed (HTTP ${response.statusCode})`));
        response.resume?.();
        return;
      }
      const total = Number(response.headers["content-length"] || 0);
      let received = 0;
      const out = fs.createWriteStream(destination);
      response.on("data", (chunk) => {
        received += chunk.length;
        out.write(chunk);
        if (total && onProgress) onProgress(Math.round((received / total) * 100));
      });
      response.on("end", () => out.end(() => resolve(destination)));
      response.on("error", reject);
    });
    request.on("error", reject);
    request.end();
  });
}

/**
 * Fetch the installer for an earlier version and run it silently. NSIS
 * reinstalls in place, so the user-data folder — activation mirror, settings,
 * local database pointer — is left alone.
 */
async function rollback(version, onProgress) {
  if (!version) return { ok: false, error: "No earlier version has been recorded yet." };
  if (process.platform !== "win32")
    return { ok: false, error: "Roll back is only supported on Windows." };
  const url = rollbackUrl(version);
  if (!url) return { ok: false, error: "No update feed is configured for this build." };
  const file = path.join(os.tmpdir(), `pos-rollback-${version}.exe`);
  try {
    await download(url, file, onProgress);
  } catch (err) {
    return { ok: false, error: `Could not download version ${version}: ${err?.message || err}` };
  }
  try {
    spawn(file, ["/S"], { detached: true, stdio: "ignore", windowsHide: true }).unref();
  } catch (err) {
    return { ok: false, error: `Could not start the installer: ${err?.message || err}` };
  }
  setTimeout(() => app.quit(), 1500);
  return { ok: true, version };
}

module.exports = { start, stop, pause, check, install, rollback, status: () => state };