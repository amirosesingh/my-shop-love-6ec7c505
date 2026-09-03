/**
 * One answer to "is this device configured?" for Android and Windows.
 *
 * A shipped APK or installer carries no tenant: no project URL, no key, no
 * backend address. Everything comes from the device's own secure store — the
 * Electron OS vault or the Android Keystore — written by the setup screen.
 * Until that exists the terminal is simply UNCONFIGURED, which is a normal
 * state, not an error: the app opens setup instead of touching a backend.
 *
 * Nothing here reads web environment values, and nothing here goes to the
 * network. It is a pure local readiness check that every backend-dependent
 * start-up step consults first.
 */
import { isTerminalApp } from "@/platform-config/platform";
import { cloudKeyStatus, subscribeCloudKeys } from "@/lib/secure-cloud-config";
import { hasTerminalSupabaseOverride } from "@/lib/external-supabase-config";

export type ConfigReadiness = {
  /** true when this platform may start backend-dependent work */
  ready: boolean;
  state: "ready" | "missing" | "invalid" | "not-applicable";
  /** short, user-facing reason when the terminal is not ready */
  reason?: string;
};

const looksLikeUrl = (value: string) => /^https:\/\/[^\s/]+\.[^\s/]+/i.test(value.trim());

/**
 * Local-only readiness. Web is always ready — its configuration is supplied by
 * the hosting environment (Cloudflare) and validated elsewhere.
 */
export async function hasRequiredPlatformConfig(): Promise<ConfigReadiness> {
  if (!isTerminalApp()) return { ready: true, state: "not-applicable" };
  try {
    const status = await cloudKeyStatus();
    if (!status.configured) {
      return {
        ready: false,
        state: "missing",
        reason: "This terminal has no central database configured yet.",
      };
    }
    if (!looksLikeUrl(status.url)) {
      return {
        ready: false,
        state: "invalid",
        reason: "The saved central database address is not a valid https:// URL.",
      };
    }
    return { ready: true, state: "ready" };
  } catch (error) {
    return {
      ready: false,
      state: "invalid",
      reason: error instanceof Error ? error.message : "Saved configuration could not be read.",
    };
  }
}

/** Synchronous best-effort answer for hot paths that cannot await. */
export function platformConfigReadySync(): boolean {
  if (!isTerminalApp()) return true;
  return hasTerminalSupabaseOverride();
}

/** Re-run the check whenever the device's stored credentials change. */
export function subscribeConfigReady(fn: (state: ConfigReadiness) => void): () => void {
  const run = () => void hasRequiredPlatformConfig().then(fn).catch(() => {});
  run();
  return subscribeCloudKeys(run);
}
