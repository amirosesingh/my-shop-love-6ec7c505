/**
 * Keyset (cursor) pagination helpers.
 *
 * Offset pagination re-walks every skipped row, so page 200 of an audit log
 * costs 200x page 1. Keyset paging asks for "the next N rows older than the
 * last one I already have", which is a single index seek no matter how deep
 * the caller has scrolled.
 */

/** Position of the last row a caller received. */
export type Cursor = {
  /** timestamp of the last row (ISO string) */
  ts: string;
  /** id of the last row, breaks ties when two rows share a timestamp */
  id: string;
} | null;

/** Default page size for log-style screens. */
export const PAGE_SIZE = 200;

type Filterable = {
  or: (expr: string) => Filterable;
  order: (col: string, opts: { ascending: boolean }) => Filterable;
  limit: (n: number) => Filterable;
};

/**
 * Apply a descending keyset window on `(tsColumn, id)`.
 *
 * The `or(...)` clause is the standard tuple comparison written out longhand,
 * because PostgREST has no row-value syntax: strictly older timestamps, plus
 * the same timestamp with a smaller id.
 */
export function keyset<T extends Filterable>(
  query: T,
  tsColumn: string,
  cursor: Cursor,
  limit = PAGE_SIZE,
): T {
  let q = query;
  if (cursor) {
    q = q.or(
      `${tsColumn}.lt.${cursor.ts},and(${tsColumn}.eq.${cursor.ts},id.lt.${cursor.id})`,
    ) as T;
  }
  return q.order(tsColumn, { ascending: false }).order("id", { ascending: false }).limit(limit) as T;
}

/** Cursor pointing just past the last row of a page, or null when exhausted. */
export function nextCursor<R extends Record<string, unknown>>(
  rows: R[],
  tsColumn: string,
  limit = PAGE_SIZE,
): Cursor {
  if (rows.length < limit) return null;
  const last = rows[rows.length - 1];
  const ts = last?.[tsColumn];
  const id = last?.["id"];
  if (typeof ts !== "string" || typeof id !== "string") return null;
  return { ts, id };
}

/** One page of rows plus the cursor that fetches the following page. */
export type Page<T> = { rows: T[]; cursor: Cursor; hasMore: boolean };
