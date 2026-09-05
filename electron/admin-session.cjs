/**
 * Who is allowed to use the desktop administration channels.
 *
 * The window renders application code, so a screen that merely hides a button
 * proves nothing: anything running in the window can call the bridge directly.
 * The database administration channels therefore ask the desktop process
 * itself. A validated online Admin/Supervisor session may be adopted by the
 * main process; offline overrides still use a local username and PIN.
 *
 * The grant lives in memory only. It never survives a restart, it expires on
 * its own, and it is dropped the moment the window reloads.
 */
const staffAuth = require("./staff-auth.cjs");

/** Long enough for a repair session, short enough to be forgotten. */
const TTL_MS = 15 * 60 * 1000;

let grant = null; // { username, name, until }

/** Permissions that count as "may administer this till's database". */
const ADMIN_PERMISSIONS = ["can_manage_sync_backup", "can_manage_settings", "can_access_pos_settings"];

/** Permissions that count as "may take a supervisor decision on this till". */
const SUPERVISOR_PERMISSIONS = [
  ...ADMIN_PERMISSIONS,
  "can_approve_requests",
  "can_override",
  "can_manage_stock",
  "can_open_drawer",
];

function hasAny(staff, wanted) {
  const permissions = staff?.permissions;
  if (Array.isArray(permissions)) return permissions.some((p) => wanted.includes(p));
  if (permissions && typeof permissions === "object")
    return wanted.some((p) => permissions[p] === true);
  return false;
}

function isAdministrator(staff) {
  const role = String(staff?.role_slug ?? "").toLowerCase();
  if (role === "admin" || role === "administrator" || role === "owner") return true;
  return hasAny(staff, ADMIN_PERMISSIONS);
}

/** Supervisors and above. Every administrator is also a supervisor. */
function isSupervisor(staff) {
  if (isAdministrator(staff)) return true;
  const role = String(staff?.role_slug ?? "").toLowerCase();
  if (role === "supervisor" || role === "manager") return true;
  return hasAny(staff, SUPERVISOR_PERMISSIONS);
}

/** Sign in for administration. Returns a plain refusal, never a reason to guess from. */
function unlock(username, pin) {
  const result = staffAuth.verifyPin(String(username ?? ""), String(pin ?? ""));
  if (!result.ok) return { ok: false, error: "That username or PIN was not accepted on this till." };
  const admin = isAdministrator(result.staff);
  if (!admin && !isSupervisor(result.staff))
    return { ok: false, error: "This account may not administer the database on this terminal." };
  grant = {
    username: result.staff.username,
    name: result.staff.full_name ?? result.staff.username,
    level: admin ? "admin" : "supervisor",
    until: Date.now() + TTL_MS,
  };
  return { ok: true, name: grant.name, level: grant.level, expiresAt: grant.until };
}

/** Adopt a role that the configured backend has independently verified. */
function adoptVerified(level, name) {
  if (level !== "admin" && level !== "supervisor") return lock();
  grant = {
    username: "online-session",
    name: String(name ?? "Signed-in user").slice(0, 160),
    level,
    until: Date.now() + TTL_MS,
  };
  return { ok: true, name: grant.name, level: grant.level, expiresAt: grant.until };
}


function lock() {
  grant = null;
  return { ok: true };
}

/** True only while a live grant exists. Expiry is checked on every call. */
function unlocked() {
  if (!grant) return false;
  if (Date.now() > grant.until) {
    grant = null;
    return false;
  }
  return true;
}

function status() {
  return unlocked()
    ? { unlocked: true, name: grant.name, level: grant.level, expiresAt: grant.until }
    : { unlocked: false };
}

/** True while the live grant is at least as strong as the level asked for. */
function hasLevel(level) {
  if (!unlocked()) return false;
  if (level === "supervisor") return grant.level === "supervisor" || grant.level === "admin";
  return grant.level === "admin";
}

/** Keeps an in-use grant alive; an idle one still times out on its own. */
function touch() {
  if (grant) grant.until = Date.now() + TTL_MS;
}

/**
 * Gate for a channel body: refuses without touching the database when the
 * caller has not unlocked administration on this machine.
 */
async function requireLevel(work, level = "admin") {
  if (!hasLevel(level))
    return {
      ok: false,
      code: "EADMINLOCK",
      stage: "authorize",
      error:
        level === "admin"
          ? "This database action requires an administrator."
          : "Database tools require a supervisor or administrator.",
    };
  // Active use keeps the grant alive; an idle one still times out.
  touch();
  return work();
}

const requireAdmin = (work) => requireLevel(work, "admin");

/* ------------------------- emergency recovery --------------------------- */

/**
 * Emergency Access unlock.
 *
 * The recovery screen exists to repair a till that cannot sign anybody in, so
 * it cannot ask for a username and PIN it may have no way to check. Its code
 * is the machine's own clock, `YYYYMMDDHHMM` in local time, and the desktop
 * process checks it against its own clock rather than trusting the window.
 *
 * The grant it opens is narrow on purpose: repair channels only (see
 * `ipc-privilege.cjs`), never the audit trail, backups or app control.
 */
const RECOVERY_TTL_MS = 15 * 60 * 1000;
const RECOVERY_DRIFT_MINUTES = 1;

let recoveryUntil = 0;

function clockCode(date) {
  const p = (n, w = 2) => String(n).padStart(w, "0");
  return (
    `${p(date.getFullYear(), 4)}${p(date.getMonth() + 1)}${p(date.getDate())}` +
    `${p(date.getHours())}${p(date.getMinutes())}`
  );
}

/** Constant-time compare of two equal-length codes. */
function sameCode(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** True when `code` matches this machine's clock, one minute either side. */
function validRecoveryCode(code, now = Date.now()) {
  const typed = String(code ?? "").trim();
  if (!/^\d{12}$/.test(typed)) return false;
  for (let i = -RECOVERY_DRIFT_MINUTES; i <= RECOVERY_DRIFT_MINUTES; i += 1) {
    if (sameCode(typed, clockCode(new Date(now + i * 60_000)))) return true;
  }
  return false;
}

/** Open a recovery session. Refuses silently on a wrong or stale code. */
function recoveryUnlock(code) {
  if (!validRecoveryCode(code)) {
    recoveryUntil = 0;
    return { ok: false, error: "That recovery code was not accepted on this terminal." };
  }
  recoveryUntil = Date.now() + RECOVERY_TTL_MS;
  return { ok: true, expiresAt: recoveryUntil };
}

/** Close it — the window does this when the recovery screen is left. */
function recoveryLock() {
  recoveryUntil = 0;
  return { ok: true };
}

/** True while a recovery session is live; idle sessions expire on their own. */
function recoveryActive() {
  if (!recoveryUntil) return false;
  if (Date.now() > recoveryUntil) {
    recoveryUntil = 0;
    return false;
  }
  return true;
}

/** Keeps a recovery session in use alive. */
function recoveryTouch() {
  if (recoveryActive()) recoveryUntil = Date.now() + RECOVERY_TTL_MS;
}

module.exports = {
  unlock,
  adoptVerified,
  lock,
  unlocked,
  status,
  hasLevel,
  touch,
  requireAdmin,
  requireLevel,
  isAdministrator,
  isSupervisor,
  TTL_MS,
  validRecoveryCode,
  recoveryUnlock,
  recoveryLock,
  recoveryActive,
  recoveryTouch,
  RECOVERY_TTL_MS,
};

