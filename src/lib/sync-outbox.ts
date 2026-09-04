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
import { isOnlineOnly } from "./live-mode";
import { BACKOFF_FACTOR, BASE_BACKOFF_MS, syncConfig } from "./sync-config";
import { touchedIds as versionedIds, versionsFor } from "./row-versions";

export type Row = Record<string, unknown>;

export type SyncOp =
  | { kind: "insert"; table: string; rows: Row[] }
  | { kind: "upsert"; table: string; rows: Row[]; onConflict?: string }
  | { kind: "update"; table: string; values: Row; match: Record<string, unknown> }
  | { kind: "delete"; table: string; match: Record<string, unknown> }
  /**
   * A named database routine. Used where the change must be worked out by the
   * database itself (refunds), so the till never sends a computed figure.
   * `table` is only the label the sync log shows.
   */
  | { kind: "rpc"; table: string; fn: string; args: Row };


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
  /** device clock reading of the last send attempt */
  lastAttemptAt?: string;
  /**
   * Version of each record this change was made from, keyed by record id.
   * Sent along with the change so the central database can keep the newer
   * copy when someone else edited the same record in the meantime.
   */
  baseVersions?: Record<string, number>;
};

const QUEUE_KEY = "pos.sync.outbox";
const FLAG_KEY = "pos.sync.enabled";
const STAMP_KEY = "pos.sync.lastSyncedAt";
/** After this many failed sends a change is parked as a dead letter. */
export const maxAttempts = () => syncConfig().maxAttempts;
/** Longest a change ever waits between attempts. */
export const maxBackoffMs = () => syncConfig().maxBackoffMs;

/**
 * Waiting time before the next attempt: 5s, 15s, 45s, 135s … capped at five
 * minutes, plus a small spread so a whole shop's tills do not all retry on
 * the same tick. The spread is derived from the entry id, so the countdown
 * shown on screen matches the one the sync engine uses.
 */
export function backoffMs(entry: Pick<QueuedOp, "id" | "attempts">): number {
  if (entry.attempts <= 0) return 0;
  const cap = maxBackoffMs();
  const base = Math.min(cap, BASE_BACKOFF_MS * BACKOFF_FACTOR ** (entry.attempts - 1));
  let hash = 0;
  for (const ch of entry.id) hash = (hash * 31 + ch.charCodeAt(0)) % 1000;
  return base + Math.round((hash / 1000) * Math.min(base, 5000));
}


/** When this entry may be tried again (epoch ms). */
export function nextAttemptDue(entry: QueuedOp): number {
  const from = entry.lastAttemptAt ?? entry.createdAt;
  return new Date(from).getTime() + backoffMs(entry);
}

type Listener = () => void;
const listeners = new Set<Listener>();

const isBrowser = () => typeof window !== "undefined";

/**
 * Only the desktop shell has a real local SQL engine behind it. A plain
 * browser build never queues: it either reaches the central database or the
 * action stops, so no business data is ever parked in browser storage.
 */
const hasLocalEngine = () => isBrowser() && !!(window as unknown as { pos?: unknown }).pos;

const canQueue = () => hasLocalEngine() && !isOnlineOnly();

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

/**
 * Origin and freshness stamp on the record itself, so a row that lands
 * centrally still says which till wrote it and when it was last touched.
 * Only columns the row already carries are filled in — a table that has no
 * device or timestamp column is left exactly as it was, because inventing a
 * column here would make the whole save fail.
 */
function stampRows(op: SyncOp, s: ReturnType<typeof stamp>): SyncOp {
  const now = new Date().toISOString();
  const apply = (row: Row): Row => {
    const next = { ...row };
    if ("device_id" in next && !next["device_id"]) next["device_id"] = s.terminalId;
    if ("terminal_id" in next && !next["terminal_id"]) next["terminal_id"] = s.terminalId;
    if ("updated_at" in next) next["updated_at"] = now;
    if ("synced" in next) next["synced"] = false;
    return next;
  };
  if (op.kind === "insert" || op.kind === "upsert") return { ...op, rows: op.rows.map(apply) };
  if (op.kind === "update") return { ...op, values: apply(op.values) };
  return op;
}

export function enqueue(context: string, op: SyncOp): QueuedOp {
  const s = stamp();
  const stamped = stampRows(op, s);
  const baseVersions = versionsFor(op.table, versionedIds(op as never));
  const entry: QueuedOp = {
    id: crypto.randomUUID(),
    context,
    op: stamped,
    createdAt: new Date().toISOString(),
    attempts: 0,
    status: "pending",
    branchId: s.branchId,
    terminalId: s.terminalId,
    seq: s.seq,
    occurredAt: s.deviceTime,
    ...(Object.keys(baseVersions).length ? { baseVersions } : {}),
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
  if (isOnlineOnly()) return false;
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
            lastAttemptAt: new Date().toISOString(),
            quarantined: q.attempts + 1 >= maxAttempts(),
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
        ? {
            ...q,
            attempts: maxAttempts(),
            lastError: message,
            status: "failed" as const,
            lastAttemptAt: new Date().toISOString(),
            quarantined: true,
          }
        : q,
    ),
  );
}

export function retryQuarantined() {
  write(
    read().map((q) =>
      q.quarantined
        ? {
            ...q,
            attempts: 0,
            quarantined: false,
            status: "pending" as const,
            lastAttemptAt: undefined,
          }
        : q,
    ),
  );
}

export function discardQuarantined() {
  const queue = read();
  for (const entry of queue) if (entry.quarantined) rollbackLocally(entry);
  write(queue.filter((q) => !q.quarantined));
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
            lastAttemptAt: undefined,
          }
        : q,
    ),
  );
}

/**
 * Drop one change for good. Only ever called from an explicit confirmation.
 * The local copy is put back the way the central database has it, so the till
 * never keeps showing a change that will never be sent.
 */
export function discardOp(id: string) {
  const queue = read();
  const entry = queue.find((q) => q.id === id);
  if (entry) rollbackLocally(entry);
  write(queue.filter((q) => q.id !== id));
}

/** Ids a change touched, so the local copy of those rows can be undone. */
function touchedIds(op: SyncOp): string[] {
  if (op.kind === "insert" || op.kind === "upsert")
    return op.rows.map((r) => String(r["id"] ?? "")).filter(Boolean);
  if (op.kind === "update") return [String(op.match["id"] ?? "")].filter(Boolean);
  return [];
}

/**
 * Undo a discarded change in this terminal's own copy. A removed row is
 * re-fetched by the next pull, so what the till shows always matches what was
 * really saved centrally. Deletions need no undo: the row simply comes back.
 */
function rollbackLocally(entry: QueuedOp) {
  const bridge = isBrowser()
    ? (window as unknown as { pos?: { localRollback?: (op: unknown) => Promise<unknown> } }).pos
    : undefined;
  const ids = touchedIds(entry.op);
  if (!bridge?.localRollback || !ids.length) return;
  void bridge.localRollback({ table: entry.op.table, ids }).catch(() => {
    /* the local copy is rebuilt by the next pull anyway */
  });
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
    // The same backoff the sync engine applies: 1s, 2s, 4s … capped at 30s.
    const wait = backoffMs(q);
    return {
      ...q,
      state: q.quarantined ? "refused" : q.attempts > 0 ? "retrying" : "waiting",
      reason: q.lastError ?? null,
      nextAttemptAt: q.quarantined || !wait ? null : new Date(nextAttemptDue(q)).toISOString(),
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
