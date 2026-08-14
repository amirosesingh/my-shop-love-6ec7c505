/**
 * Four-state sync badge for the app header.
 *
 * Green  — online and everything is pushed
 * Yellow — a sync cycle is running
 * Orange — offline (or sync paused), with the number of waiting changes
 * Red    — the last cycle ended in an error
 *
 * Clicking it opens the Data Sync & Audit hub.
 */
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { CloudCheck, CloudOff, RefreshCw, TriangleAlert } from "lucide-react";
import { subscribeSyncState, syncState } from "@/lib/sync-status";
import {
  conflictCount,
  isOnline,
  isOnlineSyncEnabled,
  pendingCount,
  subscribeOutbox,
} from "@/lib/sync-outbox";
import { databaseModeLabel } from "@/lib/db-mode";

type Tone = "online" | "syncing" | "offline" | "error";

const TONE_CLASS: Record<Tone, string> = {
  online: "border-success/40 bg-success/10 text-success",
  syncing: "border-warning/40 bg-warning/10 text-warning",
  offline: "border-accent/40 bg-accent/10 text-accent",
  error: "border-destructive/40 bg-destructive/10 text-destructive",
};

export function useSyncBadge() {
  const [, force] = useState(0);
  const bump = () => force((n) => n + 1);

  useEffect(() => {
    const offQueue = subscribeOutbox(bump);
    const offState = subscribeSyncState(bump);
    window.addEventListener("online", bump);
    window.addEventListener("offline", bump);
    const timer = window.setInterval(bump, 10000);
    return () => {
      offQueue();
      offState();
      window.removeEventListener("online", bump);
      window.removeEventListener("offline", bump);
      window.clearInterval(timer);
    };
  }, []);

  const online = isOnline();
  const syncOn = isOnlineSyncEnabled();
  const pending = pendingCount();
  const conflicts = conflictCount();
  const { phase, lastError, lastSyncAt } = syncState();

  const tone: Tone =
    conflicts || lastError
      ? "error"
      : phase === "syncing"
        ? "syncing"
        : !online || !syncOn
          ? "offline"
          : "online";

  const label =
    tone === "error"
      ? conflicts
        ? `${conflicts} to fix`
        : "Sync error"
      : tone === "syncing"
        ? pending
          ? `Syncing ${pending}…`
          : "Syncing…"
        : tone === "offline"
          ? pending
            ? `Offline · ${pending}`
            : syncOn
              ? "Offline"
              : "Sync paused"
          : pending
            ? `${pending} pending`
            : "Online";

  return { tone, label, pending, conflicts, lastError, lastSyncAt, online, syncOn };
}

export function SyncBadge({ className = "" }: { className?: string }) {
  const { tone, label, lastError, lastSyncAt } = useSyncBadge();

  const Icon =
    tone === "error" ? TriangleAlert : tone === "syncing" ? RefreshCw : tone === "offline" ? CloudOff : CloudCheck;

  return (
    <Link
      to="/settings/data-sync"
      title={
        lastError
          ? `Last error: ${lastError}`
          : lastSyncAt
            ? `Last sync ${new Date(lastSyncAt).toLocaleTimeString()} · ${databaseModeLabel()}`
            : `Open the data sync hub · ${databaseModeLabel()}`
      }
      className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${TONE_CLASS[tone]} ${className}`}
    >
      <Icon className={`h-3.5 w-3.5 ${tone === "syncing" ? "animate-spin" : ""}`} />
      <span className="whitespace-nowrap">{label}</span>
    </Link>
  );
}
