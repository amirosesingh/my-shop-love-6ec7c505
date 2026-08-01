import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * AES-256-GCM for sensitive configuration values (WhatsApp token, bank
 * account number). The key never leaves the server: it is derived from the
 * SETTINGS_ENCRYPTION_KEY secret, which is generated once and never revealed.
 */
const VERSION = "v1";

function key(): Buffer {
  const raw = process.env["SETTINGS_ENCRYPTION_KEY"];
  if (!raw) throw new Error("SETTINGS_ENCRYPTION_KEY is not configured");
  // Normalise any secret length to exactly 32 bytes.
  return createHash("sha256").update(raw, "utf8").digest();
}

export function encryptSetting(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const packed = Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
  return `${VERSION}:${packed}`;
}

export function decryptSetting(stored: string): string {
  const packed = stored.startsWith(`${VERSION}:`) ? stored.slice(VERSION.length + 1) : stored;
  const buf = Buffer.from(packed, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

/** `••••••4821` — safe to show in the settings screen. */
export function maskSetting(plaintext: string): string {
  const tail = plaintext.slice(-4);
  return `${"•".repeat(Math.max(4, Math.min(12, plaintext.length - 4)))}${tail}`;
}