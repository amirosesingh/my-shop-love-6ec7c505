/**
 * Safe-mode window.
 *
 * Opened instead of the till when two consecutive launches failed to reach the
 * UI, or when the local app server cannot start at all. It is a plain local
 * page with its own preload, so it still works when the app bundle itself is
 * the thing that is broken.
 */
const path = require("node:path");
const { BrowserWindow } = require("electron");

let win = null;

function open() {
  if (win && !win.isDestroyed()) {
    win.focus();
    return win;
  }
  win = new BrowserWindow({
    width: 760,
    height: 620,
    backgroundColor: "#0b0b0c",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "recovery-preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  void win.loadFile(path.join(__dirname, "recovery.html"));
  win.on("closed", () => {
    win = null;
  });
  return win;
}

const isOpen = () => Boolean(win && !win.isDestroyed());

/** True when this window is the repair window, so it is never torn down with the till. */
const isOwn = (candidate) => isOpen() && candidate === win;


function progress(payload) {
  if (isOpen()) win.webContents.send("health:progress", payload);
}

function close() {
  if (isOpen()) win.close();
  win = null;
}

module.exports = { open, close, progress, isOpen };
