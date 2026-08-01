/**
 * Conflict resolution for cloud pulls.
 *
 * The till is offline-first: local state is the working copy and the cloud is
 * the shared copy. When a pull brings a remote row that also changed locally
 * we need a deterministic rule per table.
 *
 *  - settings  → Last-Write-Wins on `updated_at` (whole row).
 *  - products  → field-level merge: catalogue metadata (title, price, …) comes
 *                from remote, but a stock adjustment that has not been pushed
 *                yet stays local so an offline count is never silently lost.
 */
import { listQueue } from "@/lib/sync-outbox";

export type Row = Record<string, unknown>;

const time = (r: Row | undefined): number => {
  const v = r?.["updated_at"] ?? r?.["created_at"];
  const t = typeof v === "string" || typeof v === "number" ? new Date(v).getTime() : NaN;
  return Number.isNaN(t) ? 0 : t;
};

const keyOf = (r: Row, key: string): string => String(r[key] ?? "");

const index = (rows: Row[], key: string) => {
  const map = new Map<string, Row>();
  for (const r of rows) map.set(keyOf(r, key), r);
  return map;
};

/** Last-Write-Wins: remote replaces local only when it is strictly newer. */
export function mergeSettings(local: Row | null | undefined, remote: Row | null | undefined): Row | null {
  if (!remote) return local ?? null;
  if (!local) return remote;
  return time(remote) > time(local) ? { ...local, ...remote } : local;
}

/** Fields on a product that a local offline edit is allowed to defend. */
export const LOCAL_STOCK_FIELDS = ["stock_quantity", "stock_by_store"] as const;

/**
 * Ids of products with an un-pushed stock write still sitting in the outbox.
 * Those rows keep their local stock during a pull.
 */
export function pendingStockProductIds(): Set<string> {
  const ids = new Set<string>();
  for (const entry of listQueue()) {
    const op = entry.op;
    if (op.kind === "insert" || op.kind === "upsert") {
      if (op.table !== "products") continue;
      for (const r of op.rows) {
        if (LOCAL_STOCK_FIELDS.some((f) => f in r)) ids.add(String((r as Row)["id"] ?? ""));
      }
    } else if (op.kind === "update") {
      if (op.table !== "products") continue;
      if (LOCAL_STOCK_FIELDS.some((f) => f in op.values)) ids.add(String(op.match["id"] ?? ""));
    }
  }
  ids.delete("");
  return ids;
}

/**
 * Field-level product merge. Remote wins on metadata; local wins on stock when
 * the local adjustment has not been synced yet.
 */
export function mergeProducts(
  local: Row[],
  remote: Row[],
  options: { key?: string; pendingIds?: Set<string> } = {},
): Row[] {
  const key = options.key ?? "id";
  const pending = options.pendingIds ?? pendingStockProductIds();
  const localById = index(local, key);
  const merged: Row[] = [];
  const seen = new Set<string>();

  for (const remoteRow of remote) {
    const id = keyOf(remoteRow, key);
    seen.add(id);
    const localRow = localById.get(id);
    if (!localRow) {
      merged.push(remoteRow);
      continue;
    }
    const row: Row = { ...localRow, ...remoteRow };
    if (pending.has(id)) {
      for (const field of LOCAL_STOCK_FIELDS) {
        if (field in localRow) row[field] = localRow[field];
      }
    }
    merged.push(row);
  }

  // Local-only rows (created offline) survive the pull.
  for (const localRow of local) {
    if (!seen.has(keyOf(localRow, key))) merged.push(localRow);
  }
  return merged;
}

/** Generic collection merge used by tables with no special rule (LWW per row). */
export function mergeRowsLww(local: Row[], remote: Row[], key = "id"): Row[] {
  const localById = index(local, key);
  const out: Row[] = [];
  const seen = new Set<string>();
  for (const remoteRow of remote) {
    const id = keyOf(remoteRow, key);
    seen.add(id);
    const localRow = localById.get(id);
    out.push(!localRow || time(remoteRow) >= time(localRow) ? { ...localRow, ...remoteRow } : localRow);
  }
  for (const localRow of local) if (!seen.has(keyOf(localRow, key))) out.push(localRow);
  return out;
}

/** Entry point for a pull: picks the right strategy for the table. */
export function mergePulled(
  table: string,
  local: Row[],
  remote: Row[],
  options: { key?: string; pendingIds?: Set<string> } = {},
): Row[] {
  if (table === "products") return mergeProducts(local, remote, options);
  if (table === "settings" || table === "pos_settings") {
    const row = mergeSettings(local[0], remote[0]);
    return row ? [row] : [];
  }
  return mergeRowsLww(local, remote, options.key ?? "id");
}