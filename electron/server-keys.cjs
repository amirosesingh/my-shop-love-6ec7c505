/**
 * Server keys for the bundled app server.
 *
 * The desktop shell spawns `dist-desktop/server/index.mjs` as a plain Node
 * process. That server needs two secrets to answer a cashier sign-in:
 *
 *  - the central database service key (`POS_SUPABASE_SERVICE_ROLE_KEY`), used
 *    to check the stored PIN hash, and
 *  - a signing key (`SETTINGS_ENCRYPTION_KEY`) used to mint the terminal
 *    session token.
 *
 * Neither existed on a packaged shop PC, so `/api/public/cashier-login`
 * answered "Central database key missing on this server" and no cashier could
 * sign in. They are kept here, sealed with the operating system key store
 * (same pattern as `db-config-store.cjs`), and injected into the server
 * process environment at launch.
 *
 * The signing key is generated locally on first use — it only has to be
 * stable on this machine, so nobody has to type it in.
 */
const crypto = require("node:crypto");
const configStore = require("./config-store.cjs");

const STORE_KEY = "serverKeys";

/** Environment names the app server understands, in priority order. */
const SERVICE_KEY_ENV = "POS_SUPABASE_SERVICE_ROLE_KEY";
const SIGNING_KEY_ENV = "SETTINGS_ENCRYPTION_KEY";

function stored() {
  const value = configStore.get(STORE_KEY);
  return value && typeof value === "object" ? value : {};
}

/** The service key, from the sealed store or the surrounding environment. */
function serviceKey() {
  const saved = String(stored().serviceKey ?? "").trim();
  if (saved) return saved;
  for (const name of [
    SERVICE_KEY_ENV,
    "POS_SERVICE_ROLE_KEY",
    "SUPABASE_POS_SERVICE_ROLE_KEY",
  ]) {
    const fromEnv = String(process.env[name] ?? "").trim();
    if (fromEnv) return fromEnv;
  }
  return "";
}

/**
 * The token signing key. Generated once and kept, because a key that changed
 * on every launch would invalidate every open till session after a restart.
 */
function signingKey() {
  const saved = String(stored().signingKey ?? "").trim();
  if (saved) return saved;
  const fromEnv = String(process.env[SIGNING_KEY_ENV] ?? "").trim();
  if (fromEnv) return fromEnv;
  const generated = crypto.randomBytes(32).toString("hex");
  configStore.set(STORE_KEY, { ...stored(), signingKey: generated });
  return generated;
}

/** Extra environment variables the spawned app server needs. */
function serverEnv() {
  const env = { [SIGNING_KEY_ENV]: signingKey() };
  const key = serviceKey();
  if (key) env[SERVICE_KEY_ENV] = key;
  return env;
}

/** What the settings screen may know: presence and shape, never the value. */
function status() {
  const key = serviceKey();
  return {
    hasServiceKey: Boolean(key),
    serviceKeyHint: key ? `${key.slice(0, 6)}…${key.slice(-4)}` : "",
    hasSigningKey: Boolean(String(stored().signingKey ?? "").trim() || process.env[SIGNING_KEY_ENV]),
    fromEnvironment: Boolean(!String(stored().serviceKey ?? "").trim() && key),
  };
}

/** Save (or clear, with an empty value) the service key. */
function setServiceKey(value) {
  const next = String(value ?? "").trim();
  const result = configStore.set(STORE_KEY, {
    ...stored(),
    serviceKey: next || undefined,
  });
  return result?.ok === false ? result : { ok: true, ...status() };
}

module.exports = { serverEnv, status, setServiceKey, serviceKey, signingKey };
