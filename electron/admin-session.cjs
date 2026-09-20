const MAX_IDLE_MS = 10 * 60 * 1000;

let session = null;

function clear() { session = null; }
function grant(level, subject) {
  if (level !== "admin" && level !== "supervisor") throw new Error("Invalid privilege level.");
  session = { level, subject: String(subject ?? ""), expiresAt: Date.now() + MAX_IDLE_MS };
  return status();
}
function active() {
  if (session && session.expiresAt <= Date.now()) clear();
  return session;
}
function hasLevel(required) {
  const current = active();
  if (!current) return false;
  return current.level === "admin" || required === "supervisor";
}
function touch() { if (active()) session.expiresAt = Date.now() + MAX_IDLE_MS; }
function status() {
  const current = active();
  return current ? { ok: true, unlocked: true, level: current.level, subject: current.subject } : { ok: true, unlocked: false };
}

module.exports = { clear, grant, hasLevel, touch, status, recoveryActive: () => false, recoveryTouch: () => {} };
