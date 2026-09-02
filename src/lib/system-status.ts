/**
 * One description of "how is this till doing right now", shared by every
 * status surface in the app.
 *
 * Connectivity comes from the single heartbeat in `connection-health`, the
 * queue numbers from the outbox, and the local database picture from one
 * shared poll of the desktop bridge (instead of a timer per component).
 */
import { useEffect, useState } from "react";
import {
  connectivity,
  subscribeConnectivity,
  type Connectivity,
} from "@/core/activation/connection-health";
import { hasLocalDb, localDb, type LocalSyncStatus } from "@/core/local-db/local-db";
import { subscribeSyncState, syncState } from "./sync-status";
import { conflictCount, isOnlineSyncEnabled, pendingCount, subscribeOutbox } from "./sync-outbox";
import { databaseModeLabel } from "@/core/local-db/db-mode";

export type StatusTone = "connecting" | "ok" | "busy" | "offline" | "error";

export type LocalDbHealth = {
  connected: boolean;
  server: string | null;
  database: string | null;
  lastReadAt: string | null;
  lastWriteAt: string | null;
};

/* ------------------------- shared local DB poll ------------------------- */

const EMPTY_LOCAL: LocalDbHealth = {
  connected: false,
  server: null,
  database: null,
  lastReadAt: null,
  lastWriteAt: null,
};

let localHealth: LocalDbHealth = EMPTY_LOCAL;
const localListeners = new Set<() => void>();
let localTimer: ReturnType<typeof setInterval> | undefined;
let localOff: (() => void) | undefined;

function absorb(status: LocalSyncStatus | null | undefined) {
  if (!status) return;
  const loose = status as unknown as Record<string, unknown>;
  const stamp = (key: string): string | null => {
    const value = loose[key];
    return typeof value === "string" ? value : null;
  };
  const next: LocalDbHealth = {
    connected: !!status.connected,
    server: (status as { server?: string }).server ?? null,
    database: (status as { database?: string }).database ?? null,
    lastReadAt: stamp("lastReadAt") ?? stamp("lastPullAt") ?? localHealth.lastReadAt,
    lastWriteAt: stamp("lastWriteAt") ?? stamp("lastPushAt") ?? localHealth.lastWriteAt,
  };
  localHealth = next;
  for (const l of localListeners) l();
}

/** Start (or join) the single local-database status poll. */
function ensureLocalPoll() {
  if (localTimer || !hasLocalDb()) return;
  const bridge = localDb();
  if (!bridge) return;
  const read = () => void bridge.status().then(absorb).catch(() => {});
  read();
  localTimer = setInterval(read, 10_000);
  localOff = bridge.onStatus?.((s) => absorb(s));
}

function releaseLocalPoll() {
  if (localListeners.size) return;
  if (localTimer) clearInterval(localTimer);
  localTimer = undefined;
  localOff?.();
  localOff = undefined;
}

export function useLocalDbHealth(): LocalDbHealth {
  const [, force] = useState(0);
  useEffect(() => {
    const bump = () => force((n) => n + 1);
    localListeners.add(bump);
    ensureLocalPoll();
    return () => {
      localListeners.delete(bump);
      releaseLocalPoll();
    };
  }, []);
  return localHealth;
}

/* ---------------------------- unified status ---------------------------- */

export type SystemStatus = {
  connectivity: Connectivity;
  tone: StatusTone;
  /** Short line for the badge. */
  label: string;
  /** Long line for the details panel. */
  detail: string;
  pending: number;
  conflicts: number;
  syncing: boolean;
  syncEnabled: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
  credentialsInvalid: boolean;
  cloudConfigured: boolean | null;
  databaseMode: string;
  local: LocalDbHealth;
};

export function describeStatus(input: {
  connectivity: Connectivity;
  pending: number;
  conflicts: number;
  syncing: boolean;
  syncEnabled: boolean;
  credentialsInvalid: boolean;
  lastError: string | null;
}): { tone: StatusTone; label: string; detail: string } {
  if (input.connectivity === "connecting")
    return { tone: "connecting", label: "Connecting…", detail: "Checking the connection…" };
  if (input.credentialsInvalid)
    return {
      tone: "error",
      label: "Check credentials",
      detail: "The central database rejected this device's keys — sync is paused.",
    };
  if (input.connectivity === "offline")
    return {
      tone: "offline",
      label: input.pending ? `Offline · ${input.pending}` : "Offline",
      detail: input.pending
        ? `Offline — ${input.pending} change(s) waiting to sync.`
        : "Offline — working from this device.",
    };
  if (input.conflicts || input.lastError)
    return {
      tone: "error",
      label: input.conflicts ? `${input.conflicts} to fix` : "Sync failed",
      detail: input.conflicts
        ? `${input.conflicts} change(s) need attention.`
        : `Sync failed — retrying. ${input.lastError ?? ""}`.trim(),
    };
  if (!input.syncEnabled)
    return { tone: "offline", label: "Sync paused", detail: "Online sync is switched off." };
  if (input.syncing)
    return {
      tone: "busy",
      label: input.pending ? `Syncing ${input.pending}…` : "Syncing…",
      detail: input.pending ? `Syncing — ${input.pending} item(s) pending.` : "Syncing…",
    };
  if (input.pending)
    return {
      tone: "busy",
      label: `${input.pending} pending`,
      detail: `${input.pending} item(s) waiting for the next sync pass.`,
    };
  return { tone: "ok", label: "Synced", detail: "Online — everything is synced." };
}

/** The one status hook every indicator uses. */
export function useSystemStatus(): SystemStatus {
  const [, force] = useState(0);
  const local = useLocalDbHealth();

  useEffect(() => {
    const bump = () => force((n) => n + 1);
    const offs = [subscribeOutbox(bump), subscribeSyncState(bump), subscribeConnectivity(bump)];
    const timer = setInterval(bump, 10_000);
    return () => {
      offs.forEach((off) => off());
      clearInterval(timer);
    };
  }, []);

  const sync = syncState();
  const pending = pendingCount();
  const conflicts = conflictCount();
  const conn = connectivity();
  const syncEnabled = isOnlineSyncEnabled();
  const { tone, label, detail } = describeStatus({
    connectivity: conn,
    pending,
    conflicts,
    syncing: sync.phase === "syncing",
    syncEnabled,
    credentialsInvalid: sync.credentialsInvalid,
    lastError: sync.lastError,
  });

  return {
    connectivity: conn,
    tone,
    label,
    detail,
    pending,
    conflicts,
    syncing: sync.phase === "syncing",
    syncEnabled,
    lastSyncAt: sync.lastSyncAt,
    lastError: sync.lastError,
    credentialsInvalid: sync.credentialsInvalid,
    cloudConfigured: sync.cloudConfigured,
    databaseMode: databaseModeLabel(),
    local,
  };
}
