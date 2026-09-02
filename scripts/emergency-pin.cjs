#!/usr/bin/env node
/**
 * Support tool: print the Emergency Access code for a terminal.
 *
 * Usage:
 *   node scripts/emergency-pin.cjs <device-secret> [YYYYMMDDHHmm]
 *
 * The secret is the per-device recovery secret held in the terminal's OS vault
 * (Windows) or Android Keystore. With no time argument the code for the
 * current minute is printed; terminals accept +/- 3 minutes of clock drift.
 */
const crypto = require("node:crypto");

function slotAt(date) {
  const p = (n, w = 2) => String(n).padStart(w, "0");
  return (
    `${p(date.getFullYear(), 4)}${p(date.getMonth() + 1)}${p(date.getDate())}` +
    `${p(date.getHours())}${p(date.getMinutes())}`
  );
}

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

const [secret, slotArg] = process.argv.slice(2);
if (!secret) {
  console.error("Usage: node scripts/emergency-pin.cjs <device-secret> [YYYYMMDDHHmm]");
  process.exit(1);
}
const slot = slotArg || slotAt(new Date());
const fingerprint = crypto.createHash("sha256").update(secret).digest("hex").slice(0, 8).toUpperCase();
console.log(`terminal ${fingerprint}  slot ${slot}  code ${pinForSlot(secret, slot)}`);
