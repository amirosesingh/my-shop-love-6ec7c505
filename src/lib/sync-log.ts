/**
 * Persistent sync & backup activity log.
 *
 * Entries survive reloads (localStorage) so a manager can see what failed
 * overnight, even after the terminal was restarted.
 */
export type SyncDirection = "push" | "pull" | "backup";

/** Why a sync attempt failed, in plain terms the log can group by. */
export type SyncFailureKind = "network" | "auth" | "conflict" | "validation" | "unknown";

export type SyncLogEntry = {
  id: string;
  at: string;
  direction: SyncDirection;
  table: string;
  ok: boolean;
  details: string;
  /** Only set when `ok` is false. */
  kind?: SyncFailureKind;
};

/** Sort a failure message into one of the buckets above. */
export function classifyFailure(details: string): SyncFailureKind {
  const text = details.toLowerCase();
  if (/network|fetch|timeout|timed out|offline|econn|unreachable/.test(text)) return "network";
  if (/unauthor|forbidden|401|403|jwt|api key|credential/.test(text)) return "auth";
  if (/conflict|duplicate|409|version|already exists/.test(text)) return "conflict";
  if (/invalid|violates|constraint|column|schema|400|422/.test(text)) return "validation";
  return "unknown";
}

const KEY = "pos.sync.log";
/** A rolling window — enough to explain the last few hours, not a database. */
const MAX = 50;

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
    ...(ok ? {} : { kind: classifyFailure(details) }),
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