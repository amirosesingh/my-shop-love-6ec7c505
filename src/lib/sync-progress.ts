/**
 * The ONE sync state object.
 *
 * Every sync indicator in the app reads from here: overall status, progress,
 * when the last clean sync finished and how each table fared. The engine is
 * the only writer, so two screens can never disagree about what is happening.
 */
export type TableSyncStatus = "idle" | "syncing" | "synced" | "missing" | "failed";

export type TableSyncRow = {
  table: string;
  status: TableSyncStatus;
  /** Plain-language note: row counts, or the reason it failed. */
  note: string;
  at: string | null;
};

export type SyncRunState = {
  status: "idle" | "syncing" | "error" | "done";
  /** 0–100 across the tables of the current (or last) pass. */
  progress: number;
  /** 1-based position of the table being worked on. */
  currentIndex: number;
  total: number;
  currentTable: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
  tables: TableSyncRow[];
};

const EMPTY: SyncRunState = {
  status: "idle",
  progress: 0,
  currentIndex: 0,
  total: 0,
  currentTable: null,
  lastSyncedAt: null,
  lastError: null,
  tables: [],
};

let state: SyncRunState = EMPTY;
const listeners = new Set<() => void>();

const emit = () => {
  for (const l of listeners) l();
};

export function subscribeSyncProgress(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function syncProgress(): SyncRunState {
  return state;
}

const percent = (done: number, total: number) =>
  total ? Math.min(100, Math.round((done / total) * 100)) : 0;

/** A pass is starting over this ordered list of tables. */
export function beginSyncRun(tables: readonly string[]) {
  const previous = new Map(state.tables.map((row) => [row.table, row]));
  state = {
    ...state,
    status: "syncing",
    progress: 0,
    currentIndex: 0,
    total: tables.length,
    currentTable: tables[0] ?? null,
    lastError: null,
    tables: tables.map((table) => ({
      table,
      status: "idle",
      note: previous.get(table)?.note ?? "",
      at: previous.get(table)?.at ?? null,
    })),
  };
  emit();
}

/** Record where one table got to; advances the progress counter. */
export function markTableSync(table: string, status: TableSyncStatus, note = "") {
  const rows = state.tables.some((row) => row.table === table)
    ? state.tables
    : [...state.tables, { table, status, note, at: null }];

  const tables = rows.map((row) =>
    row.table === table
      ? {
          table,
          status,
          note,
          at: status === "syncing" ? row.at : new Date().toISOString(),
        }
      : row,
  );

  const settled = tables.filter((row) => row.status !== "idle" && row.status !== "syncing").length;
  const index = tables.findIndex((row) => row.table === table);

  state = {
    ...state,
    tables,
    total: Math.max(state.total, tables.length),
    currentIndex: status === "syncing" ? index + 1 : state.currentIndex,
    currentTable: status === "syncing" ? table : state.currentTable,
    progress: percent(settled, Math.max(state.total, tables.length)),
  };
  emit();
}

/** The pass finished. Pass an error message when it ended badly. */
export function endSyncRun(error?: string | null) {
  const failed = state.tables.some((row) => row.status === "failed");
  state = {
    ...state,
    status: error || failed ? "error" : "done",
    progress: 100,
    currentTable: null,
    lastError: error ?? state.lastError,
    lastSyncedAt: error || failed ? state.lastSyncedAt : new Date().toISOString(),
  };
  emit();
}

/** Test helper — drops everything back to the untouched state. */
export function resetSyncProgress() {
  state = EMPTY;
  emit();
}
