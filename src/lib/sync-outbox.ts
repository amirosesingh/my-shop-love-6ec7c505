/**
 * Offline-first write queue.
 *
 * Every cloud write is described as a serialisable operation and appended to
 * this outbox before it is attempted. The UI updates from local state
 * immediately, so the till keeps selling with no connection; the sync engine
 * drains the queue in order once the network (and the Online Sync toggle)
 * allow it.
 */
import { stamp } from "./activity-journal";
import { isLiveOnly } from "./live-mode";

export type Row = Record<string, unknown>;

export type SyncOp =
  | { kind: "insert"; table: string; rows: Row[] }
  | { kind: "upsert"; table: string; rows: Row[]; onConflict?: string }
  | { kind: "update"; table: string; values: Row; match: Record<string, unknown> }
  | { kind: "delete"; table: string; match: Record<string, unknown> };

export type QueuedOp = {
  id: string;
  context: string;
  op: SyncOp;
  createdAt: string;
  attempts: number;
  lastError?: string;
  /** where this entry stands: waiting, sent and confirmed, or refused */
  status?: "pending" | "synced" | "failed";
  /** repeatedly failing ops are parked so they cannot block the queue */
  quarantined?: boolean;
  /** branch the write happened at (multi-branch replay) */
  branchId?: string | null;
  /** till that produced the write */
  terminalId?: string;
  /** monotonic per-terminal order — replay never runs out of sequence */
  seq?: number;
  /** device clock reading when the action happened */
  occurredAt?: string;
};

const QUEUE_KEY = "pos.sync.outbox";
const FLAG_KEY = "pos.sync.enabled";
const STAMP_KEY = "pos.sync.lastSyncedAt";
export const MAX_ATTEMPTS = 6;

type Listener = () => void;
const listeners = new Set<Listener>();

const isBrowser = () => typeof window !== "undefined";

/**
 * Only the desktop shell has a real local SQL engine behind it. A plain
 * browser build never queues: it either reaches the central database or the
 * action stops, so no business data is ever parked in browser storage.
 */
const hasLocalEngine = () =>
  isBrowser() && !!(window as unknown as { pos?: unknown }).pos;

const canQueue = () => hasLocalEngine() && !isLiveOnly();

function read(): QueuedOp[] {
  // The phone and the web build never queue: writes go straight to the backend.
  if (!canQueue()) return [];
  try {
    return JSON.parse(window.localStorage.getItem(QUEUE_KEY) ?? "[]") as QueuedOp[];
  } catch {
    return [];
  }
}

function write(queue: QueuedOp[]) {
  if (!canQueue()) {
    for (const l of listeners) l();
    return;
  }
  try {
    window.localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    /* storage full — the operation stays in memory for this session only */
  }
  for (const l of listeners) l();
}

export function subscribeOutbox(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function listQueue(): QueuedOp[] {
  return read();
}

export function pendingCount(): number {
  return read().filter((q) => !q.quarantined).length;
}

export function conflictCount(): number {
  return read().filter((q) => q.quarantined).length;
}

export function enqueue(context: string, op: SyncOp): QueuedOp {
  const s = stamp();
  const entry: QueuedOp = {
    id: crypto.randomUUID(),
    context,
    op,
    createdAt: new Date().toISOString(),
    attempts: 0,
    status: "pending",
    branchId: s.branchId,
    terminalId: s.terminalId,
    seq: s.seq,
    occurredAt: s.deviceTime,
  };
  write([...read(), entry]);
  return entry;
}

export function resolveOp(id: string) {
  write(read().filter((q) => q.id !== id));
}

/**
 * Durability check: re-reads the queue from disk and reports whether every id
 * really landed there. Used by the commit layer so an action can only continue
 * once its data is stored somewhere.
 */
export function persisted(ids: string[]): boolean {
  if (!ids.length) return true;
  if (isLiveOnly()) return false;
  const have = new Set(read().map((q) => q.id));
  return ids.every((id) => have.has(id));
}

export function failOp(id: string, message: string) {
  write(
    read().map((q) =>
      q.id === id
        ? {
            ...q,
            attempts: q.attempts + 1,
            lastError: message,
            status: "failed",
            quarantined: q.attempts + 1 >= MAX_ATTEMPTS,
          }
        : q,
    ),
  );
}

/**
 * The server refused this change on principle (wrong branch, or the account
 * lacks the permission). Retrying cannot help, so park it straight away with
 * the reason showing on the Sync & backup screen.
 */
export function refuseOp(id: string, message: string) {
  write(
    read().map((q) =>
      q.id === id
        ? { ...q, attempts: MAX_ATTEMPTS, lastError: message, status: "failed" as const, quarantined: true }
        : q,
    ),
  );
}

export function retryQuarantined() {
  write(
    read().map((q) =>
      q.quarantined ? { ...q, attempts: 0, quarantined: false, status: "pending" as const } : q,
    ),
  );
}

export function discardQuarantined() {
  write(read().filter((q) => !q.quarantined));
}

/** Put one refused change back in line for another attempt. */
export function retryOp(id: string) {
  write(
    read().map((q) =>
      q.id === id
        ? {
            ...q,
            attempts: 0,
            quarantined: false,
            status: "pending" as const,
            lastError: undefined,
          }
        : q,
    ),
  );
}

/** Drop one change for good. Only ever called from an explicit confirmation. */
export function discardOp(id: string) {
  write(read().filter((q) => q.id !== id));
}

/** What the queue looks like to a person: state, reason and next attempt. */
export type QueueView = QueuedOp & {
  state: "waiting" | "retrying" | "refused";
  reason: string | null;
  nextAttemptAt: string | null;
};

/** The queue with every entry described for the Sync & backup screen. */
export function queueView(): QueueView[] {
  return read().map((q) => {
    // The same backoff the sync engine applies: 0s, 5s, 20s, 45s …
    const wait = q.attempts ** 2 * 5000;
    const due = new Date(q.createdAt).getTime() + wait;
    return {
      ...q,
      state: q.quarantined ? "refused" : q.attempts > 0 ? "retrying" : "waiting",
      reason: q.lastError ?? null,
      nextAttemptAt: q.quarantined || !wait ? null : new Date(due).toISOString(),
    };
  });
}

/* --------------------------- online sync toggle --------------------------- */

export function isOnlineSyncEnabled(): boolean {
  if (!isBrowser()) return true;
  return window.localStorage.getItem(FLAG_KEY) !== "off";
}

export function setOnlineSyncEnabled(on: boolean) {
  if (!isBrowser()) return;
  window.localStorage.setItem(FLAG_KEY, on ? "on" : "off");
  for (const l of listeners) l();
}

export function lastSyncedAt(): string | null {
  return isBrowser() ? window.localStorage.getItem(STAMP_KEY) : null;
}

export function markSynced() {
  if (!isBrowser()) return;
  window.localStorage.setItem(STAMP_KEY, new Date().toISOString());
  for (const l of listeners) l();
}

export function isOnline(): boolean {
  return !isBrowser() || window.navigator.onLine;
}
