/**
 * Who may call which desktop channel.
 *
 * The window renders application code, so a hidden button is not a control:
 * anything running in the window can call the bridge directly. Every channel is
 * therefore classified here, and the desktop process refuses a call that the
 * caller has not earned — using the one administrator/supervisor unlock that
 * already exists on the till (`admin-session.cjs`), never a second role store.
 *
 * Three levels:
 *   open        the register needs it to trade; safe for any cashier
 *   supervisor  changes operational data or clears working state
 *   admin       changes the backend, the company, the database, the till's
 *               identity, its stored credentials or its audit trail
 *
 * A channel nobody has classified is treated as admin, so a new privileged
 * channel cannot become world-callable by being forgotten.
 */
const adminSession = require("./admin-session.cjs");

const OPEN = "open";
const SUPERVISOR = "supervisor";
const ADMIN = "admin";

/** Explicit classification of every channel the bridge exposes. */
const CHANNEL_LEVELS = {
  /* --- unlock surface itself: must be reachable to be able to unlock --- */
  "admin:unlock": OPEN,
  "admin:lock": OPEN,
  "admin:status": OPEN,
  "admin:adopt-session": OPEN,

  /* --- trading: the register cannot sell without these --- */
  "pos:write": OPEN,
  "pos:write-batch": OPEN,
  "pos:status": OPEN,
  "pos:database-config": OPEN,
  "pos:connection-audit": OPEN,
  "pos:verify-write": OPEN,
  "pos:push": OPEN,
  "pos:pull": OPEN,
  "pos:snapshot": OPEN,
  "pos:sync-contract": OPEN,
  "pos:schema-status": OPEN,
  "pos:schema-inventory": OPEN,
  "pos:read-schema": OPEN,
  "pos:schema-table-sql": OPEN,
  "pos:compare-summary": OPEN,
  "pos:compare-rows": OPEN,
  "pos:restore-status": OPEN,
  "pos:restore-evidence": OPEN,
  "db:create-sale": OPEN,
  "db:get-products": OPEN,
  "db:get-pending-sync-count": OPEN,
  "db:get-branch": OPEN,
  "print:silent": OPEN,
  "print:raw": OPEN,
  "print:list": OPEN,
  "local:info": OPEN,
  "local:mirror": OPEN,
  "local:list": OPEN,
  "local:audit-log": OPEN,
  "local:audit-list": OPEN,
  "local:relational-health": OPEN,
  "staff:roster": OPEN,
  "staff:cache-roster": OPEN,
  "staff:verify-pin": OPEN,
  "settings:get": OPEN,
  "config:read": OPEN,
  "config:get": OPEN,
  "terminal:read": OPEN,
  "backend:get": OPEN,
  "cloud:status": OPEN,
  "cloud:bootstrap": OPEN,
  "server-keys:status": OPEN,
  "app:version": OPEN,
  "app:ready": OPEN,
  "health:state": OPEN,
  "health:retry": OPEN,
  "health:open-logs": OPEN,
  "health:collect-diagnostics": OPEN,
  "update:status": OPEN,
  "update:check": OPEN,
  "net:get-json": OPEN,
  "net:head": OPEN,
  "net:get-binary": OPEN,
  "window:minimize": OPEN,
  "window:maximize": OPEN,
  "window:close": OPEN,
  "window:is-maximized": OPEN,
  "branding:read": OPEN,
  "driver:list": OPEN,
  "db:scan-local-instances": OPEN,
  "pos:scan-network": OPEN,
  "pos:test": OPEN,
  "sqladmin:status": OPEN,

  /* --- supervisor: operational data and working state --- */
  "pos:housekeep": SUPERVISOR,
  "pos:retry-errored": SUPERVISOR,
  "pos:retry-row": SUPERVISOR,
  "pos:discard-row": SUPERVISOR,
  "pos:set-sync-enabled": SUPERVISOR,
  "pos:retry-connection": SUPERVISOR,
  "pos:reconnect": SUPERVISOR,
  "local:rollback": SUPERVISOR,
  "db:set-branch": SUPERVISOR,
  "branding:write": SUPERVISOR,
  "update:install": SUPERVISOR,
  "health:resume-updates": SUPERVISOR,

  /* --- admin: backend, company, database, identity, credentials, audit --- */
  "pos:connect": ADMIN,
  "pos:configure-cloud": ADMIN,
  "pos:forget-connection": ADMIN,
  "pos:remove-connection": ADMIN,
  "pos:apply-schema": ADMIN,
  "pos:apply-schema-tables": ADMIN,
  "pos:restore": ADMIN,
  "pos:restore-verify": ADMIN,
  "pos:restore-drill": ADMIN,
  "pos:backup": ADMIN,
  "backend:set": ADMIN,
  "cloud:set": ADMIN,
  "cloud:remove": ADMIN,
  "terminal:write": ADMIN,
  "config:write": ADMIN,
  "config:set": ADMIN,
  "config:reset": ADMIN,
  "local:audit-clear": ADMIN,
  "staff:remember-pin": ADMIN,
  "staff:forget-pin": ADMIN,
  "driver:install": ADMIN,
  "health:rollback": ADMIN,
  "health:quit": ADMIN,
  "settings:set": ADMIN, // refined per key below
  "sqladmin:connect": SUPERVISOR,
  "sqladmin:cancel": SUPERVISOR,
  "sqladmin:probe-port": SUPERVISOR,
  "sqladmin:lock": SUPERVISOR,
  "sqladmin:databases": SUPERVISOR,
  "sqladmin:tables": SUPERVISOR,
  "sqladmin:columns": SUPERVISOR,
  "sqladmin:query": SUPERVISOR,
  "sqladmin:repair": ADMIN,
  "sqladmin:disconnect": SUPERVISOR,
};

/**
 * Channels the first-run screen needs before anybody can possibly sign in.
 * They are open only while the till has no connection and no activation; the
 * moment either exists, the normal level applies again.
 */
const FIRST_RUN_CHANNELS = new Set([
  "pos:connect",
  "pos:configure-cloud",
  "cloud:set",
  "backend:set",
  "terminal:write",
  "config:write",
  "config:set",
]);

/**
 * Channels an Emergency Access session may use without a username and PIN.
 *
 * Emergency Access exists to repair a terminal that cannot sign anybody in, so
 * everything needed to get it connected, activated and printing again is here:
 * connection, cloud keys, backend address, identity, configuration, the local
 * SQL Server and its driver, schema repair and hardware. Deliberately absent:
 * clearing the audit trail, backup/restore, and quitting or rolling back the
 * app — those are not repairs and stay with a real administrator.
 */
const RECOVERY_CHANNELS = new Set([
  "pos:connect",
  "pos:configure-cloud",
  "pos:forget-connection",
  "pos:remove-connection",
  "pos:apply-schema",
  "pos:apply-schema-tables",
  "pos:retry-connection",
  "pos:reconnect",
  "pos:set-sync-enabled",
  "cloud:set",
  "cloud:remove",
  "backend:set",
  "terminal:write",
  "config:write",
  "config:set",
  "config:reset",
  "settings:set",
  "db:set-branch",
  "branding:write",
  "driver:install",
  "local:rollback",
  "sqladmin:connect",
  "sqladmin:cancel",
  "sqladmin:probe-port",
  "sqladmin:lock",
  "sqladmin:databases",
  "sqladmin:tables",
  "sqladmin:columns",
  "sqladmin:repair",
  "sqladmin:disconnect",
]);

/* --------------------------- settings by key --------------------------- */

/**
 * Settings that decide where the money goes, who this till is, or what is
 * recorded. They are never changeable by an ordinary window.
 */
const RESTRICTED_SETTING_PATTERNS = [
  /^terminal/i,
  /^activation/i,
  /^backend/i,
  /^cloud/i,
  /^supabase/i,
  /^tenant/i,
  /^company/i,
  /^branch/i,
  /^store/i,
  /^db[_.:-]/i,
  /^database/i,
  /^sql/i,
  /^sync/i,
  /^audit/i,
  /^security/i,
  /^pin/i,
  /^auth/i,
  /^offline_grace/i,
  /^grace/i,
  /^licen[cs]e/i,
  /^update/i,
  /key$/i,
  /secret/i,
  /password/i,
  /token/i,
];

/** Preferences that only change how a screen looks. Safe for the register. */
const OPEN_SETTING_PATTERNS = [
  /^ui[_.:-]/i,
  /^display[_.:-]/i,
  /^theme/i,
  /^layout/i,
  /^receipt_(layout|font|logo_position|footer_note)/i,
  /^screen[_.:-]/i,
  /^last_/i,
  /^recent_/i,
  /^printer_preview/i,
];

function settingLevel(key) {
  const name = String(key ?? "");
  if (!name) return ADMIN;
  if (OPEN_SETTING_PATTERNS.some((p) => p.test(name))) return OPEN;
  if (RESTRICTED_SETTING_PATTERNS.some((p) => p.test(name))) return ADMIN;
  // Anything not recognised is operational, not free-for-all.
  return SUPERVISOR;
}

/** The level a call needs, taking its arguments into account. */
function levelFor(channel, args = []) {
  if (channel === "settings:set") return settingLevel(args[0]);
  if (channel === "config:set") return settingLevel(args[0]) === OPEN ? OPEN : ADMIN;
  return CHANNEL_LEVELS[channel] ?? ADMIN;
}

/* ------------------------------- the gate ------------------------------- */

/** Replaced by `install()` with the real stores. */
let firstRun = () => false;

function refusal(level) {
  return {
    ok: false,
    code: "EPRIVILEGE",
    requiredLevel: level,
    stage: "authorize",
    error:
      level === ADMIN
        ? "This action changes how the terminal is connected or identified. An administrator must unlock it with their username and PIN first."
        : "This action needs a supervisor. Unlock it with a supervisor username and PIN first.",
  };
}

/** True when the caller may run this channel with these arguments right now. */
function allowed(channel, args = []) {
  const level = levelFor(channel, args);
  if (level === OPEN) return true;
  if (FIRST_RUN_CHANNELS.has(channel) && firstRun()) return true;
  if (RECOVERY_CHANNELS.has(channel) && typeof adminSession.recoveryActive === "function" && adminSession.recoveryActive()) {
    adminSession.recoveryTouch?.();
    return true;
  }
  if (adminSession.hasLevel(level)) {
    adminSession.touch();
    return true;
  }
  return false;
}

/**
 * Wraps `ipcMain.handle` so every channel — the ones registered today and any
 * added later — passes the gate before its body runs.
 */
function install(ipcMain, { isFirstRun } = {}) {
  if (typeof isFirstRun === "function") firstRun = isFirstRun;
  const original = ipcMain.handle.bind(ipcMain);
  ipcMain.handle = (channel, listener) =>
    original(channel, (event, ...args) => {
      if (!allowed(channel, args)) return refusal(levelFor(channel, args));
      return listener(event, ...args);
    });
  return ipcMain;
}

module.exports = {
  OPEN,
  SUPERVISOR,
  ADMIN,
  CHANNEL_LEVELS,
  FIRST_RUN_CHANNELS,
  RECOVERY_CHANNELS,
  settingLevel,
  levelFor,
  allowed,
  refusal,
  install,
};
