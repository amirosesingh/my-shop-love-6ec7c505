/**
 * "No internet connection" screen for the browser and Android builds.
 *
 * Neither holds business data, so every screen needs the backend. When the
 * connection drops this covers the app, watches for the network coming back
 * and reloads the current page automatically. The Windows till never renders
 * it: `isOnlineOnly()` is false there and children pass straight through.
 */
import { useEffect, useState, type ReactNode } from "react";
import { WifiOff, RefreshCw } from "lucide-react";

import { isOnlineOnly } from "../../lib/live-mode";

function online(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

export function OfflineGate({ children }: { children: ReactNode }) {
  const live = isOnlineOnly();
  const [connected, setConnected] = useState(true);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!live) return;
    setConnected(online());
    const up = () => {
      setConnected(true);
      // The screens behind the gate hold no data of their own, so the simplest
      // correct recovery is a clean reload of the page the user was on.
      window.location.reload();
    };
    const down = () => setConnected(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, [live]);

  if (!live || connected) return <>{children}</>;

  const retry = () => {
    setChecking(true);
    if (online()) window.location.reload();
    else setTimeout(() => setChecking(false), 800);
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-8 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
        <WifiOff className="h-7 w-7 text-muted-foreground" aria-hidden />
      </div>
      <h1 className="text-lg font-semibold text-foreground">No internet connection</h1>
      <p className="max-w-xs text-sm text-muted-foreground">
        This app works with live data from your central system, so it needs a connection. It will
        continue automatically as soon as you are back online.
      </p>
      <button
        onClick={retry}
        disabled={checking}
        className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
      >
        <RefreshCw className={`h-4 w-4 ${checking ? "animate-spin" : ""}`} aria-hidden />
        {checking ? "Checking…" : "Try again"}
      </button>
    </div>
  );
}
