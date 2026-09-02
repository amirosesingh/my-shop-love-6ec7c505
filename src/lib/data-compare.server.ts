/**
 * Server side of the server/shop comparison.
 *
 * Reads live counts and the newest timestamp for each shared table, scoped to
 * one branch so the numbers can be held next to the till's own copy. Reads are
 * count-only projections — no customer or sale detail leaves the server.
 *
 * These reads go to the operator's OWN database through the same service-key
 * relay every other server path uses, so the numbers describe the database the
 * tills actually write to.
 */
import { COMPARE_TABLES, type CompareKey, type CompareSide } from "./data-compare";
import { serviceRest } from "@/core/api/pos-relay.server";

const specFor = (table: string) => COMPARE_TABLES.find((t) => t.table === table) ?? null;

const enc = encodeURIComponent;

/** Query parts that restrict a table to one branch, directly or via its parent. */
function scopeParams(table: string, columns: string, storeId: string | null): string[] {
  const spec = specFor(table);
  const parent = spec?.parent;
  const select = parent && storeId ? `${columns},${parent.table}!inner(store_id)` : columns;
  const params = [`select=${enc(select)}`];

  if (!storeId || spec?.shared) return params;
  if (parent) {
    params.push(`${enc(`${parent.table}.store_id`)}=eq.${enc(storeId)}`);
    return params;
  }
  const storeColumns = spec?.storeColumns ?? [];
  if (storeColumns.length === 1) params.push(`${enc(storeColumns[0]!)}=eq.${enc(storeId)}`);
  else if (storeColumns.length) {
    params.push(`or=${enc(`(${storeColumns.map((c) => `${c}.eq.${storeId}`).join(",")})`)}`);
  }
  return params;
}

const stampOf = (table: string) => (table === "sale_items" ? "created_at" : "updated_at");

async function failOrJson(res: Response): Promise<unknown> {
  if (res.ok) return await res.json();
  const body = await res.text();
  throw new Error(body || `Read failed (${res.status})`);
}

/** Exact row count via PostgREST's Content-Range header. */
async function countRows(table: string, params: string[]): Promise<number> {
  const res = await serviceRest(`${table}?${params.join("&")}`, {
    method: "HEAD",
    prefer: "count=exact",
  });
  if (!res.ok) throw new Error(`Count failed (${res.status})`);
  const range = res.headers.get("content-range") ?? "";
  const total = Number(range.split("/")[1]);
  return Number.isFinite(total) ? total : 0;
}

async function sideFor(
  table: string,
  storeId: string | null,
  since: string | null,
): Promise<CompareSide> {
  const stamp = stampOf(table);
  const sinceParam = since ? [`${enc(stamp)}=gte.${enc(since)}`] : [];
  try {
    const count = await countRows(table, [
      ...scopeParams(table, "id", storeId),
      ...sinceParam,
    ]);

    const newestParams = [
      ...scopeParams(table, `id,${stamp}`, storeId),
      ...sinceParam,
      `order=${enc(`${stamp}.desc`)}`,
      "limit=1",
    ];
    const rows = (await failOrJson(
      await serviceRest(`${table}?${newestParams.join("&")}`),
    )) as Record<string, unknown>[];
    const row = rows[0] ?? null;

    return {
      table,
      count,
      maxUpdatedAt: (row?.[stamp] as string | undefined) ?? null,
    };
  } catch (err) {
    return {
      table,
      count: 0,
      maxUpdatedAt: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function serverSummary(input: {
  storeId: string | null;
  since: string | null;
  tables?: string[];
}): Promise<CompareSide[]> {
  const wanted = COMPARE_TABLES.filter(
    (spec) => !input.tables?.length || input.tables.includes(spec.table),
  );
  return await Promise.all(
    wanted.map((spec) => sideFor(spec.table, input.storeId, input.since)),
  );
}

/** Record keys for one table, so the page can name the rows that differ. */
export async function serverRows(input: {
  table: string;
  storeId: string | null;
  since: string | null;
  limit?: number;
}): Promise<CompareKey[]> {
  if (!specFor(input.table)) throw new Error(`Unknown table: ${input.table}`);
  const stamp = stampOf(input.table);
  const params = [
    ...scopeParams(input.table, `id,${stamp}`, input.storeId),
    ...(input.since ? [`${enc(stamp)}=gte.${enc(input.since)}`] : []),
    `order=${enc(`${stamp}.desc`)}`,
    `limit=${Math.min(input.limit ?? 2000, 5000)}`,
  ];
  const data = (await failOrJson(
    await serviceRest(`${input.table}?${params.join("&")}`),
  )) as Record<string, unknown>[];
  return data.map((row) => ({
    id: String(row["id"] ?? ""),
    updatedAt: (row[stamp] as string | undefined) ?? null,
  }));
}
