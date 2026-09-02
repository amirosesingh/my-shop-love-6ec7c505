/**
 * Is the app currently sitting on the Emergency Access / Recovery screen?
 *
 * Recovery is the one screen that must render when the backend is unreachable:
 * it exists to repair the very connection every other gate waits for. Both the
 * connection gate and the start-up splash ask this so they can step aside.
 *
 * The path is matched with `endsWith` because the Android shell serves the
 * bundle from a non-root base, so the pathname can be `/android_asset/.../recovery`.
 */
export const RECOVERY_PATH = "/recovery";

export function isRecoveryPath(pathname: string | undefined | null): boolean {
  const path = String(pathname ?? "").replace(/\/+$/, "");
  return path === RECOVERY_PATH || path.endsWith(RECOVERY_PATH);
}

/** Same question, answered from the browser location (safe during SSR). */
export function onRecoveryScreen(): boolean {
  if (typeof window === "undefined") return false;
  return isRecoveryPath(window.location?.pathname);
}
