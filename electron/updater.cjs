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
const { app, BrowserWindow } = require("electron");

const SIX_HOURS = 6 * 60 * 60 * 1000;

let autoUpdater = null;
let state = { status: "idle", version: app.getVersion(), percent: 0, error: null };
let timer = null;

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
  if (!configured) return null;
  if (configured.toLowerCase() === "github") {
    const repo = (process.env.POS_UPDATE_REPO || "").trim();
    if (!repo.includes("/")) return null;
    const [owner, name] = repo.split("/");
    return { provider: "github", owner, repo: name };
  }
  if (/^https?:\/\//i.test(configured)) return { provider: "generic", url: configured };
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
  void check();
  timer = setInterval(() => void check(), SIX_HOURS);
  if (timer.unref) timer.unref();
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { start, stop, check, install, status: () => state };