/**
 * Builds the Windows installer + update manifest into ./release.
 *
 * The update feed URL comes from POS_UPDATE_URL (the plain web folder that
 * will host "LovablePOS Setup <version>.exe" + latest.yml). A placeholder is
 * used when it is unset so local builds still succeed.
 */
const { spawnSync } = require("node:child_process");

const url = (process.env.POS_UPDATE_URL || "").trim() || "https://updates.example.com/pos";
if (!process.env.POS_UPDATE_URL) {
  console.warn(`POS_UPDATE_URL is not set — baking in the placeholder feed ${url}`);
}

const env = { ...process.env, POS_UPDATE_URL: url, DESKTOP_BUILD: "1" };
const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: true, env });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

run("vite", ["build"]);
run("electron-builder", ["--win", "nsis", "--publish", "never"]);