/**
 * Permanent till configuration — `userData/pos_config.json`.
 *
 * IMMUTABLE PATH RULE: nothing in the app clears this file. Restarts,
 * reloads, cloud outages and network flaps all leave it untouched; only an
 * explicit admin "Reset / erase configuration" removes it.
 *
 * The payload is sealed with the operating system's key store when that is
 * available. When it is not (headless Linux, no keyring), the settings are
 * still written — as plain JSON with owner-only file permissions — because a
 * till that forgets its database on every reboot is worse than a readable
 * config file on a machine the operator already controls.
 */
const fs = require("node:fs");
const path = require("node:path");
const { app, safeStorage } = require("electron");

const FILE = "pos_config.json";

const filePath = () => path.join(app.getPath("userData"), FILE);

function encryptionAvailable() {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

/** Whole configuration object; `{}` when nothing has been stored yet. */
function readAll() {
  try {
    const raw = fs.readFileSync(filePath(), "utf8");
    const envelope = JSON.parse(raw);
    if (envelope && envelope.sealed === true && typeof envelope.data === "string") {
      if (!encryptionAvailable()) return {};
      return JSON.parse(safeStorage.decryptString(Buffer.from(envelope.data, "base64"))) ?? {};
    }
    return envelope && typeof envelope === "object" ? (envelope.data ?? envelope) : {};
  } catch {
    return {};
  }
}

function writeAll(value) {
  try {
    const json = JSON.stringify(value ?? {});
    const body = encryptionAvailable()
      ? { sealed: true, data: safeStorage.encryptString(json).toString("base64") }
      : { sealed: false, data: JSON.parse(json) };
    fs.writeFileSync(filePath(), JSON.stringify(body, null, 2), { mode: 0o600 });
    return { ok: true, sealed: body.sealed };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

const get = (key) => {
  const all = readAll();
  return Object.prototype.hasOwnProperty.call(all, key) ? all[key] : null;
};

function set(key, value) {
  const all = readAll();
  if (value === null || value === undefined) delete all[key];
  else all[key] = value;
  return writeAll(all);
}

function merge(patch) {
  return writeAll({ ...readAll(), ...(patch ?? {}) });
}

/** The ONLY way configuration ever leaves the machine. Admin-triggered. */
function reset() {
  try {
    fs.rmSync(filePath(), { force: true });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

module.exports = { readAll, writeAll, get, set, merge, reset, filePath, encryptionAvailable };