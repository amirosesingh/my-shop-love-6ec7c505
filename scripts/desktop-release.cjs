/**
 * Builds the Windows installer + update manifest into ./release.
 *
 * The update feed URL comes from POS_UPDATE_URL (the plain web folder that
 * will host "LovablePOS Setup <version>.exe" + latest.yml). A placeholder is
 * used when it is unset so local builds still succeed.
 */
const { spawnSync } = require("node:child_process");

const DEFAULT_URL = "https://updatecms.luckycharmsdnbhd.com/pos-app/";
const url = (process.env.POS_UPDATE_URL || "").trim() || DEFAULT_URL;
if (!process.env.POS_UPDATE_URL) {
  console.log(`POS_UPDATE_URL is not set — baking in the default feed ${url}`);
}

const env = { ...process.env, POS_UPDATE_URL: url, DESKTOP_BUILD: "1" };
const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: true, env });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

run("node", ["scripts/bump-version.cjs", "--write"]);
run("vite", ["build"]);
run("electron-builder", ["--win", "nsis", "--publish", "never"]);