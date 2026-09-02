/**
 * Phone start-up gate.
 *
 * Android runs live-only, so start-up clears any business data left on the
 * device, restores the handful of interface preferences and then checks for a
 * newer web bundle in the update bucket. On web and desktop this renders its
 * children straight away.
 */
import { useEffect, useState } from "react";

import { isNative } from "@/platform-config/platform";
import { onRecoveryScreen } from "../../lib/recovery-route";
import { hydrateNativeStorage } from "@/platforms/mobile/mobile-storage";
import { hydrateBackendUrl } from "../../lib/backend-config";
import { hydrateTerminalConfig } from "@/core/activation/terminal-tokens";
import { applyPendingWebBundle, startWebBundleChecks } from "@/platforms/mobile/web-bundle-updates";
import { TillLoader } from "./TillLoader";

export function NativeBoot({ children }: { children: React.ReactNode }) {
  // Emergency access must open even when start-up work would stall on a dead
  // backend: the repair screen needs none of it.
  const [recovery] = useState(() => onRecoveryScreen());
  const [ready, setReady] = useState(recovery);


  useEffect(() => {
    if (ready) return;
    let cancelled = false;
    // The backend address must be in place before anything tries to sign in.
    void hydrateBackendUrl()
      .catch(() => "")
      .then(() => hydrateNativeStorage())
      // The activation is sealed on the device; unseal it before anything can
      // decide the terminal is not registered.
      .then(() => hydrateTerminalConfig())
      .then(() => applyPendingWebBundle())
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    // Never leave the phone on the splash if a plugin hangs.
    const watchdog = window.setTimeout(() => {
      if (!cancelled) setReady(true);
    }, 6000);
    return () => {
      cancelled = true;
      window.clearTimeout(watchdog);
    };
  }, [ready]);

  // Background check for a newer web bundle once the app is up.
  useEffect(() => {
    if (!ready || recovery || !isNative()) return;
    return startWebBundleChecks();
  }, [ready, recovery]);


  // The splash reports what the till is actually loading against: green for the
  // central database, amber for this device's own copy, blue while syncing.
  if (!ready) return <TillLoader message="Starting the till…" />;
  return <>{children}</>;
}
