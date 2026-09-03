/**
 * Emergency Access code — the device's own date and time, typed in.
 *
 * There is no secret, nothing stored, nothing sent anywhere. The operator
 * reads the clock on the machine in front of them and types it as twelve
 * digits, `YYYYMMDDHHMM`, in that device's own local time. Android reads the
 * phone clock, Electron the PC clock, the browser its own — one function for
 * all three.
 *
 * One minute either side of the current minute is accepted so a code typed a
 * few seconds late still opens the screen.
 */

/** Digits in a recovery code: `YYYYMMDDHHMM`. */
export const EMERGENCY_CODE_LENGTH = 12;

/** Minutes of tolerance accepted either side of the current minute. */
export const PIN_DRIFT_MINUTES = 1;

/** `YYYYMMDDHHmm` in the device's own local time. */
export function emergencyCodeAt(date: Date): string {
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return (
    `${p(date.getFullYear(), 4)}${p(date.getMonth() + 1)}${p(date.getDate())}` +
    `${p(date.getHours())}${p(date.getMinutes())}`
  );
}

/** Alias kept for call sites that talk in "slots". */
export const slotAt = emergencyCodeAt;

/** Constant-time compare of two equal-length codes. */
function sameCode(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Guessing brake. A wrong code costs nothing to try, so repeated misses pause
 * the gate; the module stays loaded with the app, so a reload still faces it.
 */
const guesses = { count: 0, until: 0 };
const lockMs = (n: number) => Math.min(15 * 60_000, 30_000 * 2 ** Math.max(0, n - 5));

/** Seconds left on the local guessing lock, 0 when open. */
export const emergencyLockSeconds = (): number =>
  Math.max(0, Math.ceil((guesses.until - Date.now()) / 1000));

/** Check a typed code against the device clock. Never stores or logs it. */
export function verifyEmergencyCode(
  pin: string,
  drift = PIN_DRIFT_MINUTES,
  now = Date.now(),
): boolean {
  const code = String(pin ?? "").trim();
  if (!new RegExp(`^\\d{${EMERGENCY_CODE_LENGTH}}$`).test(code)) return false;
  for (let i = -drift; i <= drift; i += 1) {
    if (sameCode(code, emergencyCodeAt(new Date(now + i * 60_000)))) return true;
  }
  return false;
}

/** Verify a typed code on this device, with the guessing brake applied. */
export async function verifyEmergencyPin(pin: string): Promise<boolean> {
  if (guesses.until > Date.now()) return false;
  const ok = verifyEmergencyCode(pin);
  if (ok) {
    guesses.count = 0;
    guesses.until = 0;
    return true;
  }
  guesses.count += 1;
  if (guesses.count >= 5) guesses.until = Date.now() + lockMs(guesses.count);
  return false;
}

/** Every device can check a clock code, so recovery is always available. */
export async function emergencyPinAvailable(): Promise<boolean> {
  return true;
}
