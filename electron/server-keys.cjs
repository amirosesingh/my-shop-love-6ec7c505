/**
 * Keys the bundled app server may hold on a shop PC.
 *
 * There is exactly one, and it is not a shared secret: a locally generated
 * signing key used to mint this machine's terminal session tokens. It has to
 * be stable across restarts (a key that changed on every launch would drop
 * every open till session), so it is generated once and kept in the sealed
 * configuration store.
 *
 * The central database service key deliberately does NOT live here any more.
 * A privileged credential on a shop counter is a privileged credential in the
 * building, so cashier sign-in and every other privileged operation are
 * answered by the hosted backend instead — see `src/lib/backend-config.ts`
 * and the Emergency access → Recovery settings screen, which configure the
 * (non-secret) backend address this device talks to.
 */
const crypto = require("node:crypto");
const configStore = require("./config-store.cjs");

const STORE_KEY = "serverKeys";
const SIGNING_KEY_ENV = "SETTINGS_ENCRYPTION_KEY";

function stored() {
  const value = configStore.get(STORE_KEY);
  return value && typeof value === "object" ? value : {};
}

/** The token signing key, generated on this machine on first use. */
function signingKey() {
  const saved = String(stored().signingKey ?? "").trim();
  if (saved) return saved;
  const fromEnv = String(process.env[SIGNING_KEY_ENV] ?? "").trim();
  if (fromEnv) return fromEnv;
  const generated = crypto.randomBytes(32).toString("hex");
  // Any service key left behind by an older build is dropped here.
  configStore.set(STORE_KEY, { signingKey: generated });
  return generated;
}

/** Extra environment variables the spawned app server needs. */
function serverEnv() {
  return { [SIGNING_KEY_ENV]: signingKey() };
}

/** Remove a service key written by an older build of the desktop app. */
function purgeLegacyServiceKey() {
  const current = stored();
  if (!current.serviceKey) return;
  configStore.set(STORE_KEY, { signingKey: current.signingKey });
}

/** What the settings screen may know: presence only, never the value. */
function status() {
  return { hasSigningKey: Boolean(signingKey()) };
}

module.exports = { serverEnv, status, signingKey, purgeLegacyServiceKey };
