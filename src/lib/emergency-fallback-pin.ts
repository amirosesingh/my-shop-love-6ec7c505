/**
 * Fallback Emergency Access code — the "master" code.
 *
 * Unlike the per-device code, this one is derived from the device clock alone
 * (plus a fixed product salt), so support can work it out for any terminal
 * without knowing that terminal's secret. It changes every minute and accepts
 * the same few minutes of clock drift.
 *
 * It is deliberately the weaker of the two codes: anyone who knows the salt
 * and the time can compute it. It exists so a till is never unreachable.
 *
 * The whole formula lives in this one module so a future TOTP-style scheme
 * replaces it without touching the gate that calls it.
 */

/** Product-wide salt. Changing it invalidates every fallback code at once. */
export const FALLBACK_PIN_SALT = "northwind-pos-emergency-v1";

/** Minutes of clock drift accepted either side of the current minute. */
export const FALLBACK_DRIFT_MINUTES = 3;

/** `YYYYMMDDHHmm` in the device's own local time. */
export function fallbackSlotAt(date: Date): string {
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return (
    `${p(date.getFullYear(), 4)}${p(date.getMonth() + 1)}${p(date.getDate())}` +
    `${p(date.getHours())}${p(date.getMinutes())}`
  );
}

/** Six digits from HMAC-SHA256(salt, slot) — never the raw date string. */
export async function fallbackPinForSlot(slot: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(FALLBACK_PIN_SALT) as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, enc.encode(slot) as BufferSource),
  );
  const offset = mac[mac.length - 1]! & 0x0f;
  const value =
    ((mac[offset]! & 0x7f) << 24) |
    ((mac[offset + 1]! & 0xff) << 16) |
    ((mac[offset + 2]! & 0xff) << 8) |
    (mac[offset + 3]! & 0xff);
  return String(value % 1_000_000).padStart(6, "0");
}

const sameCode = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

/** Check a typed code against the current minute and the drift window. */
export async function verifyFallbackPin(
  pin: string,
  drift = FALLBACK_DRIFT_MINUTES,
  now = Date.now(),
): Promise<boolean> {
  const code = String(pin ?? "").trim();
  if (!/^\d{6}$/.test(code)) return false;
  for (let i = -drift; i <= drift; i += 1) {
    const expected = await fallbackPinForSlot(fallbackSlotAt(new Date(now + i * 60_000)));
    if (sameCode(code, expected)) return true;
  }
  return false;
}
