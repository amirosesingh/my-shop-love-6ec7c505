/**
 * Builds the Windows installer + update manifest into ./release.
 *
 * The update feed URL comes from POS_UPDATE_URL (the plain web folder that
 * will host "LovablePOS Setup <version>.exe" + latest.yml). A placeholder is
 * used when it is unset so local builds still succeed.
 *
 * The installer is handed to other shops, so it must carry no web deployment
 * configuration. Web environment names are removed from the build environment
 * here (see scripts/web-only-env.cjs) and vite.config.ts loads no .env file
 * for a DESKTOP_BUILD.
 */
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const { withoutWebEnv } = require("./web-only-env.cjs");

const root = path.resolve(__dirname, "..");

const DEFAULT_URL = "https://updatecms.luckycharmsdnbhd.com/pos-app/";
const url = (process.env.POS_UPDATE_URL || "").trim() || DEFAULT_URL;
if (!process.env.POS_UPDATE_URL) {
  console.log(`POS_UPDATE_URL is not set — baking in the default feed ${url}`);
}

const env = { ...withoutWebEnv(), POS_UPDATE_URL: url, DESKTOP_BUILD: "1" };

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

// Electron loads dist-desktop/server/index.mjs. Some toolchain versions ignore
// the configured output directory and write to dist/, which would package an
// app with no server entry — normalise it here.
const desktopOut = path.join(root, "dist-desktop");
const genericOut = path.join(root, "dist");
if (!fs.existsSync(desktopOut) && fs.existsSync(genericOut)) {
  console.log("› moving dist/ into dist-desktop/ for packaging");
  fs.renameSync(genericOut, desktopOut);
}
if (!fs.existsSync(path.join(desktopOut, "server", "index.mjs"))) {
  console.error("Desktop build produced no dist-desktop/server/index.mjs — aborting.");
  process.exit(1);
}

console.log("› checking the desktop bundle carries no web configuration");
run("node", ["scripts/verify-no-web-config.cjs", "dist-desktop"]);

run("electron-builder", ["--win", "nsis", "--publish", "never"]);

// The whole release folder: unpacked resources, app.asar and the installer
// itself are all opened by the archive-aware scanner.
console.log("› checking the packaged app and installer carry no web configuration");
run("node", ["scripts/verify-no-web-config.cjs", "release"]);
