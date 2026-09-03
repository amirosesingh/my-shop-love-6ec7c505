/**
 * The configuration names that belong to the WEB deployment only.
 *
 * Android and Windows artifacts are handed to other shops, so none of these
 * may reach a device build. They are removed from the environment of every
 * child process a terminal build starts (Vite, the prerender server and the
 * packager), on top of the `envDefine: false` / empty `envDir` guards in
 * vite.config.ts.
 *
 * Both the canonical unprefixed names (which server code reads through
 * process.env) and the older VITE_-prefixed aliases are listed: a device build
 * must not inherit either.
 */
const WEB_ONLY_ENV_NAMES = [
  // Canonical web runtime pair (Cloudflare variables).
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  // Server-only secrets that must never be near a device artifact.
  "POS_SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SETTINGS_ENCRYPTION_KEY",
  // Platform-managed and legacy aliases of the same values.
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_PROJECT_ID",
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "VITE_SUPABASE_PROJECT_ID",
  "VITE_POS_SUPABASE_URL",
  "VITE_POS_SUPABASE_ANON_KEY",
  "VITE_POS_SUPABASE_PUBLISHABLE_KEY",
  "VITE_SUPABASE_EXTERNAL_URL",
  "VITE_SUPABASE_EXTERNAL_PUBLISHABLE_KEY",
  "VITE_POS_SERVER_URL",
];

/** A copy of `source` with every web-only name removed. */
function withoutWebEnv(source = process.env) {
  const next = { ...source };
  for (const name of WEB_ONLY_ENV_NAMES) delete next[name];
  return next;
}

/** Remove the web-only names from this process's own environment. */
function scrubWebEnv() {
  for (const name of WEB_ONLY_ENV_NAMES) delete process.env[name];
}

module.exports = { WEB_ONLY_ENV_NAMES, withoutWebEnv, scrubWebEnv };
