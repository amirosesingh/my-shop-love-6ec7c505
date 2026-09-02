/**
 * Which shell the POS is running inside.
 *
 * The Android build packages the whole app in the APK, so it must never assume
 * a network round-trip is possible. Web and Electron builds are unaffected —
 * every helper here is a no-op outside Capacitor.
 */

type CapacitorGlobal = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
};

const cap = (): CapacitorGlobal | null => {
  if (typeof window === "undefined") return null;
  return (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor ?? null;
};

/** True inside the Android (or iOS) shell. */
export function isNative(): boolean {
  return Boolean(cap()?.isNativePlatform?.());
}

export function isAndroid(): boolean {
  return cap()?.getPlatform?.() === "android";
}

/** True inside the Electron desktop shell (its preload exposes `window.pos`). */
export function isElectron(): boolean {
  return typeof window !== "undefined" && Boolean((window as { pos?: unknown }).pos);
}

/**
 * True only on a real till: the Electron desktop app or the Capacitor mobile
 * app. Plain browsers are back-office only — cashier PIN sign-in is hidden
 * there and admins use email + password.
 */
export function isTerminalApp(): boolean {
  return isNative() || isElectron();
}

/** True when a request to the cloud has any chance of succeeding. */
export function hasConnection(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine;
}

/** Standard message for the handful of features that genuinely need a signal. */
export const NEEDS_CONNECTION =
  "This needs an internet connection. The rest of the till keeps working offline.";