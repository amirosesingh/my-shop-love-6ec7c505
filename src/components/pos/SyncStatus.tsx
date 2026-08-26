import { useEffect, useState } from "react";
import { CloudOff, RefreshCw, CloudCheck, TriangleAlert, Database } from "lucide-react";
import { drainOutbox } from "@/lib/sync-engine";
import { subscribeSyncState, syncState } from "@/lib/sync-status";
import { databaseModeLabel, effectiveDatabaseMode, subscribeDatabaseMode } from "@/lib/db-mode";
import {
  conflictCount,
  isOnline,
  isOnlineSyncEnabled,
  pendingCount,
  subscribeOutbox,
} from "@/lib/sync-outbox";
import { isOnlineOnly } from "@/lib/live-mode";

/** Header pill: connection, queued writes and a manual push button. */
export function SyncStatus({ className = "" }: { className?: string }) {
  const [, force] = useState(0);
  const bump = () => force((n) => n + 1);

  useEffect(() => {
    const off = subscribeOutbox(bump);
    const offMode = subscribeDatabaseMode(bump);
    const offSync = subscribeSyncState(bump);
    window.addEventListener("online", bump);
    window.addEventListener("offline", bump);
    const timer = window.setInterval(bump, 10000);
    return () => {
      off();
      offMode();
      offSync();
      window.removeEventListener("online", bump);
      window.removeEventListener("offline", bump);
      window.clearInterval(timer);
    };
  }, []);

  const online = isOnline();
  const syncOn = isOnlineSyncEnabled();
  const pending = pendingCount();
  const conflicts = conflictCount();
  const phase = syncState().phase;
  const busy = phase === "syncing";

  const liveOnly = isOnlineOnly();

  const label = liveOnly
    ? online
      ? "Live"
      : "No connection"
    : !online
      ? "Offline"
    : !syncOn
      ? "Sync paused"
      : busy
        ? pending
          ? `Syncing ${pending}…`
          : "Syncing…"
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
      ) : busy || pending ? (
        <RefreshCw className={`h-3.5 w-3.5 ${tone} ${busy ? "animate-spin" : ""}`} />
      ) : (
        <CloudCheck className={`h-3.5 w-3.5 ${tone}`} />
      )}
      <span className={tone}>{label}</span>
      <span
        className="flex items-center gap-1 border-l border-border pl-1.5 text-muted-foreground"
        title={`Database mode: ${databaseModeLabel()}`}
      >
        <Database
          className={`h-3.5 w-3.5 ${effectiveDatabaseMode() === "local" ? "text-warning" : ""}`}
        />
        {databaseModeLabel()}
      </span>
    </button>
  );
}
