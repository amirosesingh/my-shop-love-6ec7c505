/**
 * The one way in and out of stored data.
 *
 * Every write in the app goes through `dbRouter.write`, which tries the
 * targets in order:
 *
 *  1. this terminal — local SQL Server on Windows, the on-disk queue in a
 *     browser — and the change is flagged for cloud sync;
 *  2. the central database directly, if the local store is missing, full or
 *     refuses the write ("Cloud direct" shows in the status pill);
 *  3. nothing: the action stops and the operator is shown a modal saying the
 *     data could not be stored anywhere.
 *
 * Reads come from whatever is available: the local snapshot first when the
 * connection is down, the cloud otherwise.
 */
import { commitOps, commitLabel, type CommitTarget } from "./pos-db";
import {
  AllTargetsFailed,
  effectiveDatabaseMode,
  isCloudDirect,
  isConnectionError,
} from "./db-mode";
import { supabaseExternal } from "@/integrations/supabase/external-client";
import { localDb } from "./local-db";
import { readSnapshot } from "./offline-snapshot";
import type { Row, SyncOp } from "./sync-outbox";

export { AllTargetsFailed, isCloudDirect };
export type { CommitTarget };

/** Table names are dynamic here, so the generated row types do not apply. */
type LooseSelect = {
  select: (columns: string) => LooseFilter;
};
type LooseFilter = PromiseLike<{ data: unknown; error: { message: string } | null }> & {
  eq: (column: string, value: unknown) => LooseFilter;
  order: (column: string, opts: { ascending: boolean }) => LooseFilter;
  limit: (n: number) => LooseFilter;
};

const from = (table: string) =>
  (supabaseExternal as unknown as { from: (t: string) => LooseSelect }).from(table);

export type QueryOptions = {
  columns?: string;
  match?: Record<string, unknown>;
  orderBy?: { column: string; ascending?: boolean };
  limit?: number;
};

/** Slices of the last good central copy this device keeps on disk. */
const localSlice = (table: string): Row[] | null => {
  const snap = readSnapshot();
  if (!snap) return null;
  const slice = (snap as unknown as Record<string, unknown>)[table];
  return Array.isArray(slice) ? (slice as Row[]) : null;
};

const matches = (row: Row, match?: Record<string, unknown>) =>
  !match || Object.entries(match).every(([k, v]) => row[k] === v);

/** Apply the same filtering to the local copy so both paths agree. */
function localQuery(table: string, options: QueryOptions = {}): Row[] | null {
  const rows = localSlice(table);
  if (!rows) return null;
  let out = rows.filter((r) => matches(r, options.match));
  if (options.orderBy) {
    const { column, ascending = true } = options.orderBy;
    out = [...out].sort((a, b) => {
      const x = a[column] as never;
      const y = b[column] as never;
      return (x > y ? 1 : x < y ? -1 : 0) * (ascending ? 1 : -1);
    });
  }
  return options.limit ? out.slice(0, options.limit) : out;
}

/**
 * Keep the local copy in step with a row that has just been saved centrally,
 * so the same record is there if the connection drops a second later.
 * Best effort only: a failure here never fails the caller's action.
 */
async function mirrorLocally(context: string, ops: SyncOp[]) {
  const bridge = localDb();
  if (!bridge) return;
  for (const op of ops) {
    try {
      await bridge.write(context, op);
    } catch {
      /* the change is already safe centrally */
    }
  }
}

export const dbRouter = {
  /** Store a group of changes. Resolves only once the data is genuinely saved. */
  async write(context: string, ops: SyncOp[]): Promise<CommitTarget> {
    const target = await commitOps(context, ops);
    // Saved centrally: mirror the very same rows onto this terminal so both
    // sides hold the record straight away.
    if (target === "cloud") await mirrorLocally(context, ops);
    return target;
  },

  /**
   * Read through the router: the live source first, the local copy if the
   * connection is down or the live read fails.
   */
  async read<T>(live: () => Promise<T>, local: () => T | null): Promise<T> {
    try {
      return await live();
    } catch (e) {
      const cached = local();
      if (cached !== null && cached !== undefined && isConnectionError(e)) return cached;
      throw e;
    }
  },

  /**
   * Read a table without choosing a database: central first when this device
   * is set to work online and the line is up, the local copy otherwise.
   */
  async query(table: string, options: QueryOptions = {}): Promise<Row[]> {
    const cached = () => localQuery(table, options);
    if (effectiveDatabaseMode() === "local") {
      const rows = cached();
      if (rows) return rows;
    }
    return dbRouter.read(
      async () => {
        let q = from(table).select(options.columns ?? "*");
        for (const [k, v] of Object.entries(options.match ?? {})) q = q.eq(k, v);
        if (options.orderBy)
          q = q.order(options.orderBy.column, { ascending: options.orderBy.ascending ?? true });
        if (options.limit) q = q.limit(options.limit);
        const { data, error } = await q;
        if (error) throw new Error(error.message);
        return (data as Row[]) ?? [];
      },
      () => cached(),
    );
  },

  /** Add rows. The row id doubles as the key, so a replay never duplicates. */
  insert(table: string, rows: Row | Row[], context = `Saving ${table}`) {
    return dbRouter.write(context, [
      { kind: "insert", table, rows: Array.isArray(rows) ? rows : [rows] },
    ]);
  },

  /** Add or replace rows by their id (or another agreed key). */
  upsert(table: string, rows: Row | Row[], onConflict = "id", context = `Saving ${table}`) {
    return dbRouter.write(context, [
      { kind: "upsert", table, rows: Array.isArray(rows) ? rows : [rows], onConflict },
    ]);
  },

  update(table: string, id: string, values: Row, context = `Updating ${table}`) {
    return dbRouter.write(context, [{ kind: "update", table, values, match: { id } }]);
  },

  delete(table: string, id: string, context = `Removing from ${table}`) {
    return dbRouter.write(context, [{ kind: "delete", table, match: { id } }]);
  },

  /** Plain wording for where a change landed. */
  label: commitLabel,
};

/** Same gateway, under the name used elsewhere in the project brief. */
export const dbProxy = dbRouter;