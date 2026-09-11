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
const { webOnly: WEB_ONLY_ENV_NAMES } = require("./web-only-env-names.json");

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
