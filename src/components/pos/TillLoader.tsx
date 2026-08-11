/**
 * The start-up screen of the till, with the connection state written on it.
 *
 * Green while the central database answers, amber while the till is working
 * from its own copy, blue and moving while data is being exchanged. It also
 * refuses to spin for ever: after a short wait the operator gets a retry and
 * a way into the app on local data.
 */
import { useEffect, useState } from "react";
import { CloudCheck, CloudOff, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { checkHealth, lastHealth, type HealthReport } from "@/lib/connection-health";
import { subscribeSyncState, syncState } from "@/lib/sync-status";
import { cn } from "@/lib/utils";

type Tone = "online" | "offline" | "syncing";

const TONE = {
  online: {
    bar: "bg-success",
    text: "text-success",
    label: "Online — central database connected",
  },
  offline: {
    bar: "bg-warning",
    text: "text-warning",
    label: "Offline — working from this terminal",
  },
  syncing: { bar: "bg-accent", text: "text-accent", label: "Syncing data…" },
} as const;

/** How long the till may sit on the loader before offering a way out. */
const STALL_MS = 12000;

export function TillLoader({
  message = "Loading store data…",
  onContinueOffline,
}: {
  message?: string;
  onContinueOffline?: () => void;
}) {
  const [health, setHealth] = useState<HealthReport | null>(lastHealth());
  const [phase, setPhase] = useState(syncState().phase);
  const [stalled, setStalled] = useState(false);

  useEffect(() => {
    let live = true;
    const probe = () => void checkHealth(true).then((h) => live && setHealth(h));
    probe();
    const timer = window.setInterval(probe, 4000);
    const off = subscribeSyncState(() => setPhase(syncState().phase));
    const stall = window.setTimeout(() => live && setStalled(true), STALL_MS);
    return () => {
      live = false;
      window.clearInterval(timer);
      window.clearTimeout(stall);
      off();
    };
  }, []);

  const tone: Tone =
    phase === "syncing" ? "syncing" : health?.cloud ? "online" : "offline";
  const style = TONE[tone];

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6">
      <div className="flex items-center gap-2">
        {tone === "offline" ? (
          <CloudOff className={cn("size-5", style.text)} />
        ) : tone === "online" ? (
          <CloudCheck className={cn("size-5", style.text)} />
        ) : (
          <Loader2 className={cn("size-5 animate-spin", style.text)} />
        )}
        <p className="text-sm font-medium">{message}</p>
        {tone === "offline" && (
          <span className="rounded-full border border-warning px-2 py-0.5 text-[11px] uppercase tracking-wide text-warning">
            Offline
          </span>
        )}
      </div>

      <div className="h-1.5 w-64 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full",
            style.bar,
            tone === "syncing" ? "w-1/2 animate-pulse" : tone === "online" ? "w-full" : "w-1/3",
          )}
        />
      </div>

      <p className={cn("text-xs", style.text)}>{style.label}</p>
      {health && (
        <p className="text-xs text-muted-foreground">
          Terminal database {health.local ? "ready" : "unavailable"}
        </p>
      )}

      {stalled && (
        <div className="flex items-center gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
            <RefreshCw className="mr-1.5 size-3.5" /> Try again
          </Button>
          {onContinueOffline && health?.local && (
            <Button size="sm" onClick={onContinueOffline}>
              Continue on this terminal
            </Button>
          )}
        </div>
      )}
    </div>
  );
}