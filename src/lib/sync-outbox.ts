/**
 * Offline-first write queue.
 *
 * Every cloud write is described as a serialisable operation and appended to
 * this outbox before it is attempted. The UI updates from local state
 * immediately, so the till keeps selling with no connection; the sync engine
 * drains the queue in order once the network (and the Online Sync toggle)
 * allow it.
 */
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
  /** repeatedly failing ops are parked so they cannot block the queue */
  quarantined?: boolean;
};

const QUEUE_KEY = "pos.sync.outbox";
const FLAG_KEY = "pos.sync.enabled";
const STAMP_KEY = "pos.sync.lastSyncedAt";
export const MAX_ATTEMPTS = 6;

type Listener = () => void;
const listeners = new Set<Listener>();

const isBrowser = () => typeof window !== "undefined";

function read(): QueuedOp[] {
  if (!isBrowser()) return [];
  try {
    return JSON.parse(window.localStorage.getItem(QUEUE_KEY) ?? "[]") as QueuedOp[];
  } catch {
    return [];
  }
}

function write(queue: QueuedOp[]) {
  if (!isBrowser()) return;
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
  const entry: QueuedOp = {
    id: crypto.randomUUID(),
    context,
    op,
    createdAt: new Date().toISOString(),
    attempts: 0,
  };
  write([...read(), entry]);
  return entry;
}

export function resolveOp(id: string) {
  write(read().filter((q) => q.id !== id));
}

export function failOp(id: string, message: string) {
  write(
    read().map((q) =>
      q.id === id
        ? {
            ...q,
            attempts: q.attempts + 1,
            lastError: message,
            quarantined: q.attempts + 1 >= MAX_ATTEMPTS,
          }
        : q,
    ),
  );
}

export function retryQuarantined() {
  write(read().map((q) => (q.quarantined ? { ...q, attempts: 0, quarantined: false } : q)));
}

export function discardQuarantined() {
  write(read().filter((q) => !q.quarantined));
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
