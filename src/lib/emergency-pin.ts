/**
 * Emergency Access PIN — the code that unlocks the recovery screen.
 *
 * The PIN is never stored anywhere. It is derived, one code per minute, from
 * a random per-device secret and the device's own clock, so verification needs
 * no internet, no cloud, no local database and nobody signed in.
 *
 * - Windows (Electron): the secret stays in the main process, sealed in the OS
 *   vault; the renderer can only ask whether a code is right.
 * - Android: the secret lives in the Keystore-backed secure store, created on
 *   first use, and the code is checked here with WebCrypto.
 *
 * A few minutes of clock drift either side are accepted so a slightly wrong
 * device clock never locks a terminal out of its own recovery screen.
 */
import { isWindowsShell, isMobileShell } from "@/platform-config/features";
import { verifyFallbackPin } from "@/lib/emergency-fallback-pin";

const ANDROID_SECRET_KEY = "pos.emergency.secret";

/** The slice of the desktop bridge this module needs. */
type EmergencyBridge = {
  verifyEmergencyPin?: (pin: string) => Promise<{ ok: boolean }>;
  emergencyFingerprint?: () => Promise<{ ok: boolean; fingerprint?: string }>;
};

const bridge = (): EmergencyBridge | null =>
  typeof window === "undefined"
    ? null
    : ((window as unknown as { pos?: EmergencyBridge }).pos ?? null);
/** Minutes of clock drift accepted either side of the current minute. */
export const PIN_DRIFT_MINUTES = 3;

/** `YYYYMMDDHHmm` in the device's own local time — the slot a code covers. */
export function slotAt(date: Date): string {
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return (
    `${p(date.getFullYear(), 4)}${p(date.getMonth() + 1)}${p(date.getDate())}` +
    `${p(date.getHours())}${p(date.getMinutes())}`
  );
}

/** Six digits from HMAC-SHA256(secret, slot) — never the raw date string. */
export async function pinForSlot(secret: string, slot: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret) as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(slot) as BufferSource));
  const offset = mac[mac.length - 1]! & 0x0f;
  const value =
    ((mac[offset]! & 0x7f) << 24) |
    ((mac[offset + 1]! & 0xff) << 16) |
    ((mac[offset + 2]! & 0xff) << 8) |
    (mac[offset + 3]! & 0xff);
  return String(value % 1_000_000).padStart(6, "0");
}

/** Constant-time compare of two equal-length codes. */
function sameCode(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Check a code against the current minute and the drift window around it. */
export async function verifyPinWithSecret(
  secret: string,
  pin: string,
  drift = PIN_DRIFT_MINUTES,
  now = Date.now(),
): Promise<boolean> {
  const code = String(pin ?? "").trim();
  if (!/^\d{6}$/.test(code)) return false;
  for (let i = -drift; i <= drift; i += 1) {
    const expected = await pinForSlot(secret, slotAt(new Date(now + i * 60_000)));
    if (sameCode(code, expected)) return true;
  }
  return false;
}

type SecureStoragePluginType = {
  get(options: { key: string }): Promise<{ value: string }>;
  set(options: { key: string; value: string }): Promise<{ value: boolean }>;
};

/**
 * The plugin handle is returned wrapped: a Capacitor plugin Proxy answers
 * every property — `then` included — with a native call, so returning it
 * straight from an `async` function makes the runtime call `plugin.then(...)`.
 */
async function androidStore(): Promise<{ value: SecureStoragePluginType } | null> {
  try {
    const mod = await import("capacitor-secure-storage-plugin");
    const plugin = mod.SecureStoragePlugin as unknown as SecureStoragePluginType | undefined;
    if (!plugin || typeof plugin.get !== "function") return null;
    return { value: plugin };
  } catch {
    return null;
  }
}

const randomSecret = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

/** Android only: the device secret, created in the Keystore on first use. */
async function androidSecret(): Promise<string | null> {
  const loaded = await androidStore();
  if (!loaded) return null;
  const store = loaded.value;
  const existing = await store.get({ key: ANDROID_SECRET_KEY }).then(
    (r) => r.value,
    () => "",
  );
  if (existing && existing.length >= 32) return existing;
  const fresh = randomSecret();
  try {
    await store.set({ key: ANDROID_SECRET_KEY, value: fresh });
  } catch {
    return null;
  }
  return fresh;
}

/** True when this device can check a recovery code at all. */
export async function emergencyPinAvailable(): Promise<boolean> {
  // The clock-only fallback code needs nothing stored, so a terminal can
  // always be opened even when its secure store is unavailable.
  if (isWindowsShell()) return true;
  if (isMobileShell()) return true;
  return false;
}

/**
 * The device recovery secret, for the one purpose of escrowing it with the
 * company's own backend (`emergency-escrow.ts`) so the owner can read a live
 * code off the admin screen. Nothing else may call this, and it never returns
 * anything in a plain browser.
 */
export async function deviceEmergencySecret(): Promise<string | null> {
  const desktop = bridge() as { emergencyEscrowSecret?: () => Promise<{ secret?: string }> } | null;
  if (isWindowsShell() && desktop?.emergencyEscrowSecret) {
    try {
      const res = await desktop.emergencyEscrowSecret();
      return res?.secret && res.secret.length >= 32 ? res.secret : null;
    } catch {
      return null;
    }
  }
  if (isMobileShell()) return androidSecret();
  return null;
}


/**
 * Guessing brake for the phone. Windows enforces its own in the main process;
 * on Android the check happens here, so the pause lives here too — a screen
 * that is reloaded still faces it because the module stays loaded with the app.
 */
const guesses = { count: 0, until: 0 };
const lockMs = (n: number) => Math.min(15 * 60_000, 30_000 * 2 ** Math.max(0, n - 5));

/** Seconds left on the local guessing lock, 0 when open. */
export const emergencyLockSeconds = (): number =>
  Math.max(0, Math.ceil((guesses.until - Date.now()) / 1000));

/** Verify a typed code on this device. Never stores or logs the code. */
export async function verifyEmergencyPin(pin: string): Promise<boolean> {
  const code = String(pin ?? "").trim();
  if (!/^\d{6}$/.test(code)) return false;
  // Either code opens the gate: the device code, or the clock-only fallback.
  if (isWindowsShell() || isMobileShell()) {
    if (isMobileShell() && guesses.until > Date.now()) return false;
    if (await verifyFallbackPin(code)) {
      guesses.count = 0;
      guesses.until = 0;
      return true;
    }
  }
  const desktop = bridge();
  if (isWindowsShell() && desktop?.verifyEmergencyPin) {
    try {
      const res = await desktop.verifyEmergencyPin(code);
      return Boolean(res?.ok);
    } catch {
      return false;
    }
  }
  if (isMobileShell()) {
    if (guesses.until > Date.now()) return false;
    const secret = await androidSecret();
    if (!secret) return false;
    const ok = await verifyPinWithSecret(secret, code);
    if (ok) {
      guesses.count = 0;
      guesses.until = 0;
      return true;
    }
    guesses.count += 1;
    if (guesses.count >= 5) guesses.until = Date.now() + lockMs(guesses.count);
    return false;
  }
  return false;
}


/** Short non-secret fingerprint support uses to pick the right device secret. */
export async function emergencyFingerprint(): Promise<string> {
  const desktop = bridge();
  if (isWindowsShell() && desktop?.emergencyFingerprint) {
    try {
      const res = await desktop.emergencyFingerprint();
      return res?.fingerprint ?? "";
    } catch {
      return "";
    }
  }
  if (isMobileShell()) {
    const secret = await androidSecret();
    if (!secret) return "";
    const digest = new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret) as BufferSource),
    );
    return Array.from(digest.slice(0, 4))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase();
  }
  return "";
}
