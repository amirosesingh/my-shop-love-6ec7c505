#!/usr/bin/env node
/**
 * Packages the whole POS into the Capacitor web folder.
 *
 * The app is server-rendered, so there is no static index.html lying around.
 * This script builds a Node server bundle, starts it once, renders the app
 * shell to HTML, and writes that plus every client asset into
 * `capacitor-shell/`. The result runs entirely on the phone: Android serves
 * the folder locally and the router takes over from there, so the till boots
 * and sells with no internet at all.
 */
const { spawnSync, spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const out = path.join(root, "capacitor-shell");
const PORT = Number(process.env["MOBILE_RENDER_PORT"] || 43119);

function run(cmd, args, env) {
  const res = spawnSync(cmd, args, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, ...env },
  });
  if (res.status !== 0) process.exit(res.status ?? 1);
}

async function waitForServer(url, attempts = 60) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.text();
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`The build server never answered on ${url}`);
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dest = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(src, dest);
    else fs.copyFileSync(src, dest);
  }
}

async function main() {
  console.log("› building the phone bundle");
  run("npx", ["vite", "build"], { MOBILE_BUILD: "1" });

  const serverEntry = path.join(root, "dist", "server", "index.mjs");
  const clientDir = path.join(root, "dist", "client");
  if (!fs.existsSync(serverEntry) || !fs.existsSync(clientDir)) {
    throw new Error(
      "Expected dist/server/index.mjs and dist/client after the build. " +
        "The phone build needs the Node server output (MOBILE_BUILD=1).",
    );
  }

  console.log("› rendering the app shell");
  const server = spawn(process.execPath, [serverEntry], {
    cwd: root,
    env: { ...process.env, PORT: String(PORT), HOST: "127.0.0.1", NITRO_PORT: String(PORT) },
    stdio: ["ignore", "inherit", "inherit"],
  });

  let html;
  try {
    html = await waitForServer(`http://127.0.0.1:${PORT}/`);
  } finally {
    server.kill("SIGKILL");
  }

  fs.rmSync(out, { recursive: true, force: true });
  copyDir(clientDir, out);
  fs.writeFileSync(path.join(out, "index.html"), html, "utf8");
  // Android's local server falls back to index.html for unknown paths, but a
  // copy under 200.html keeps other hosts (and manual testing) happy too.
  fs.writeFileSync(path.join(out, "200.html"), html, "utf8");

  console.log(`✓ phone bundle ready in ${path.relative(root, out)}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});