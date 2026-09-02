/**
 * Routed table reads.
 *
 * One place decides where a read is served from: the central database when
 * this terminal is working online and the line is up, the last good copy kept
 * on this terminal otherwise. Screens and the data layer both go through here
 * so neither can quietly become cloud-only.
 *
 * Kept separate from `db-router` so the data layer can read without importing
 * the write path (and creating an import cycle with `pos-db`).
 */
import { supabaseExternal } from "@/integrations/supabase/external-client";
import { effectiveDatabaseMode, isConnectionError } from "@/core/local-db/db-mode";
import { readSnapshot } from "./offline-snapshot";
import { lastHealth } from "@/core/activation/connection-health";
import { noteVersions } from "./row-versions";
import type { Row } from "./sync-outbox";

/** Table names are dynamic here, so the generated row types do not apply. */
type LooseSelect = {
  select: (columns: string) => LooseFilter;
};
type LooseFilter = PromiseLike<{ data: unknown; error: { message: string } | null }> & {
  eq: (column: string, value: unknown) => LooseFilter;
  in: (column: string, values: unknown[]) => LooseFilter;
  order: (column: string, opts: { ascending: boolean }) => LooseFilter;
  limit: (n: number) => LooseFilter;
};

const from = (table: string) =>
  (supabaseExternal as unknown as { from: (t: string) => LooseSelect }).from(table);

export type QueryOptions = {
  columns?: string;
  match?: Record<string, unknown>;
  /** Rows whose column value is one of these. */
  in?: { column: string; values: unknown[] };
  orderBy?: { column: string; ascending?: boolean };
  limit?: number;
};

/** Where a read was actually served from. */
export type ReadSource = "cloud" | "local";

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
export function localQuery(table: string, options: QueryOptions = {}): Row[] | null {
  const rows = localSlice(table);
  if (!rows) return null;
  let out = rows.filter((r) => matches(r, options.match));
  if (options.in) {
    const { column, values } = options.in;
    out = out.filter((r) => values.includes(r[column]));
  }
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
 * Reads already on the wire, so two screens asking for the same rows in the
 * same moment share one round trip instead of racing each other. Entries are
 * dropped the instant the read settles: nothing is cached, only shared.
 */
const inFlight = new Map<string, Promise<{ rows: Row[]; source: ReadSource }>>();

const readKey = (table: string, options: QueryOptions) => `${table}|${JSON.stringify(options)}`;

async function runQuery(
  table: string,
  options: QueryOptions,
): Promise<{ rows: Row[]; source: ReadSource }> {
  const cached = () => localQuery(table, options);
  const health = lastHealth();
  // Working locally, or the last probe says the central database is out of
  // reach: serve the terminal copy without a doomed round trip.
  if (effectiveDatabaseMode() === "local" || (health && !health.cloud)) {
    const rows = cached();
    if (rows) return { rows, source: "local" };
  }
  try {
    let q = from(table).select(options.columns ?? "*");
    for (const [k, v] of Object.entries(options.match ?? {})) q = q.eq(k, v);
    if (options.in) q = q.in(options.in.column, options.in.values);
    if (options.orderBy)
      q = q.order(options.orderBy.column, { ascending: options.orderBy.ascending ?? true });
    if (options.limit) q = q.limit(options.limit);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    // Remember what version the central copy is on, so a later edit from this
    // till can say which version it was working from.
    noteVersions(table, data);
    return { rows: (data as Row[]) ?? [], source: "cloud" };
  } catch (e) {
    const rows = cached();
    // Only a connection-class failure may fall back: a refusal or a bad query
    // must stay visible instead of quietly serving stale rows.
    if (rows && isConnectionError(e)) return { rows, source: "local" };
    throw e;
  }
}

/**
 * Read a table without choosing a database, and say which one answered.
 */
export function routedQueryWithSource(
  table: string,
  options: QueryOptions = {},
): Promise<{ rows: Row[]; source: ReadSource }> {
  const key = readKey(table, options);
  const existing = inFlight.get(key);
  if (existing) return existing;
  const run = runQuery(table, options).finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, run);
  return run;
}

/** Same read when the caller does not care where the rows came from. */
export async function routedQuery(table: string, options: QueryOptions = {}): Promise<Row[]> {
  return (await routedQueryWithSource(table, options)).rows;
}

