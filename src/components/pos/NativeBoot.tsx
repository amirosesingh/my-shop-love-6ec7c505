/**
 * Phone start-up gate.
 *
 * Android runs live-only, so start-up clears any business data left on the
 * device, restores the handful of interface preferences and then checks for a
 * newer web bundle in the update bucket. On web and desktop this renders its
 * children straight away.
 */
import { useEffect, useState } from "react";

import { isNative } from "../../lib/native";
import { hydrateNativeStorage } from "../../lib/mobile-storage";
import { applyPendingWebBundle, startWebBundleChecks } from "../../lib/web-bundle-updates";

export function NativeBoot({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(() => !isNative());

  useEffect(() => {
    if (ready) return;
    let cancelled = false;
    void hydrateNativeStorage()
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
    if (!ready || !isNative()) return;
    return startWebBundleChecks();
  }, [ready]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Starting the till…</p>
      </div>
    );
  }
  return <>{children}</>;
}
