#!/usr/bin/env node
/**
 * Support tool: print the Emergency Access codes for a terminal.
 *
 * Usage:
 *   node scripts/emergency-pin.cjs [device-secret] [YYYYMMDDHHmm]
 *
 * Two codes open the gate on a till or phone:
 *   - the device code, derived from that terminal's own recovery secret
 *     (Windows OS vault / Android Keystore) — pass the secret to print it;
 *   - the fallback code, derived from the clock alone, which works on every
 *     terminal without knowing anything about it.
 *
 * With no time argument the codes for the current minute are printed;
 * terminals accept +/- 3 minutes of clock drift.
 */
const crypto = require("node:crypto");

/** Keep in step with src/lib/emergency-fallback-pin.ts. */
const FALLBACK_PIN_SALT = "northwind-pos-emergency-v1";

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
const slot = slotArg || slotAt(new Date());

console.log(`slot ${slot}`);
console.log(`fallback code (any terminal)  ${pinForSlot(FALLBACK_PIN_SALT, slot)}`);
if (secret) {
  const fingerprint = crypto
    .createHash("sha256")
    .update(secret)
    .digest("hex")
    .slice(0, 8)
    .toUpperCase();
  console.log(`device code   (terminal ${fingerprint})  ${pinForSlot(secret, slot)}`);
} else {
  console.log("device code   — pass the terminal's recovery secret to print it");
}
