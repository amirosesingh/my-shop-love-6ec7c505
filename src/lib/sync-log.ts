/**
 * Persistent sync & backup activity log.
 *
 * Entries survive reloads (localStorage) so a manager can see what failed
 * overnight, even after the terminal was restarted.
 */
export type SyncDirection = "push" | "pull" | "backup";

export type SyncLogEntry = {
  id: string;
  at: string;
  direction: SyncDirection;
  table: string;
  ok: boolean;
  details: string;
};

const KEY = "pos.sync.log";
const MAX = 300;

type Listener = () => void;
const listeners = new Set<Listener>();
const isBrowser = () => typeof window !== "undefined";

export function listSyncLog(): SyncLogEntry[] {
  if (!isBrowser()) return [];
  try {
    return JSON.parse(window.localStorage.getItem(KEY) ?? "[]") as SyncLogEntry[];
  } catch {
    return [];
  }
}

function persist(entries: SyncLogEntry[]) {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(entries.slice(0, MAX)));
  } catch {
    /* storage full — keep going, the log is diagnostic only */
  }
  for (const l of listeners) l();
}

export function logSync(
  direction: SyncDirection,
  table: string,
  ok: boolean,
  details = "",
): SyncLogEntry {
  const entry: SyncLogEntry = {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    direction,
    table,
    ok,
    details,
  };
  persist([entry, ...listSyncLog()]);
  return entry;
}

export function clearSyncLog() {
  persist([]);
}

export function subscribeSyncLog(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}