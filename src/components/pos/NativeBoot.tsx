/**
 * Phone start-up gate.
 *
 * On Android the offline state lives in the device's own storage, so it has to
 * be pulled back into `localStorage` before any provider reads it. On web and
 * desktop this renders its children straight away.
 */
import { useEffect, useState } from "react";

import { isNative } from "../../lib/native";
import { hydrateNativeStorage } from "../../lib/mobile-storage";

export function NativeBoot({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(() => !isNative());

  useEffect(() => {
    if (ready) return;
    let cancelled = false;
    void hydrateNativeStorage().finally(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
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