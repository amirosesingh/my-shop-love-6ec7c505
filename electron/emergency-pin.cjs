/**
 * Emergency Access PIN for the Windows till.
 *
 * The recovery code is never stored: only a random per-device secret is kept,
 * sealed with the OS vault (DPAPI via safeStorage). The PIN itself is derived
 * from that secret and the device's own clock, one code per minute, so the
 * gate works with no connection, no database and nobody signed in.
 *
 * The secret never leaves the main process — the renderer can only ask
 * "is this PIN right?".
 */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { app, safeStorage } = require("electron");

const sealedPath = () => path.join(app.getPath("userData"), "emergency-secret.bin");
const plainPath = () => path.join(app.getPath("userData"), "emergency-secret.json");

const canSeal = () => {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
};

function readSecret() {
  if (canSeal()) {
    try {
      const value = safeStorage.decryptString(fs.readFileSync(sealedPath()));
      if (value && value.length >= 32) return value;
    } catch {
      /* not sealed yet */
    }
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(plainPath(), "utf8"));
    if (parsed && typeof parsed.secret === "string" && parsed.secret.length >= 32) {
      return parsed.secret;
    }
  } catch {
    /* nothing stored yet */
  }
  return null;
}

function writeSecret(secret) {
  try {
    if (canSeal()) {
      fs.writeFileSync(sealedPath(), safeStorage.encryptString(secret));
      fs.rmSync(plainPath(), { force: true });
      return true;
    }
    fs.writeFileSync(plainPath(), JSON.stringify({ secret }), { mode: 0o600 });
    return true;
  } catch {
    return false;
  }
}

/** The device secret, created once on first use. */
function ensureSecret() {
  const existing = readSecret();
  if (existing) return existing;
  const fresh = crypto.randomBytes(32).toString("hex");
  writeSecret(fresh);
  return fresh;
}

/** `YYYYMMDDHHmm` in the device's own local time — the slot the PIN covers. */
function slotAt(date) {
  const p = (n, w = 2) => String(n).padStart(w, "0");
  return (
    `${p(date.getFullYear(), 4)}${p(date.getMonth() + 1)}${p(date.getDate())}` +
    `${p(date.getHours())}${p(date.getMinutes())}`
  );
}

/** Six digits from HMAC-SHA256(secret, slot) — never the raw date string. */
function pinForSlot(secret, slot) {
  const mac = crypto.createHmac("sha256", secret).update(slot).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const value =
    ((mac[offset] & 0x7f) << 24) |
    ((mac[offset + 1] & 0xff) << 16) |
    ((mac[offset + 2] & 0xff) << 8) |
    (mac[offset + 3] & 0xff);
  return String(value % 1_000_000).padStart(6, "0");
}

const equal = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

/**
 * Check a code against the current minute and `drift` minutes either side, so
 * a slightly wrong device clock does not lock the terminal out of recovery.
 */
function verifyPin(pin, drift = 3) {
  const code = String(pin ?? "").trim();
  if (!/^\d{6}$/.test(code)) return { ok: false };
  const secret = ensureSecret();
  const now = Date.now();
  for (let i = -drift; i <= drift; i += 1) {
    if (equal(code, pinForSlot(secret, slotAt(new Date(now + i * 60_000))))) return { ok: true };
  }
  return { ok: false };
}

/**
 * A short, non-secret fingerprint of the device secret. Support reads this off
 * the screen to pick the right secret when generating the code.
 */
function fingerprint() {
  return crypto.createHash("sha256").update(ensureSecret()).digest("hex").slice(0, 8).toUpperCase();
}

module.exports = { ensureSecret, verifyPin, pinForSlot, slotAt, fingerprint };
