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
  getDatabaseConfig: () => invoke("pos:database-config"),
  /** Forget the saved SQL Server connection and drop every pool. */
  resetConnection: () => invoke("pos:reset-connection"),
  /* schema lifecycle — read is passive, apply needs an operator click */
  readSchema: () => invoke("pos:read-schema"),
  applySchema: () => invoke("pos:apply-schema"),
  /** Discover SQL Server instances on this machine and the local network. */
  scanNetwork: () => invoke("pos:scan-network"),
  scanLocalDatabases: () => invoke("pos:scan-network"),
  /** Registry + loopback discovery of instances installed on this PC. */
  scanLocalInstances: () => invoke("db:scan-local-instances"),
  status: () => invoke("pos:status"),
  /** Transactional write probe on the operational pool (always rolled back). */
  verifyWrite: () => invoke("pos:verify-write"),
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
  retryRow: (table, id) => invoke("pos:retry-row", table, id),
  discardRow: (table, id) => invoke("pos:discard-row", table, id),
  snapshot: () => invoke("pos:snapshot"),
  /** Prune confirmed rows and orphaned temp files. */
  housekeep: (options) => invoke("pos:housekeep", options),
  /* auto-update */
  appVersion: () => invoke("app:version"),
  /* update-feed HTTP that is not subject to the window's CORS rules */
  netGetJson: (url) => invoke("net:get-json", url),
  netHead: (url) => invoke("net:head", url),
  netGetBinary: (url) => invoke("net:get-binary", url),
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
  /* permanent configuration in userData/pos_config.json */
  readConfig: () => invoke("config:read"),
  writeConfig: (patch) => invoke("config:write", patch),
  getConfig: (key) => invoke("config:get", key),
  setConfig: (key, value) => invoke("config:set", key, value),
  resetConfig: () => invoke("config:reset"),
  /* embedded local database (mirror + offline outbox + audit ledger) */
  localInfo: () => invoke("local:info"),
  localMirror: (entity, rows) => invoke("local:mirror", entity, rows),
  localList: (entity, limit) => invoke("local:list", entity, limit),
  localEnqueue: (entity, payload) => invoke("local:enqueue", entity, payload),
  localPending: (limit) => invoke("local:pending", limit),
  localMark: (id, status, error) => invoke("local:mark", id, status, error),
  localAuditLog: (entry) => invoke("local:audit-log", entry),
  localAuditList: (limit) => invoke("local:audit-list", limit),
  localAuditClear: () => invoke("local:audit-clear"),
  /** Undo a discarded queued change in the local copy. */
  localRollback: (op) => invoke("local:rollback", op),
  /** Read-only relationship check against the local mirror (offline). */
  localRelationalHealth: () => invoke("local:relational-health"),
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

/**
 * SSMS-style administration surface. A pool separate from the operational one
 * so browsing schema never interferes with sales or sync.
 */
contextBridge.exposeInMainWorld("sqlAdmin", {
  connectInstance: (credentials) => invoke("sqladmin:connect", credentials),
  cancel: (attemptId) => invoke("sqladmin:cancel", attemptId),
  probePort: (credentials) => invoke("sqladmin:probe-port", credentials),
  lockDatabase: (credentials) => invoke("sqladmin:lock", credentials),
  listDatabases: () => invoke("sqladmin:databases"),
  getTables: (dbName) => invoke("sqladmin:tables", dbName),
  getTableColumns: (dbName, tableName, schemaName) =>
    invoke("sqladmin:columns", dbName, tableName, schemaName),
  executeQuery: (dbName, queryText) => invoke("sqladmin:query", dbName, queryText),
  disconnect: () => invoke("sqladmin:disconnect"),
  status: () => invoke("sqladmin:status"),
});