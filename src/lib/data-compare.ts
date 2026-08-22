/**
 * Server vs. shop data comparison.
 *
 * The till holds its own copy of the branch data; the central server holds the
 * company copy. This module names the tables both sides share, and turns two
 * lists of record keys into the three answers a manager actually wants: what
 * is only here, what is only there, and what disagrees.
 */

export type CompareWindow = "today" | "7d" | "30d" | "all";

export type CompareTableSpec = {
  table: string;
  label: string;
  /** Columns that tie a row to a branch on the server side. */
  storeColumns?: string[];
  /** Rows hang off a parent that carries the branch, e.g. sale items. */
  parent?: { table: string; column: string };
  /** Company-wide reference data: the same rows belong on every till. */
  shared?: boolean;
};

/** Every table the sync engine keeps in step, in reading order. */
export const COMPARE_TABLES: CompareTableSpec[] = [
  { table: "sales", label: "Sales", storeColumns: ["store_id"] },
  { table: "sale_items", label: "Sale items", parent: { table: "sales", column: "sale_id" } },
  {
    table: "payment_transactions",
    label: "Payments",
    parent: { table: "sales", column: "sale_id" },
  },
  { table: "shifts", label: "Shifts", storeColumns: ["store_id"] },
  { table: "bookings", label: "Bookings", storeColumns: ["store_id"] },
  {
    table: "booking_payments",
    label: "Booking payments",
    parent: { table: "bookings", column: "booking_id" },
  },
  { table: "held_orders", label: "Held orders", storeColumns: ["store_id"] },
  { table: "stock_adjustments", label: "Stock adjustments", storeColumns: ["store_id"] },
  {
    table: "stock_transfers",
    label: "Stock transfers",
    storeColumns: ["from_store_id", "to_store_id"],
  },
  {
    table: "stock_transfer_items",
    label: "Transfer items",
    parent: { table: "stock_transfers", column: "transfer_id" },
  },
  { table: "item_activity_logs", label: "Item activity", storeColumns: ["store_id"] },
  { table: "purchase_orders", label: "Purchase orders", storeColumns: ["store_id"] },
  {
    table: "purchase_order_items",
    label: "Purchase order items",
    parent: { table: "purchase_orders", column: "purchase_order_id" },
  },
  { table: "audit_logs", label: "Audit log", storeColumns: ["store_id"] },
  { table: "products", label: "Products", shared: true },
  { table: "product_barcodes", label: "Barcodes", shared: true },
  { table: "product_categories", label: "Categories", shared: true },
  { table: "uom_units", label: "Units of measure", shared: true },
  { table: "members", label: "Members", shared: true },
  { table: "membership_tiers", label: "Membership tiers", shared: true },
  { table: "promotions", label: "Promotions", shared: true },
  { table: "suppliers", label: "Suppliers", shared: true },
  { table: "stores", label: "Branches", shared: true },
];

export const compareTableLabel = (table: string) =>
  COMPARE_TABLES.find((t) => t.table === table)?.label ?? table;

/** Start of the chosen window as an ISO timestamp, or null for everything. */
export function windowStart(win: CompareWindow, now = new Date()): string | null {
  if (win === "all") return null;
  const start = new Date(now);
  if (win === "today") {
    start.setHours(0, 0, 0, 0);
    return start.toISOString();
  }
  start.setDate(start.getDate() - (win === "7d" ? 7 : 30));
  return start.toISOString();
}

export const WINDOW_LABELS: Record<CompareWindow, string> = {
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  all: "Everything",
};

export type CompareKey = { id: string; updatedAt: string | null; status?: string | null };

export type CompareSide = {
  table: string;
  count: number;
  maxUpdatedAt: string | null;
  pending?: number;
  errored?: number;
  missing?: boolean;
  error?: string | null;
};

export type CompareVerdict = "matched" | "to-upload" | "to-download" | "mismatch" | "unknown";

export type CompareTableRow = {
  table: string;
  label: string;
  shop: CompareSide | null;
  server: CompareSide | null;
  difference: number;
  verdict: CompareVerdict;
};

/** Timestamps that differ by less than this are the same write. */
const CLOCK_SLACK_MS = 2000;

export type RowDiff = {
  shopOnly: CompareKey[];
  serverOnly: CompareKey[];
  different: Array<{ id: string; shopUpdatedAt: string | null; serverUpdatedAt: string | null }>;
};

export function diffRows(shop: CompareKey[], server: CompareKey[]): RowDiff {
  const serverById = new Map(server.map((r) => [r.id, r]));
  const shopById = new Map(shop.map((r) => [r.id, r]));
  const shopOnly: CompareKey[] = [];
  const different: RowDiff["different"] = [];

  for (const row of shop) {
    const match = serverById.get(row.id);
    if (!match) {
      shopOnly.push(row);
      continue;
    }
    const a = row.updatedAt ? Date.parse(row.updatedAt) : NaN;
    const b = match.updatedAt ? Date.parse(match.updatedAt) : NaN;
    if (Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) > CLOCK_SLACK_MS) {
      different.push({ id: row.id, shopUpdatedAt: row.updatedAt, serverUpdatedAt: match.updatedAt });
    }
  }
  const serverOnly = server.filter((r) => !shopById.has(r.id));
  return { shopOnly, serverOnly, different };
}

/** Per-table verdict from the two count summaries. */
export function verdictFor(shop: CompareSide | null, server: CompareSide | null): CompareVerdict {
  if (!shop || !server) return "unknown";
  if (shop.error || server.error) return "unknown";
  if (shop.count === server.count) {
    return shop.pending || shop.errored ? "to-upload" : "matched";
  }
  return shop.count > server.count ? "to-upload" : "to-download";
}

export const VERDICT_LABELS: Record<CompareVerdict, string> = {
  matched: "In step",
  "to-upload": "Waiting to upload",
  "to-download": "Not yet downloaded",
  mismatch: "Mismatch",
  unknown: "Not compared",
};

/** Merge both sides into the table the page renders. */
export function buildComparison(
  shopSides: CompareSide[] | null,
  serverSides: CompareSide[] | null,
): CompareTableRow[] {
  const shopByTable = new Map((shopSides ?? []).map((s) => [s.table, s]));
  const serverByTable = new Map((serverSides ?? []).map((s) => [s.table, s]));
  return COMPARE_TABLES.map((spec) => {
    const shop = shopByTable.get(spec.table) ?? null;
    const server = serverByTable.get(spec.table) ?? null;
    return {
      table: spec.table,
      label: spec.label,
      shop,
      server,
      difference: (shop?.count ?? 0) - (server?.count ?? 0),
      verdict: verdictFor(shop, server),
    };
  });
}

/** One-line answer for the header. */
export function overallVerdict(rows: CompareTableRow[]): CompareVerdict {
  if (!rows.some((r) => r.verdict !== "unknown")) return "unknown";
  const up = rows.some((r) => r.verdict === "to-upload");
  const down = rows.some((r) => r.verdict === "to-download");
  if (up && down) return "mismatch";
  if (up) return "to-upload";
  if (down) return "to-download";
  return "matched";
}
