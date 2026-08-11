/** OS-vault-backed SQL Server connection settings for automatic reconnect. */
const fs = require("node:fs");
const path = require("node:path");
const { app, safeStorage } = require("electron");

const sealed = () => path.join(app.getPath("userData"), "local-db-config.bin");

function available() {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

function read() {
  if (!available()) return null;
  try {
    const value = JSON.parse(safeStorage.decryptString(fs.readFileSync(sealed())));
    return value?.server && value?.database ? value : null;
  } catch {
    return null;
  }
}

function write(config) {
  try {
    if (!config) {
      fs.rmSync(sealed(), { force: true });
      return { ok: true };
    }
    if (!available()) return { ok: false, error: "Operating-system encryption is unavailable" };
    fs.writeFileSync(sealed(), safeStorage.encryptString(JSON.stringify(config)));
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

module.exports = { read, write };