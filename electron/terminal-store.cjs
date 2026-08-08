/**
 * Persistent copy of the terminal activation, kept in the app's user-data
 * folder so an in-place update (or a cleared renderer storage) never forces the
 * branch to register the till again.
 */
const fs = require("node:fs");
const path = require("node:path");
const { app, safeStorage } = require("electron");

const file = () => path.join(app.getPath("userData"), "terminal-config.json");
const secretsFile = () => path.join(app.getPath("userData"), "terminal-secrets.bin");

function read() {
  try {
    const raw = fs.readFileSync(file(), "utf8");
    const parsed = JSON.parse(raw);
    return parsed && parsed.tokenId ? parsed : null;
  } catch {
    return null;
  }
}

function write(config) {
  try {
    if (!config) {
      fs.rmSync(file(), { force: true });
      return { ok: true };
    }
    fs.writeFileSync(file(), JSON.stringify(config, null, 2), "utf8");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

module.exports = { read, write };

/* ---- machine credentials, protected by the OS secret store when it exists -- */

function readSecrets() {
  try {
    const raw = fs.readFileSync(secretsFile());
    const text = safeStorage.isEncryptionAvailable()
      ? safeStorage.decryptString(raw)
      : raw.toString("utf8");
    const parsed = JSON.parse(text);
    return parsed && parsed.email ? parsed : null;
  } catch {
    return null;
  }
}

function writeSecrets(secrets) {
  try {
    if (!secrets) {
      fs.rmSync(secretsFile(), { force: true });
      return { ok: true };
    }
    const text = JSON.stringify(secrets);
    const body = safeStorage.isEncryptionAvailable()
      ? safeStorage.encryptString(text)
      : Buffer.from(text, "utf8");
    fs.writeFileSync(secretsFile(), body);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

module.exports.readSecrets = readSecrets;
module.exports.writeSecrets = writeSecrets;