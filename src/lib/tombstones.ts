/**
 * Deletions that can travel.
 *
 * Tills learn about central changes through a delta pull: "everything touched
 * since I last looked". A row that is simply erased never appears in that
 * answer, so an offline till would keep serving it forever. Reference tables
 * are therefore stamped with `deleted_at` instead of removed — the stamp is a
 * change like any other, it rides the next pull, and the till drops its local
 * copy on arrival.
 *
 * Transactional history (sales, payments, shifts, audit trails) is never
 * listed here: those rows are immutable and are not deleted at all.
 */
export const TOMBSTONE_TABLES = new Set<string>([
  "products",
  "product_categories",
  "product_barcodes",
  "uom_units",
  "suppliers",
  "promotions",
  "membership_tiers",
  "stores",
  "members",
]);

/** The stamp itself: `updated_at` moves too, otherwise the pull misses it. */
export function tombstone(): { deleted_at: string; updated_at: string } {
  const stamp = new Date().toISOString();
  return { deleted_at: stamp, updated_at: stamp };
}

/** True when a row has been deleted centrally and should read as absent. */
export const isTombstoned = (row: { deleted_at?: string | null } | null | undefined) =>
  Boolean(row?.deleted_at);
