/**
 * Connection gate for the browser and Android builds.
 *
 * Neither holds business data, so every screen needs the backend. Nothing is
 * ever declared offline on a guess: while the first heartbeat is still in
 * flight the app shows only the pulsing cloud icon — no logo, no toast, no
 * error — and it keeps showing it for as long as the check takes. The Windows
 * till never renders the gate: `isOnlineOnly()` is false there.
 */
import { useEffect, useState, type ReactNode } from "react";
import { CloudOff, LifeBuoy, RefreshCw } from "lucide-react";
import { Link, useRouterState } from "@tanstack/react-router";

import { isOnlineOnly } from "@/lib/live-mode";
import { isRecoveryPath, onRecoveryScreen } from "@/lib/recovery-route";
import {
  connectivity,
  heartbeat,
  startConnectivityMonitor,
  subscribeConnectivity,
  type Connectivity,
} from "@/core/activation/connection-health";
import { syncConfig } from "@/lib/sync-config";

export function OfflineGate({ children }: { children: ReactNode }) {
  const live = isOnlineOnly();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // Emergency access repairs the connection this gate is waiting for, so it
  // must never be gated — on any platform, including a cold deep link.
  const recovery = isRecoveryPath(pathname) || onRecoveryScreen();
  const [state, setState] = useState<Connectivity>(connectivity());
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (recovery) return;
    // Safe on every platform: the monitor only ever starts once.
    const stop = startConnectivityMonitor(syncConfig().heartbeatMs);
    setState(connectivity());
    const off = subscribeConnectivity(setState);
    return () => {
      off();
      stop();
    };
  }, [recovery]);

  if (!live || recovery) return <>{children}</>;


  // Still checking: the cloud icon alone, nothing else on screen.
  if (state === "connecting")
    return (
      <div
        className="flex min-h-screen items-center justify-center bg-background"
        role="status"
        aria-label="Connecting"
      >
        <span className="relative flex size-12 items-center justify-center">
          <span className="absolute inline-flex size-12 animate-ping rounded-full bg-primary/20" />
          <CloudIconPulse />
        </span>
      </div>
    );

  if (state === "online") return <>{children}</>;

  const retry = () => {
    setChecking(true);
    void heartbeat().finally(() => setChecking(false));
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-8 text-center">
      <CloudOff className="size-10 text-destructive" aria-hidden />
      <h1 className="text-lg font-semibold text-foreground">No connection</h1>
      <p className="max-w-xs text-sm text-muted-foreground">
        This app works with live data from your central system. It will continue automatically as
        soon as the connection is back.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          onClick={retry}
          disabled={checking}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${checking ? "animate-spin" : ""}`} aria-hidden />
          {checking ? "Checking…" : "Try again"}
        </button>
        {/* The way back in when the address itself is what is wrong. Router
            navigation, never a page load: a hard load would restart the shell
            and put this gate straight back in front of the repair screen. */}
        <Link
          to="/recovery"
          className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground"
        >
          <LifeBuoy className="h-4 w-4" aria-hidden />
          Emergency access
        </Link>

      </div>
    </div>
  );
}

function CloudIconPulse() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="relative size-8 animate-pulse text-primary"
      aria-hidden
    >
      <path d="M17.5 19a4.5 4.5 0 0 0 0-9 6 6 0 0 0-11.6 1.6A3.7 3.7 0 0 0 6.5 19Z" />
    </svg>
  );
}
