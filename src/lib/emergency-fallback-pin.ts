/**
 * Fallback Emergency Access code — the "master" code.
 *
 * Unlike the per-device code, this one is derived from the device clock alone
 * plus a salt, so an owner can work it out for a till that has never been
 * online. It changes every minute and accepts the same few minutes of drift.
 *
 * The salt used to be compiled into every build, which meant anyone who
 * unpacked an installer could open any till in the world. The salt is now one
 * per company: the backend mints it, hands it to a terminal only over its
 * proven activation token (see `emergency-escrow.ts`), and the terminal seals
 * it with the device key. The old build-time salt is accepted only until a
 * company salt has arrived, so terminals in the field keep working.
 */
import { clearDeviceSecret, getDeviceSecret, setDeviceSecret } from "@/lib/device-secrets";

/**
 * Legacy product-wide salt. Kept only as the compatibility path for a till
 * that has not yet received its company salt. Do not use it for anything new.
 */
export const FALLBACK_PIN_SALT = "northwind-pos-emergency-v1";

const COMPANY_SALT_NAME = "emergency.company-salt";

/** Minutes of clock drift accepted either side of the current minute. */
export const FALLBACK_DRIFT_MINUTES = 3;

type EmergencyBridge = {
  setEmergencyCompanySalt?: (salt: string) => Promise<{ ok: boolean }>;
};

const bridge = (): EmergencyBridge | null =>
  typeof window === "undefined"
    ? null
    : ((window as unknown as { pos?: EmergencyBridge }).pos ?? null);

let cachedSalt: string | null = null;
let saltLoaded = false;

/** The company salt this device has been given, or null while it has none. */
export async function companySalt(): Promise<string | null> {
  if (saltLoaded) return cachedSalt;
  try {
    const stored = await getDeviceSecret<string>(COMPANY_SALT_NAME);
    cachedSalt = typeof stored === "string" && stored.length >= 16 ? stored : null;
  } catch {
    cachedSalt = null;
  }
  saltLoaded = true;
  return cachedSalt;
}

/** Seal the company salt on this device; Windows also hands it to the vault. */
export async function storeCompanySalt(salt: string): Promise<void> {
  const value = String(salt ?? "").trim();
  if (value.length < 16) return;
  cachedSalt = value;
  saltLoaded = true;
  await setDeviceSecret(COMPANY_SALT_NAME, value).catch(() => undefined);
  // The Windows gate verifies in the main process, so it needs its own copy.
  await bridge()?.setEmergencyCompanySalt?.(value)?.catch?.(() => undefined);
}

/** Used by the recovery drill and by tests. */
export async function forgetCompanySalt(): Promise<void> {
  cachedSalt = null;
  saltLoaded = false;
  await Promise.resolve(clearDeviceSecret(COMPANY_SALT_NAME)).catch(() => undefined);
}

/** `YYYYMMDDHHmm` in the device's own local time. */
export function fallbackSlotAt(date: Date): string {
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return (
    `${p(date.getFullYear(), 4)}${p(date.getMonth() + 1)}${p(date.getDate())}` +
    `${p(date.getHours())}${p(date.getMinutes())}`
  );
}

/** Six digits from HMAC-SHA256(salt, slot) — never the raw date string. */
export async function fallbackPinForSlot(
  slot: string,
  salt: string = FALLBACK_PIN_SALT,
): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(salt) as BufferSource,
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

/**
 * Check a typed code against the current minute and the drift window. Once a
 * company salt is present the build-time salt stops opening this device.
 */
export async function verifyFallbackPin(
  pin: string,
  drift = FALLBACK_DRIFT_MINUTES,
  now = Date.now(),
): Promise<boolean> {
  const code = String(pin ?? "").trim();
  if (!/^\d{6}$/.test(code)) return false;
  const salt = (await companySalt()) ?? FALLBACK_PIN_SALT;
  for (let i = -drift; i <= drift; i += 1) {
    const expected = await fallbackPinForSlot(fallbackSlotAt(new Date(now + i * 60_000)), salt);
    if (sameCode(code, expected)) return true;
  }
  return false;
}
