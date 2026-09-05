/**
 * One honest answer to "where is sync up to?".
 *
 * Every sync surface reads this: connection, when a pass last finished, when
 * the central database last accepted a change from this till, how many
 * changes are waiting, how many were refused and how old the oldest waiting
 * change is. Derived only — nothing here is a second copy of the truth.
 */
import { useEffect, useState } from "react";

import { classifyFailure, type SyncFailureKind } from "./sync-log";
import { queueView, subscribeOutbox, lastSyncedAt, type QueueView } from "./sync-outbox";
import { subscribeSyncState, syncState } from "./sync-status";

const ACK_KEY = "pos.sync.lastAckAt";

const isBrowser = () => typeof window !== "undefined";

/** The central database accepted a batch from this till, just now. */
export function noteSyncAck(at: string = new Date().toISOString()) {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(ACK_KEY, at);
  } catch {
    /* storage full — the summary simply shows the previous acknowledgement */
  }
}

export function lastSyncAck(): string | null {
  return isBrowser() ? window.localStorage.getItem(ACK_KEY) : null;
}

export type SyncSummary = {
  connection: "online" | "offline";
  busy: boolean;
  /** last time a sync pass finished cleanly */
  lastSyncAt: string | null;
  /** last time the central database confirmed a change from this till */
  lastAckAt: string | null;
  pending: number;
  failed: number;
  /** when the oldest still-waiting change happened */
  oldestPendingAt: string | null;
  /** how many waiting changes fall into each failure reason */
  reasons: Record<SyncFailureKind, number>;
  lastError: string | null;
};

const emptyReasons = (): Record<SyncFailureKind, number> => ({
  network: 0,
  auth: 0,
  conflict: 0,
  validation: 0,
  unknown: 0,
});

/** Why one queued change is stuck, in the same buckets the activity log uses. */
export function queueFailureKind(row: QueueView): SyncFailureKind | null {
  return row.reason ? classifyFailure(row.reason) : null;
}

export function summarise(rows: QueueView[] = queueView()): SyncSummary {
  const engine = syncState();
  const failedRows = rows.filter((r) => r.state === "refused");
  const waiting = rows.filter((r) => r.state !== "refused");

  const reasons = emptyReasons();
  for (const row of rows) {
    const kind = queueFailureKind(row);
    if (kind) reasons[kind] += 1;
  }

  const oldest = waiting
    .map((r) => r.occurredAt ?? r.createdAt)
    .filter(Boolean)
    .sort()[0];

  return {
    connection: engine.phase === "offline" ? "offline" : "online",
    busy: engine.phase === "syncing",
    lastSyncAt: engine.lastSyncAt ?? lastSyncedAt(),
    lastAckAt: lastSyncAck(),
    pending: waiting.length,
    failed: failedRows.length,
    oldestPendingAt: oldest ?? null,
    reasons,
    lastError: engine.lastError,
  };
}

/** Live summary for a screen; updates whenever the queue or the engine moves. */
export function useSyncSummary(): SyncSummary {
  const [summary, setSummary] = useState<SyncSummary>(() => summarise());

  useEffect(() => {
    const refresh = () => setSummary(summarise());
    refresh();
    const offQueue = subscribeOutbox(refresh);
    const offState = subscribeSyncState(refresh);
    const timer = window.setInterval(refresh, 5000);
    return () => {
      offQueue();
      offState();
      window.clearInterval(timer);
    };
  }, []);

  return summary;
}

/** "3 hours ago" — empty when there is nothing to describe. */
export function agoWords(iso: string | null, now: number = Date.now()): string {
  if (!iso) return "";
  const ms = now - Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  if (ms < 60_000) return "just now";
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
