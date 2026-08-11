const { contextBridge, ipcRenderer } = require("electron");

/**
 * The only surface the renderer gets. No Node, no direct SQL Server access —
 * every call crosses IPC into the main process.
 */
const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld("pos", {
  write: (context, op) => invoke("pos:write", context, op),
  connect: (config, cloud) => invoke("pos:connect", config, cloud),
  configureCloud: (cloud) => invoke("pos:configure-cloud", cloud),
  test: (config) => invoke("pos:test", config),
  status: () => invoke("pos:status"),
  /** Silent receipt printing — no Windows print dialog. */
  print: (html, options) => invoke("print:silent", html, options),
  /** Raw ESC/POS bytes (cash drawer kick) straight to the printer. */
  printRaw: (bytes, options) => invoke("print:raw", bytes, options),
  listPrinters: () => invoke("print:list"),
  push: () => invoke("pos:push"),
  pull: () => invoke("pos:pull"),
  setSyncEnabled: (on) => invoke("pos:set-sync-enabled", on),
  backup: (path) => invoke("pos:backup", path),
  retryErrored: () => invoke("pos:retry-errored"),
  snapshot: () => invoke("pos:snapshot"),
  /* auto-update */
  appVersion: () => invoke("app:version"),
  updateStatus: () => invoke("update:status"),
  checkForUpdates: () => invoke("update:check"),
  installUpdate: () => invoke("update:install"),
  onUpdateStatus: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on("update:status", handler);
    return () => ipcRenderer.removeListener("update:status", handler);
  },
  /* activation mirror that survives updates */
  readTerminalConfig: () => invoke("terminal:read"),
  writeTerminalConfig: (config) => invoke("terminal:write", config),
  /* device settings held in the branch SQL database */
  getSetting: (key) => invoke("settings:get", key),
  setSetting: (key, value) => invoke("settings:set", key, value),
  /* branding mirror — survives updates and cleared browser storage */
  readBranding: () => invoke("branding:read"),
  writeBranding: (branding) => invoke("branding:write", branding),
  /* in-window title bar buttons */
  minimizeWindow: () => invoke("window:minimize"),
  toggleMaximizeWindow: () => invoke("window:maximize"),
  closeWindow: () => invoke("window:close"),
  isWindowMaximized: () => invoke("window:is-maximized"),
  onWindowState: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on("window:state", handler);
    return () => ipcRenderer.removeListener("window:state", handler);
  },
  /* boot health / safe mode */
  reportReady: () => invoke("app:ready"),
  healthState: () => invoke("health:state"),
  rollbackNow: () => invoke("health:rollback"),
  onStatus: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on("pos:status-changed", handler);
    return () => ipcRenderer.removeListener("pos:status-changed", handler);
  },
});

/**
 * Database surface used by the register. Checkout runs 100% offline through
 * these calls — never over HTTP.
 */
contextBridge.exposeInMainWorld("electronAPI", {
  createSale: (payload) => invoke("db:create-sale", payload),
  getProducts: () => invoke("db:get-products"),
  getPendingSyncCount: () => invoke("db:get-pending-sync-count"),
  getBranch: () => invoke("db:get-branch"),
  setBranch: (branch) => invoke("db:set-branch", branch),
});