/**
 * Builds the Windows installer + update manifest into ./release.
 *
 * The update feed URL comes from POS_UPDATE_URL (the plain web folder that
 * will host "LovablePOS Setup <version>.exe" + latest.yml). A placeholder is
 * used when it is unset so local builds still succeed.
 *
 * The installer is handed to other shops, so it must carry no web deployment
 * configuration. Web environment names are removed from the build environment
 * here, vite.config.ts loads no .env file for a DESKTOP_BUILD, and the
 * finished output is scanned before packaging is considered done.
 */
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

const DEFAULT_URL = "https://updatecms.luckycharmsdnbhd.com/pos-app/";
const url = (process.env.POS_UPDATE_URL || "").trim() || DEFAULT_URL;
if (!process.env.POS_UPDATE_URL) {
  console.log(`POS_UPDATE_URL is not set — baking in the default feed ${url}`);
}

const WEB_ONLY_ENV_NAMES = [
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

const env = { ...process.env, POS_UPDATE_URL: url, DESKTOP_BUILD: "1" };
for (const name of WEB_ONLY_ENV_NAMES) delete env[name];

const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: true, env });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

// A stale bundle from an earlier (web-flavoured) build must never be packaged.
console.log("› clearing stale desktop output");
for (const dir of ["dist-desktop", "release"]) {
  fs.rmSync(path.join(root, dir), { recursive: true, force: true });
}

run("node", ["scripts/bump-version.cjs", "--write"]);
run("vite", ["build"]);

console.log("› checking the desktop bundle carries no web configuration");
run("node", ["scripts/verify-no-web-config.cjs", "dist-desktop"]);

run("electron-builder", ["--win", "nsis", "--publish", "never"]);

console.log("› checking the packaged app carries no web configuration");
run("node", [
  "scripts/verify-no-web-config.cjs",
  "release/win-unpacked/resources",
]);
