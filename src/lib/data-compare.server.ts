/**
 * Server side of the server/shop comparison.
 *
 * Reads live counts and the newest timestamp for each shared table, scoped to
 * one branch so the numbers can be held next to the till's own copy. Reads are
 * count-only projections — no customer or sale detail leaves the server.
 */
import { COMPARE_TABLES, type CompareKey, type CompareSide } from "./data-compare";

type Client = Awaited<
  typeof import("@/integrations/supabase/client.server")
>["supabaseAdmin"];

async function admin(): Promise<Client> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

const specFor = (table: string) => COMPARE_TABLES.find((t) => t.table === table) ?? null;

/** Applies the branch filter for a table, whether it owns the branch or inherits it. */
function scoped(
  client: Client,
  table: string,
  columns: string,
  storeId: string | null,
  options: { count?: boolean } = {},
) {
  const spec = specFor(table);
  const parent = spec?.parent;
  const select = parent && storeId ? `${columns}, ${parent.table}!inner(store_id)` : columns;
  let query = client
    .from(table as never)
    .select(select, options.count ? { count: "exact", head: true } : {});

  if (!storeId || spec?.shared) return query;
  if (parent) return query.eq(`${parent.table}.store_id`, storeId);
  const storeColumns = spec?.storeColumns ?? [];
  if (storeColumns.length === 1) query = query.eq(storeColumns[0]!, storeId);
  else if (storeColumns.length) {
    query = query.or(storeColumns.map((c) => `${c}.eq.${storeId}`).join(","));
  }
  return query;
}

const stampOf = (table: string) => (table === "sale_items" ? "created_at" : "updated_at");

async function sideFor(
  client: Client,
  table: string,
  storeId: string | null,
  since: string | null,
): Promise<CompareSide> {
  const stamp = stampOf(table);
  try {
    let countQuery = scoped(client, table, "id", storeId, { count: true });
    if (since) countQuery = countQuery.gte(stamp, since);
    const { count, error } = await countQuery;
    if (error) throw error;

    let newestQuery = scoped(client, table, `id, ${stamp}`, storeId)
      .order(stamp, { ascending: false })
      .limit(1);
    if (since) newestQuery = newestQuery.gte(stamp, since);
    const newest = await newestQuery;
    const row = (newest.data?.[0] ?? null) as Record<string, unknown> | null;

    return {
      table,
      count: count ?? 0,
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
  const client = await admin();
  const wanted = COMPARE_TABLES.filter(
    (spec) => !input.tables?.length || input.tables.includes(spec.table),
  );
  return await Promise.all(
    wanted.map((spec) => sideFor(client, spec.table, input.storeId, input.since)),
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
  const client = await admin();
  const stamp = stampOf(input.table);
  let query = scoped(client, input.table, `id, ${stamp}`, input.storeId)
    .order(stamp, { ascending: false })
    .limit(Math.min(input.limit ?? 2000, 5000));
  if (input.since) query = query.gte(stamp, input.since);
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => ({
    id: String(row["id"] ?? ""),
    updatedAt: (row[stamp] as string | undefined) ?? null,
  }));
}
