#!/usr/bin/env node
/**
 * Fails the build when a web deployment value made it into a device artifact.
 *
 * Android and Windows builds are handed to other shops. They must carry no
 * project address, no publishable key and no backend URL belonging to the web
 * deployment — the device is told where to connect during activation or in
 * Settings → Database & Cloud Connection.
 *
 * Archives are opened, not skipped: .zip / .apk / .aab / .jar (zip container)
 * and Electron's .asar are unpacked in memory and their contents scanned. A
 * file or archive that cannot be read fails the build rather than passing
 * quietly.
 *
 * Usage: node scripts/verify-no-web-config.cjs <path> [<path> ...]
 * Missing paths are skipped, so the same call works before and after packaging.
 */
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const ZIP_LIKE = new Set([".zip", ".apk", ".aab", ".jar", ".ipa"]);

/**
 * Literal strings that must never appear inside a device artifact.
 *
 * Only VALUES are listed. Env variable NAMES legitimately appear in the bundle
 * (the config resolver looks them up at runtime on the web deployment), so
 * matching names would be a false alarm.
 */
const FORBIDDEN_PATTERNS = [
  // Real Supabase key material (the bare prefixes also appear in library
  // validation code and in UI placeholders, so a key body is required).
  /sb_publishable_[A-Za-z0-9_-]{16,}/,
  /sb_secret_[A-Za-z0-9_-]{16,}/,
  // A legacy service-role JWT.
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/,
  // A Supabase project host baked in as a literal.
  /https:\/\/[a-z0-9]{16,}\.supabase\.co/,
];

/** Actual values from this checkout's web environment, when it has one. */
function tenantValues() {
  const out = new Set();
  const envFiles = [".env", ".env.local", ".env.production"].map((f) =>
    path.join(__dirname, "..", f),
  );
  const names = [
    "VITE_SUPABASE_URL", "SUPABASE_URL", "VITE_POS_SUPABASE_URL",
    "VITE_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_PUBLISHABLE_KEY",
    "VITE_SUPABASE_ANON_KEY", "VITE_POS_SUPABASE_ANON_KEY",
    "VITE_SUPABASE_PROJECT_ID", "VITE_POS_SERVER_URL",
  ];
  for (const name of names) {
    const v = (process.env[name] || "").trim();
    if (v.length > 8) out.add(v);
  }
  for (const envFile of envFiles) {
    if (!fs.existsSync(envFile)) continue;
    for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*"?([^"\r\n]*)"?\s*$/.exec(line);
      if (m && names.includes(m[1]) && m[2].trim().length > 8) out.add(m[2].trim());
    }
  }
  return [...out];
}

/* ------------------------------------------------------------------ */
/* Minimal archive readers (no external tools, works on Linux+Windows) */
/* ------------------------------------------------------------------ */

/** Yields { name, data } for every entry of a ZIP container. Throws if broken. */
function* zipEntries(buf) {
  const eocdMax = Math.min(buf.length, 66000);
  let eocd = -1;
  for (let i = buf.length - 22; i >= buf.length - eocdMax && i >= 0; i -= 1) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("no ZIP end-of-central-directory record");
  let count = buf.readUInt16LE(eocd + 10);
  let offset = buf.readUInt32LE(eocd + 16);
  if (offset === 0xffffffff) throw new Error("ZIP64 archives are not supported by the scanner");

  for (let i = 0; i < count; i += 1) {
    if (buf.readUInt32LE(offset) !== 0x02014b50)
      throw new Error("corrupt ZIP central directory entry");
    const method = buf.readUInt16LE(offset + 10);
    const compressedSize = buf.readUInt32LE(offset + 20);
    const nameLen = buf.readUInt16LE(offset + 28);
    const extraLen = buf.readUInt16LE(offset + 30);
    const commentLen = buf.readUInt16LE(offset + 32);
    const localOffset = buf.readUInt32LE(offset + 42);
    const name = buf.toString("utf8", offset + 46, offset + 46 + nameLen);
    offset += 46 + nameLen + extraLen + commentLen;

    if (name.endsWith("/")) continue;
    if (buf.readUInt32LE(localOffset) !== 0x04034b50)
      throw new Error(`corrupt ZIP local header for ${name}`);
    const lNameLen = buf.readUInt16LE(localOffset + 26);
    const lExtraLen = buf.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(start, start + compressedSize);
    let data;
    if (method === 0) data = raw;
    else if (method === 8) data = zlib.inflateRawSync(raw);
    else throw new Error(`unsupported ZIP compression method ${method} for ${name}`);
    yield { name, data };
  }
}

/** Yields { name, data } for every file inside an Electron .asar archive. */
function* asarEntries(buf) {
  // header: 4 bytes pickle size, 4 bytes header-string size, 4 bytes, 4 bytes json length
  const headerSize = buf.readUInt32LE(4);
  // Electron writes 4 | headerSize | headerStringSize | jsonLen | json, but
  // some producers omit one length field. Try both offsets rather than
  // reporting a false "cannot be inspected" failure.
  let header = null;
  for (const [lenAt, jsonAt] of [
    [12, 16],
    [8, 12],
  ]) {
    try {
      header = JSON.parse(buf.toString("utf8", jsonAt, jsonAt + buf.readUInt32LE(lenAt)));
      break;
    } catch {
      /* try the other layout */
    }
  }
  if (!header) throw new Error("unreadable asar header");
  const base = 8 + headerSize;
  const walk = function* (node, prefix) {
    for (const [name, entry] of Object.entries(node.files || {})) {
      const full = prefix ? `${prefix}/${name}` : name;
      if (entry.files) yield* walk(entry, full);
      else if (typeof entry.offset === "string") {
        const off = base + Number(entry.offset);
        yield { name: full, data: buf.subarray(off, off + Number(entry.size || 0)) };
      }
    }
  };
  yield* walk(header, "");
}

/* ------------------------------------------------------------------ */

function matches(text, needles) {
  const found = [];
  for (const needle of needles) if (text.includes(needle)) found.push("a web configuration value");
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(text)) found.push(`key material matching ${pattern}`);
  }
  return found;
}

function scanBuffer(label, buf, needles, hits, depth = 0) {
  const ext = path.extname(label).toLowerCase();
  try {
    if (ZIP_LIKE.has(ext)) {
      if (depth > 4) throw new Error("archive nested too deeply to inspect");
      let seen = 0;
      for (const entry of zipEntries(buf)) {
        seen += 1;
        scanBuffer(`${label}!${entry.name}`, entry.data, needles, hits, depth + 1);
      }
      if (seen === 0) throw new Error("archive contained no readable entries");
      return;
    }
    if (ext === ".asar") {
      if (depth > 4) throw new Error("archive nested too deeply to inspect");
      for (const entry of asarEntries(buf)) {
        scanBuffer(`${label}!${entry.name}`, entry.data, needles, hits, depth + 1);
      }
      return;
    }
  } catch (e) {
    hits.push({ file: label, needle: `an archive that could not be inspected: ${e.message}` });
    return;
  }
  // Plain file (text or binary): a baked string is readable either way.
  const text = buf.toString("latin1");
  for (const needle of matches(text, needles)) hits.push({ file: label, needle });
}

function* walk(target) {
  const stat = fs.statSync(target);
  if (stat.isFile()) {
    yield target;
    return;
  }
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    const next = path.join(target, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) yield* walk(next);
    else yield next;
  }
}

function scan(target, needles) {
  const hits = [];
  for (const file of walk(target)) {
    let buf;
    try {
      buf = fs.readFileSync(file);
    } catch (e) {
      // No silent skips: a file that cannot be read fails the build.
      hits.push({ file, needle: `a file that could not be read: ${e.message}` });
      continue;
    }
    scanBuffer(file, buf, needles, hits);
  }
  return hits;
}

function main() {
  const requested = process.argv.slice(2);
  const targets = requested.filter((t) => fs.existsSync(t));
  if (targets.length === 0) {
    console.log("verify-no-web-config: nothing to scan.");
    return;
  }
  const needles = tenantValues();
  const hits = targets.flatMap((t) => scan(t, needles));
  if (hits.length > 0) {
    console.error("Web configuration leaked into a device artifact:\n");
    for (const hit of hits) console.error(`  ${hit.file} contains ${hit.needle}`);
    console.error(
      "\nAndroid and Windows builds must ship no web environment values. " +
        "Check vite.config.ts envDefine/envDir and the workflow's env block.",
    );
    process.exit(1);
  }
  console.log(`✓ no web configuration found in: ${targets.join(", ")}`);
}

main();
