/**
 * What the sync engine is doing right now, in a form the header can read.
 *
 * The engine has no access to React state, so it publishes here and the
 * status pill subscribes.
 */
export type SyncPhase = "offline" | "syncing" | "idle";

export type SyncState = {
  phase: SyncPhase;
  /** how many queued changes are still waiting */
  pending: number;
  /** last time a push or pull finished cleanly */
  lastSyncAt: string | null;
  /** last error worth showing, if any */
  lastError: string | null;
};

let state: SyncState = { phase: "idle", pending: 0, lastSyncAt: null, lastError: null };

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeSyncState(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function syncState(): SyncState {
  return state;
}

export function setSyncState(patch: Partial<SyncState>) {
  const next = { ...state, ...patch };
  if (
    next.phase === state.phase &&
    next.pending === state.pending &&
    next.lastSyncAt === state.lastSyncAt &&
    next.lastError === state.lastError
  )
    return;
  state = next;
  for (const l of listeners) l();
}

/* ------------------------- delta pull watermark ------------------------- */

const PULL_KEY = "pos.sync.lastPullAt";

export function lastSuccessfulPull(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(PULL_KEY);
}

export function setLastSuccessfulPull(iso: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PULL_KEY, iso);
}

/* --------------------- per-table pull high-water marks -------------------- */

const TABLE_PULL_KEY = "pos.sync.tablePullAt";

const readTableMarks = (): Record<string, string> => {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(TABLE_PULL_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

/** When this one table was last pulled cleanly, independent of the others. */
export function lastTablePull(table: string): string | null {
  return readTableMarks()[table] ?? null;
}

export function setLastTablePull(table: string, iso: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      TABLE_PULL_KEY,
      JSON.stringify({ ...readTableMarks(), [table]: iso }),
    );
  } catch {
    /* storage unavailable — the global watermark still applies */
  }
}