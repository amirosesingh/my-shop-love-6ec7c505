/**
 * Six-state sync badge for the app header.
 *
 * Green  — online and everything is pushed
 * Yellow — a sync cycle is running
 * Orange — offline (or sync paused), with the number of waiting changes
 * Red    — the last cycle ended in an error
 * Slate  — no cloud keys saved on this device yet ("Offline / Unconnected")
 * Red    — the central project rejected the saved keys ("Sync Paused — Check
 *          Credentials"); local trading and the queued sales are unaffected
 *
 * Clicking it opens the Data Sync & Audit hub — or, for the two credential
 * states, the Database & Cloud Connection settings panel.
 */
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { CloudCheck, CloudOff, KeyRound, RefreshCw, TriangleAlert } from "lucide-react";
import { setSyncState, subscribeSyncState, syncState } from "@/lib/sync-status";
import {
  conflictCount,
  isOnline,
  isOnlineSyncEnabled,
  pendingCount,
  subscribeOutbox,
} from "@/lib/sync-outbox";
import { databaseModeLabel } from "@/lib/db-mode";
import { isTerminalApp } from "@/lib/native";
import { cloudKeyStatus, subscribeCloudKeys } from "@/lib/secure-cloud-config";

type Tone = "online" | "syncing" | "offline" | "error" | "unconnected" | "credentials";

const TONE_CLASS: Record<Tone, string> = {
  online: "border-success/40 bg-success/10 text-success",
  syncing: "border-warning/40 bg-warning/10 text-warning",
  offline: "border-accent/40 bg-accent/10 text-accent",
  error: "border-destructive/40 bg-destructive/10 text-destructive",
  unconnected: "border-muted-foreground/40 bg-muted text-muted-foreground",
  credentials: "border-destructive/40 bg-destructive/10 text-destructive",
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

  // Terminal apps: track whether this device has cloud keys at all, and pick
  // up a credential rejection from the desktop sync worker.
  useEffect(() => {
    if (!isTerminalApp()) return;
    const refresh = () =>
      void cloudKeyStatus()
        .then((s) => setSyncState({ cloudConfigured: s.configured }))
        .catch(() => {});
    refresh();
    const offKeys = subscribeCloudKeys(refresh);
    const offWorker = window.pos?.onStatus?.((s) => {
      if (s?.credentialsInvalid && !syncState().credentialsInvalid) {
        setSyncState({
          credentialsInvalid: true,
          lastError:
            "Sync paused — the central database rejected this device's keys. " +
            "Update them in Settings → Database & Cloud Connection.",
        });
      }
    });
    return () => {
      offKeys();
      offWorker?.();
    };
  }, []);

  const online = isOnline();
  const syncOn = isOnlineSyncEnabled();
  const pending = pendingCount();
  const conflicts = conflictCount();
  const { phase, lastError, lastSyncAt, credentialsInvalid, cloudConfigured } = syncState();

  const tone: Tone =
    credentialsInvalid
      ? "credentials"
      : cloudConfigured === false
        ? "unconnected"
        : conflicts || lastError
          ? "error"
          : phase === "syncing"
            ? "syncing"
            : !online || !syncOn
              ? "offline"
              : "online";

  const label =
    tone === "credentials"
      ? "Sync paused — check credentials"
      : tone === "unconnected"
        ? "Offline / Unconnected"
        : tone === "error"
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
    tone === "error"
      ? TriangleAlert
      : tone === "credentials" || tone === "unconnected"
        ? KeyRound
        : tone === "syncing"
          ? RefreshCw
          : tone === "offline"
            ? CloudOff
            : CloudCheck;

  // The two credential states belong to the connection panel, not the sync hub.
  const to = tone === "credentials" || tone === "unconnected" ? "/settings/system" : "/settings/data-sync";

  return (
    <Link
      to={to}
      title={
        tone === "credentials"
          ? "The central database rejected this device's keys — open Settings → Database & Cloud Connection"
          : tone === "unconnected"
            ? "No cloud keys saved on this device — open Settings → Database & Cloud Connection"
            : lastError
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
