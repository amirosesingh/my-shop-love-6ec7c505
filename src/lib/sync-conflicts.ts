/**
 * Changes the central database kept its own version of.
 *
 * When this till sends an edit that was made from an older copy of a record,
 * the central database keeps the newer copy and ignores the incoming one.
 * That is the right outcome, but the person at the till should still be told,
 * so each of those is recorded here and shown on the Sync & backup screen.
 */
export type SyncConflict = {
  id: string;
  at: string;
  table: string;
  recordId: string;
  context: string;
  /** version this till was working from */
  baseVersion: number;
  /** version the central database is actually on */
  centralVersion: number;
  resolved?: boolean;
};

const KEY = "pos.sync.conflicts";
const MAX = 100;

type Listener = () => void;
const listeners = new Set<Listener>();
const isBrowser = () => typeof window !== "undefined";

export function listConflicts(): SyncConflict[] {
  if (!isBrowser()) return [];
  try {
    return JSON.parse(window.localStorage.getItem(KEY) ?? "[]") as SyncConflict[];
  } catch {
    return [];
  }
}

function persist(rows: SyncConflict[]) {
  if (isBrowser()) {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(rows.slice(0, MAX)));
    } catch {
      /* diagnostic only */
    }
  }
  for (const l of listeners) l();
}

export function recordConflict(
  conflict: Omit<SyncConflict, "id" | "at" | "resolved">,
): SyncConflict {
  const entry: SyncConflict = { ...conflict, id: crypto.randomUUID(), at: new Date().toISOString() };
  persist([entry, ...listConflicts().filter((c) => !(c.table === entry.table && c.recordId === entry.recordId))]);
  return entry;
}

/** The person has seen it and accepted the central copy. */
export function dismissConflict(id: string) {
  persist(listConflicts().filter((c) => c.id !== id));
}

export function clearConflicts() {
  persist([]);
}

export function subscribeConflicts(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
