/**
 * Persistent copy of the terminal activation, kept in the app's user-data
 * folder so an in-place update (or a cleared renderer storage) never forces the
 * branch to register the till again.
 */
const fs = require("node:fs");
const path = require("node:path");
const { app, safeStorage } = require("electron");

const file = () => path.join(app.getPath("userData"), "terminal-config.json");
const sealed = () => path.join(app.getPath("userData"), "terminal-config.bin");

const canSeal = () => {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
};

function read() {
  // Preferred: the OS vault copy (DPAPI on Windows, Keychain on macOS).
  if (canSeal()) {
    try {
      const buf = fs.readFileSync(sealed());
      const parsed = JSON.parse(safeStorage.decryptString(buf));
      if (parsed && parsed.tokenId) return parsed;
    } catch {
      /* fall through to the legacy plain copy */
    }
  }
  try {
    const raw = fs.readFileSync(file(), "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.tokenId) return null;
    // One-time migration of an older unencrypted activation.
    if (canSeal()) write(parsed);
    return parsed;
  } catch {
    return null;
  }
}

function write(config) {
  try {
    if (!config) {
      fs.rmSync(file(), { force: true });
      fs.rmSync(sealed(), { force: true });
      return { ok: true };
    }
    if (!canSeal()) {
      // One state only: sealed, or not stored at all. Silently falling back to
      // a plain-text activation on a machine whose vault is unavailable would
      // leave the terminal's identity readable by anything on the disk.
      return {
        ok: false,
        error:
          "This computer's secure store is unavailable, so the activation cannot be saved. Sign in to Windows with a normal user profile (not a temporary one) and try again.",
      };
    }
    fs.writeFileSync(sealed(), safeStorage.encryptString(JSON.stringify(config)));
    // The plain copy must not linger once the vault holds the activation.
    fs.rmSync(file(), { force: true });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}


/** Whether the activation is protected by the operating system's vault. */
function isSecure() {
  return canSeal();
}

module.exports = { read, write, isSecure };