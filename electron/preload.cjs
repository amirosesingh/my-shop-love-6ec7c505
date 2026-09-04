const { contextBridge, ipcRenderer } = require("electron");

/**
 * The only surface the renderer gets. No Node, no direct SQL Server access —
 * every call crosses IPC into the main process.
 */
const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld("pos", {
  write: (context, op) => invoke("pos:write", context, op),
  writeBatch: (context, ops) => invoke("pos:write-batch", context, ops),
  connect: (config, cloud) => invoke("pos:connect", config, cloud),
  configureCloud: (cloud) => invoke("pos:configure-cloud", cloud),
  test: (config) => invoke("pos:test", config),
  getDatabaseConfig: () => invoke("pos:database-config"),
  getConnectionAudit: () => invoke("pos:connection-audit"),
  /**
   * Tear both pools down and open the connection again — no restart. Pass the
   * values currently on screen to retry those instead of the sealed file.
   */
  reconnect: (override) => invoke("pos:reconnect", override),
  /** Ask the background loop for an immediate attempt. */
  retryConnection: () => invoke("pos:retry-connection"),
  /** Forget the saved SQL Server connection and drop every pool. */
  forgetConnection: () => invoke("pos:forget-connection"),
  resetConnection: () => invoke("pos:forget-connection"),
  /** Delete the sealed credentials file and stop the background retry loop. */
  removeConnection: () => invoke("pos:remove-connection"),

  /* schema lifecycle — read is passive, apply needs an operator click */
  readSchema: () => invoke("pos:read-schema"),
  applySchema: () => invoke("pos:apply-schema"),
  /** Per-table schema manager: live comparison against the connected database. */
  schemaStatus: () => invoke("pos:schema-status"),
  /** Deep read-only inventory: nullability, keys, constraints, indexes, triggers. */
  schemaInventory: () => invoke("pos:schema-inventory"),
  /** Repair only the selected tables (guarded batches, never drops data). */
  applySchemaTables: (tables) => invoke("pos:apply-schema-tables", tables),
  /** Runnable SQL script for the chosen tables (empty array = full file). */
  schemaTableSql: (tables) => invoke("pos:schema-table-sql", tables),
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
  /** Operator-triggered restore of this branch's trading history. */
  restore: (options) => invoke("pos:restore", options),
  restoreStatus: () => invoke("pos:restore-status"),
  /** Rebuild check — would this till come back? Counts only, changes nothing. */
  restoreVerify: (options) => invoke("pos:restore-verify", options),
  /** The drill: wipe this branch's history and restore it, with a copy kept. */
  restoreDrill: (options) => invoke("pos:restore-drill", options),
  restoreEvidence: () => invoke("pos:restore-evidence"),
  /** Which tables this till pushes, pulls and can restore. */
  syncContract: () => invoke("pos:sync-contract"),

  setSyncEnabled: (on) => invoke("pos:set-sync-enabled", on),
  /** Live per-table counts for the server/shop comparison page. */
  compareSummary: (options) => invoke("pos:compare-summary", options),
  compareRows: (table, options) => invoke("pos:compare-rows", table, options),
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
  /* one-click install of a missing Microsoft SQL Server driver */
  listDrivers: () => invoke("driver:list"),
  installDriver: (id) => invoke("driver:install", id),
  onDriverProgress: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on("driver:progress", handler);
    return () => ipcRenderer.removeListener("driver:progress", handler);
  },
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
  /* embedded local database (mirror + audit ledger). Offline sales live in
     the branch SQL Server outbox — there is deliberately no second queue. */
  localInfo: () => invoke("local:info"),
  localMirror: (entity, rows) => invoke("local:mirror", entity, rows),
  localList: (entity, limit) => invoke("local:list", entity, limit),
  localAuditLog: (entry) => invoke("local:audit-log", entry),
  localAuditList: (limit) => invoke("local:audit-list", limit),
  localAuditClear: () => invoke("local:audit-clear"),
  /** Undo a discarded queued change in the local copy. */
  localRollback: (op) => invoke("local:rollback", op),
  /** Read-only relationship check against the local mirror (offline). */
  localRelationalHealth: () => invoke("local:relational-health"),
  /* offline cashier sign-in against the local database */
  staffRoster: (storeId) => invoke("staff:roster", storeId),
  cacheStaffRoster: (rows) => invoke("staff:cache-roster", rows),
  verifyStaffPin: (username, pin) => invoke("staff:verify-pin", username, pin),
  rememberStaffPin: (username, pin) => invoke("staff:remember-pin", username, pin),
  forgetStaffPin: (username) => invoke("staff:forget-pin", username),
  /* presence check only — no privileged key is kept on this machine */
  serverKeyStatus: () => invoke("server-keys:status"),
  /* address of the hosted backend this device talks to (non-secret) */
  backendUrl: () => invoke("backend:get"),
  setBackendUrl: (value) => invoke("backend:set", value),
  /* tenant cloud credentials sealed in the OS vault (DPAPI) */
  cloudKeyStatus: () => invoke("cloud:status"),
  bootstrapCloudCredentials: () => invoke("cloud:bootstrap"),
  setCloudCredentials: (value) => invoke("cloud:set", value),
  removeCloudCredentials: () => invoke("cloud:remove"),
  onCloudSetupRequired: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on("cloud:setup-required", handler);
    return () => ipcRenderer.removeListener("cloud:setup-required", handler);
  },
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
  openLogFolder: () => invoke("health:open-logs"),
  collectDiagnostics: () => invoke("health:collect-diagnostics"),
  onStatus: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on("pos:status-changed", handler);
    return () => ipcRenderer.removeListener("pos:status-changed", handler);
  },
  /* The till has stopped because its own records or identity are unsound. */
  onFatal: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on("app:fatal", handler);
    return () => ipcRenderer.removeListener("app:fatal", handler);
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
  // Administration is refused by the desktop process until it is unlocked
  // here with an administrator's own username and PIN.
  unlock: (username, pin) => invoke("admin:unlock", username, pin),
  lockAdmin: () => invoke("admin:lock"),
  adminStatus: () => invoke("admin:status"),
  // Emergency Access: the desktop process re-checks the clock code itself.
  recoveryUnlock: (code) => invoke("admin:recovery-unlock", code),
  recoveryLock: () => invoke("admin:recovery-lock"),
  connectInstance: (credentials) => invoke("sqladmin:connect", credentials),
  cancel: (attemptId) => invoke("sqladmin:cancel", attemptId),
  probePort: (credentials) => invoke("sqladmin:probe-port", credentials),
  lockDatabase: (credentials) => invoke("sqladmin:lock", credentials),
  listDatabases: () => invoke("sqladmin:databases"),
  getTables: (dbName) => invoke("sqladmin:tables", dbName),
  getTableColumns: (dbName, tableName, schemaName) =>
    invoke("sqladmin:columns", dbName, tableName, schemaName),
  executeQuery: (dbName, queryText) => invoke("sqladmin:query", dbName, queryText),
  repair: (payload) => invoke("sqladmin:repair", payload),
  disconnect: () => invoke("sqladmin:disconnect"),
  status: () => invoke("sqladmin:status"),
});
