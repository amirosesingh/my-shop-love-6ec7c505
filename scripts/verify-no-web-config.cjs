#!/usr/bin/env node
/**
 * Fails the build when a web deployment value made it into a device artifact.
 *
 * Android and Windows builds are handed to other shops. They must carry no
 * project address, no publishable key and no backend URL belonging to the web
 * deployment — the device is told where to connect during activation or in
 * Settings → Database & Cloud Connection.
 *
 * Usage: node scripts/verify-no-web-config.cjs <path> [<path> ...]
 * Missing paths are skipped, so the same call works before and after packaging.
 */
const fs = require("node:fs");
const path = require("node:path");

const TEXT_LIKE = new Set([
  ".js", ".mjs", ".cjs", ".json", ".html", ".htm", ".txt", ".map", ".css",
  ".yml", ".yaml", ".xml", ".ts",
]);

/**
 * Literal strings that must never appear inside a device artifact.
 *
 * Only VALUES are listed. Env variable NAMES legitimately appear in the bundle
 * (the config resolver looks them up at runtime on the web deployment), so
 * matching names would be a false alarm.
 */
const FORBIDDEN = [
  // Supabase publishable / anon / legacy JWT key material.
  "sb_publishable_",
  "sb_secret_",
  "SUPABASE_SERVICE_ROLE_KEY=",
];

/** Actual values from this checkout's web environment, when it has one. */
function tenantValues() {
  const out = new Set();
  const envFile = path.join(__dirname, "..", ".env");
  const names = [
    "VITE_SUPABASE_URL", "SUPABASE_URL", "VITE_POS_SUPABASE_URL",
    "VITE_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_PUBLISHABLE_KEY",
    "VITE_POS_SUPABASE_ANON_KEY", "VITE_POS_SERVER_URL",
  ];
  for (const name of names) {
    const v = (process.env[name] || "").trim();
    if (v.length > 8) out.add(v);
  }
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*"?([^"\r\n]*)"?\s*$/.exec(line);
      if (m && names.includes(m[1]) && m[2].trim().length > 8) out.add(m[2].trim());
    }
  }
  return [...out];
}

function* walk(target) {
  const stat = fs.statSync(target);
  if (stat.isFile()) {
    yield target;
    return;
  }
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    const next = path.join(target, entry.name);
    if (entry.isDirectory()) yield* walk(next);
    else yield next;
  }
}

function scan(target, needles) {
  const hits = [];
  for (const file of walk(target)) {
    const ext = path.extname(file).toLowerCase();
    const size = fs.statSync(file).size;
    // Binaries (.apk, .exe) are scanned too: a baked string is still readable.
    const binary = !TEXT_LIKE.has(ext);
    if (size > 250 * 1024 * 1024) continue;
    const text = fs.readFileSync(file, binary ? "latin1" : "utf8");
    for (const needle of needles) {
      if (text.includes(needle)) hits.push({ file, needle });
    }
  }
  return hits;
}

function main() {
  const targets = process.argv.slice(2).filter((t) => fs.existsSync(t));
  if (targets.length === 0) {
    console.log("verify-no-web-config: nothing to scan.");
    return;
  }
  const needles = [...FORBIDDEN, ...tenantValues()];
  const hits = targets.flatMap((t) => scan(t, needles));
  if (hits.length > 0) {
    console.error("Web configuration leaked into a device artifact:\n");
    for (const hit of hits) console.error(`  ${hit.file} contains ${hit.needle}`);
    console.error(
      "\nAndroid and Windows builds must ship no web environment values. " +
        "Check vite.config.ts envDir/define and the workflow's env block.",
    );
    process.exit(1);
  }
  console.log(`✓ no web configuration found in: ${targets.join(", ")}`);
}

main();
