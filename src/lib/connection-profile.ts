/**
 * One restore step for the whole connection profile.
 *
 * A terminal's three connection values live in two different platform stores:
 * the cloud pair in the OS vault (DPAPI on Windows, Keystore on Android) and
 * the backend address in the shell's own configuration store. Both are read
 * asynchronously, so for the first moments of a launch the in-memory answer to
 * "is this device configured?" is simply *not known yet*.
 *
 * Before this module existed, each half was restored by a different part of
 * start-up, and readiness could be evaluated in between — which is how a
 * correctly configured till ended up looking unconfigured and was sent to the
 * setup screen. Everything now waits for `hydrateConnectionProfile()`.
 *
 * The function is memoised, idempotent and safe to await from several places.
 */
import { isTerminalApp } from "@/platform-config/platform";
import { hydrateBackendUrl } from "./backend-config";
import { initCloudConfigFromShell } from "./secure-cloud-config";

export type ProfileHydration = "idle" | "hydrating" | "hydrated";

let state: ProfileHydration = "idle";
let inFlight: Promise<void> | null = null;

/** Where the restore has got to. Synchronous, for gates that cannot await. */
export function connectionProfileState(): ProfileHydration {
  // The website's configuration comes from its hosting environment and is
  // already in the page, so there is nothing to restore.
  if (!isTerminalApp()) return "hydrated";
  return state;
}

export function isConnectionProfileHydrated(): boolean {
  return connectionProfileState() === "hydrated";
}

/**
 * Restore both halves of the profile from platform storage and apply them:
 * the cloud pair becomes the tenant override for every database call, the
 * backend address becomes `window.__POS_SERVER_URL__`.
 */
export function hydrateConnectionProfile(): Promise<void> {
  if (!isTerminalApp()) return Promise.resolve();
  if (state === "hydrated") return Promise.resolve();
  if (inFlight) return inFlight;
  state = "hydrating";
  inFlight = (async () => {
    // Neither half may abort the other: a device with only one of the two
    // stored must still come up as "incomplete", not as "unreadable".
    await Promise.all([
      initCloudConfigFromShell().catch(() => undefined),
      hydrateBackendUrl().catch(() => ""),
    ]);
  })()
    .catch(() => {})
    .then(() => {
      state = "hydrated";
      inFlight = null;
      for (const cb of listeners) {
        try {
          cb();
        } catch {
          /* a broken listener must not hold up start-up */
        }
      }
    });
  return inFlight;
}

/** Resolves once the saved profile is in memory, starting the restore if needed. */
export function awaitProfileHydrated(): Promise<void> {
  return hydrateConnectionProfile();
}

const listeners = new Set<() => void>();

/** Fires once, when the restore completes. */
export function subscribeProfileHydrated(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Test seam: forget that a restore ever happened (simulates a restart). */
export function __resetProfileHydrationForTests(): void {
  state = "idle";
  inFlight = null;
}
