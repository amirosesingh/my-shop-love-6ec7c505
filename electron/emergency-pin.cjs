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

/** Product-wide salt for the clock-only fallback code. Keep in step with
 *  src/lib/emergency-fallback-pin.ts and scripts/emergency-pin.cjs. */
const FALLBACK_PIN_SALT = "northwind-pos-emergency-v1";

const sealedPath = () => path.join(app.getPath("userData"), "emergency-secret.bin");
const saltPath = () => path.join(app.getPath("userData"), "emergency-company-salt.bin");
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

/**
 * The company recovery salt, delivered by the backend over the activation
 * token (see src/lib/emergency-escrow.ts) and sealed with the OS vault. Once
 * it is present the build-time salt stops opening this machine.
 */
function readCompanySalt() {
  try {
    const raw = fs.readFileSync(saltPath());
    const value = canSeal() ? safeStorage.decryptString(raw) : raw.toString("utf8");
    return value && value.length >= 16 ? value : null;
  } catch {
    return null;
  }
}

function setCompanySalt(salt) {
  const value = String(salt || "").trim();
  if (value.length < 16) return false;
  try {
    fs.writeFileSync(
      saltPath(),
      canSeal() ? safeStorage.encryptString(value) : Buffer.from(value, "utf8"),
      { mode: 0o600 },
    );
    return true;
  } catch {
    return false;
  }
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
 * Guessing brake. A live code is only six digits, so the window is small
 * enough to script through; after a handful of wrong codes the gate closes
 * for a growing pause, held in memory (a restart of the app is itself a
 * deliberate act at the machine).
 */
const attempts = { count: 0, until: 0 };
const lockMs = (n) => Math.min(15 * 60_000, 30_000 * 2 ** Math.max(0, n - 5));

/**
 * Check a code against the current minute and `drift` minutes either side, so
 * a slightly wrong device clock does not lock the terminal out of recovery.
 */
function verifyPin(pin, drift = 3) {
  const now0 = Date.now();
  if (attempts.until > now0) {
    return {
      ok: false,
      locked: true,
      retryInSeconds: Math.ceil((attempts.until - now0) / 1000),
    };
  }
  const code = String(pin ?? "").trim();
  const fail = () => {
    attempts.count += 1;
    if (attempts.count >= 5) attempts.until = Date.now() + lockMs(attempts.count);
    return {
      ok: false,
      ...(attempts.until > Date.now()
        ? { locked: true, retryInSeconds: Math.ceil((attempts.until - Date.now()) / 1000) }
        : {}),
    };
  };
  if (!/^\d{6}$/.test(code)) return fail();
  const now = Date.now();
  // The clock-only master code (see src/lib/emergency-fallback-pin.ts) opens
  // the gate too. Once this machine has its company salt the build-time salt
  // is refused, so a code computed from a downloaded installer is worthless.
  const fallbackSalt = readCompanySalt() || FALLBACK_PIN_SALT;
  for (let i = -drift; i <= drift; i += 1) {
    if (equal(code, pinForSlot(fallbackSalt, slotAt(new Date(now + i * 60_000))))) {
      attempts.count = 0;
      attempts.until = 0;
      return { ok: true };
    }
  }
  const secret = ensureSecret();
  for (let i = -drift; i <= drift; i += 1) {
    if (equal(code, pinForSlot(secret, slotAt(new Date(now + i * 60_000))))) {
      attempts.count = 0;
      attempts.until = 0;
      return { ok: true };
    }
  }
  return fail();
}


/**
 * A short, non-secret fingerprint of the device secret. Support reads this off
 * the screen to pick the right secret when generating the code.
 */
function fingerprint() {
  return crypto.createHash("sha256").update(ensureSecret()).digest("hex").slice(0, 8).toUpperCase();
}

module.exports = {
  ensureSecret,
  verifyPin,
  pinForSlot,
  slotAt,
  fingerprint,
  readCompanySalt,
  setCompanySalt,
  FALLBACK_PIN_SALT,
};
