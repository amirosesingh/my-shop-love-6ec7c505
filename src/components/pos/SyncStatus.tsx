import { useEffect, useState } from "react";
import { CloudOff, RefreshCw, CloudCheck, TriangleAlert } from "lucide-react";
import { drainOutbox } from "@/lib/sync-engine";
import {
  conflictCount,
  isOnline,
  isOnlineSyncEnabled,
  pendingCount,
  subscribeOutbox,
} from "@/lib/sync-outbox";

/** Header pill: connection, queued writes and a manual push button. */
export function SyncStatus({ className = "" }: { className?: string }) {
  const [, force] = useState(0);
  const bump = () => force((n) => n + 1);

  useEffect(() => {
    const off = subscribeOutbox(bump);
    window.addEventListener("online", bump);
    window.addEventListener("offline", bump);
    const timer = window.setInterval(bump, 10000);
    return () => {
      off();
      window.removeEventListener("online", bump);
      window.removeEventListener("offline", bump);
      window.clearInterval(timer);
    };
  }, []);

  const online = isOnline();
  const syncOn = isOnlineSyncEnabled();
  const pending = pendingCount();
  const conflicts = conflictCount();

  const label = !online
    ? "Offline"
    : !syncOn
      ? "Sync paused"
      : pending
        ? `${pending} pending`
        : "Synced";

  const tone =
    !online || !syncOn
      ? "text-warning"
      : conflicts
        ? "text-destructive"
        : pending
          ? "text-accent"
          : "text-success";

  return (
    <button
      type="button"
      onClick={() => void drainOutbox().then(bump)}
      title={
        conflicts
          ? `${conflicts} operation(s) need attention in Settings → Sync`
          : "Push queued changes now"
      }
      className={`flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs ${className}`}
    >
      {conflicts ? (
        <TriangleAlert className={`h-3.5 w-3.5 ${tone}`} />
      ) : !online || !syncOn ? (
        <CloudOff className={`h-3.5 w-3.5 ${tone}`} />
      ) : pending ? (
        <RefreshCw className={`h-3.5 w-3.5 ${tone}`} />
      ) : (
        <CloudCheck className={`h-3.5 w-3.5 ${tone}`} />
      )}
      <span className={tone}>{label}</span>
    </button>
  );
}
