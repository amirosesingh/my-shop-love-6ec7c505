/**
 * Offline cashier sign-in against the local database.
 *
 * The central database stores PINs as bcrypt hashes computed inside Postgres,
 * which this machine cannot recompute. So the till keeps its own PBKDF2
 * verifier, written the first time a person signs in successfully online, and
 * checks that when there is no connection. The PIN itself is never stored.
 */
const crypto = require("node:crypto");
const localDb = require("./db/sqlite.cjs");

const ITERATIONS = 100_000;

const derive = (pin, saltHex) =>
  crypto.pbkdf2Sync(String(pin), Buffer.from(saltHex, "hex"), ITERATIONS, 32, "sha256").toString("hex");

/** `pbkdf2$<iterations>$<saltHex>$<hashHex>` — self-describing on purpose. */
function makeVerifier(pin) {
  const salt = crypto.randomBytes(16).toString("hex");
  return `pbkdf2$${ITERATIONS}$${salt}$${derive(pin, salt)}`;
}

function matches(pin, verifier) {
  const parts = String(verifier ?? "").split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const [, iterations, salt, expected] = parts;
  const actual = crypto
    .pbkdf2Sync(String(pin), Buffer.from(salt, "hex"), Number(iterations) || ITERATIONS, 32, "sha256")
    .toString("hex");
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Check a PIN against the local copy. Never reveals which part was wrong. */
function verifyPin(username, pin) {
  const row = localDb.getStaff(username);
  if (!row) return { ok: false, reason: "unknown", error: "This account is not on this till yet" };
  if (!row.isActive) return { ok: false, reason: "inactive", error: "Account deactivated" };
  if (!row.verifier)
    return {
      ok: false,
      reason: "no-verifier",
      error: "This account has not signed in on this terminal before",
    };
  if (!matches(pin, row.verifier))
    return { ok: false, reason: "bad-pin", error: "Invalid username or PIN" };
  return {
    ok: true,
    staff: {
      id: row.id,
      username: row.username,
      full_name: row.fullName,
      store_id: row.storeId,
      permissions: row.permissions,
      role_slug: row.roleSlug,
    },
  };
}

/** Store (or refresh) the offline verifier after a successful online sign-in. */
function rememberPin(username, pin) {
  if (!username || !pin) return { ok: false };
  const saved = localDb.setStaffVerifier(username, makeVerifier(pin), String(pin).length);
  return { ok: Boolean(saved) };
}

module.exports = { verifyPin, rememberPin, makeVerifier, matches };
