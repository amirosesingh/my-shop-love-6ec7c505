/**
 * Live schema & feature health probe.
 *
 * Nothing here is judged from the `.sql` files in the repo. Every feature
 * declares the exact columns its screens read and the exact columns its saves
 * send, and this runs those shapes against the live database:
 *
 *  - reads  → a zero-row select of those exact columns, so a missing table or
 *             a renamed column comes back as the database's own error;
 *  - writes → a harmless update carrying the same column set with a filter
 *             that matches no row, so the columns and the access rules are
 *             validated without ever changing a record;
 *  - shape  → the published table definition is compared against the payload
 *             to spot required fields the till never sends.
 */
import { supabaseExternal } from "@/integrations/supabase/external-client";
import { supabaseConfig } from "./external-supabase-config";
import { explainError } from "./db-health";

export type OpKind = "read" | "write";

export type FeatureOp = {
  /** What this call does, in shop language. */
  label: string;
  table: string;
  kind: OpKind;
  /** Exact columns the query selects or the payload sends. */
  columns: string[];
  /** Column used to match nothing on a write probe. */
  pk?: string;
  /** Where the real call lives. */
  source: string;
  /** Part of a larger payload — do not chase required fields on this one. */
  partial?: boolean;
};

export type FeatureDef = {
  id: string;
  name: string;
  ops: FeatureOp[];
};

export type OpResult = FeatureOp & {
  ok: boolean;
  detail: string;
  /** Columns the live table does not have. */
  missing: string[];
  /** Required columns the payload never sends. */
  unmet: string[];
};

export type FeatureResult = {
  id: string;
  name: string;
  status: "healthy" | "fix-required" | "skipped";
  ops: OpResult[];
};

export type FeatureSchemaReport = {
  at: string;
  features: FeatureResult[];
  error: string | null;
};

/* ------------------------------------------------------------------ */
/* What each feature actually sends                                    */
/* ------------------------------------------------------------------ */

export const FEATURES: FeatureDef[] = [
  {
    id: "sales",
    name: "Direct sales & checkout",
    ops: [
      {
        label: "Bill header saved at checkout",
        table: "sales",
        kind: "write",
        source: "src/lib/pos-db.ts:560 (saleToRow)",
        columns: [
          "bill_number", "client_transaction_id", "member_id", "store_id", "shift_id",
          "cashier_name", "subtotal_amount", "total_amount", "discount_amount", "tax_amount",
          "payment_type", "payments", "points_earned", "points_redeemed", "is_exchange",
          "original_bill_number", "exchange_credit", "paid_amount", "change_amount",
          "is_refunded", "coupon_code", "coupon_promo_id", "coupon_scope", "coupon_discount",
          "created_at",
        ],
      },
      {
        label: "Line items, discounts and tax",
        table: "sale_items",
        kind: "write",
        source: "src/lib/pos-db.ts:589 (saleItemRows)",
        columns: [
          "sale_id", "product_id", "product_name", "unit_price", "unit_cost", "quantity",
          "discount_percent", "discount_amount", "tax_rate", "is_return", "is_foc",
          "promo_id", "coupon_code", "coupon_discount",
        ],
      },
      {
        label: "Split tenders ledger",
        table: "payment_transactions",
        kind: "write",
        source: "src/lib/pos-db.ts:611 (salePaymentRows)",
        columns: [
          "source_type", "sale_id", "member_id", "store_id", "shift_id", "amount", "method",
          "kind", "reference", "cashier_name", "note", "paid_at",
        ],
      },
      {
        label: "Receipt history read",
        table: "sales",
        kind: "read",
        source: "src/lib/pos-db.ts:492 (saleColumns)",
        columns: [
          "id", "bill_number", "store_id", "shift_id", "cashier_name", "member_id",
          "subtotal_amount", "total_amount", "discount_amount", "tax_amount", "payment_type",
          "payments", "points_earned", "is_refunded", "original_bill_number",
          "exchanged_to_bill_number", "created_at",
        ],
      },
      {
        label: "Item movement written per sold line",
        table: "item_activity_logs",
        kind: "write",
        source: "src/lib/pos-db.ts:636 (saleActivityRows)",
        columns: [
          "product_id", "product_name", "store_id", "activity_type", "reference",
          "quantity_delta", "unit_cost", "staff_name", "note", "created_at",
        ],
      },
    ],
  },
  {
    id: "transfers",
    name: "Stock transfers & adjustments",
    ops: [
      {
        label: "Transfer note raised",
        table: "stock_transfers",
        kind: "write",
        source: "src/lib/stock-transfers.ts:109 (saveTransfer)",
        columns: [
          "ref", "kind", "transfer_scope", "from_store_id", "from_store_name", "from_group_id",
          "to_store_id", "to_store_name", "to_group_id", "status", "note", "created_by",
          "approved_by", "approved_at", "received_by", "received_at", "rejected_reason",
        ],
      },
      {
        label: "Transfer lines",
        table: "stock_transfer_items",
        kind: "write",
        source: "src/lib/stock-transfers.ts:123 (saveTransfer lines)",
        columns: [
          "transfer_id", "product_id", "barcode", "sku", "product_name", "quantity",
          "quantity_received", "unit_cost",
        ],
      },
      {
        label: "Receiving moves stock in one transaction",
        table: "rpc:stock_transfer_receive",
        kind: "write",
        source: "src/lib/stock-transfers.ts:172 (receiveTransferInDb)",
        columns: ["p_transfer_id", "p_received_by"],
      },
      {
        label: "Manual stock adjustment",
        table: "stock_adjustments",
        kind: "write",
        source: "src/lib/pos-db.ts:1858 (recordStockAdjustment)",
        columns: [
          "product_id", "product_name", "sku", "barcode", "store_id", "terminal_id", "reason",
          "note", "previous_stock", "updated_stock", "delta", "cost_impact", "staff_id",
          "staff_name", "role",
        ],
      },
      {
        label: "Warehouse allocation on the product row",
        table: "products",
        kind: "read",
        source: "src/lib/pos-db.ts (productToRow / stock_by_store)",
        columns: ["id", "sku", "barcode", "name", "stock_quantity", "stock_by_store", "is_archived"],
      },
    ],
  },
  {
    id: "venue-bookings",
    name: "Table & venue bookings",
    ops: [
      {
        label: "Booking saved (slot, resource, deposit)",
        table: "bookings",
        kind: "write",
        source: "src/lib/bookings-db.ts:15 (toRow)",
        columns: [
          "ref", "store_id", "shift_id", "customer_name", "customer_phone", "member_id",
          "service_type_id", "service_name", "service_fee", "payment_timing", "lines",
          "subtotal", "discount", "tax", "total", "paid", "due_date", "note", "cashier",
          "status", "sale_receipt_no", "closed_at", "charges", "tag_id",
        ],
      },
      {
        label: "Deposit / part payment",
        table: "booking_payments",
        kind: "write",
        source: "src/lib/bookings-db.ts:121 (paymentRows)",
        columns: ["booking_id", "amount", "method", "cashier", "paid_at"],
      },
      {
        label: "Diary read for slot availability",
        table: "bookings",
        kind: "read",
        source: "src/lib/bookings-db.ts:180 (loadBookings)",
        columns: [
          "id", "ref", "store_id", "status", "due_date", "promised_at", "dropped_off_at",
          "service_name", "total", "paid", "created_at",
        ],
      },
    ],
  },
  {
    id: "ticket-bookings",
    name: "Ticket & event bookings",
    ops: [
      {
        label: "Job / ticket card written",
        table: "bookings",
        kind: "write",
        source: "src/lib/bookings-db.ts:15 (racket & ticket fields)",
        partial: true,
        columns: [
          "job_status", "job_status_by", "job_status_at", "racket_model", "string_type",
          "tension_main", "tension_cross", "tension_unit", "grommet_notes", "job_notes",
          "dropped_off_at", "promised_at", "notify_whatsapp", "intake_note", "string_origin",
          "string_source_product_id", "grip_product_id", "technician", "liability_accepted",
          "incident_note",
        ],
      },
      {
        label: "Ticket tiers / campaign the voucher belongs to",
        table: "coupon_campaigns",
        kind: "read",
        source: "src/lib/coupons.ts:198 (loadCampaigns)",
        columns: [
          "id", "name", "slug", "discount_type", "discount_value", "scope", "scope_value",
          "max_claims", "max_per_member", "claims_count", "starts_at", "expires_at",
          "is_active", "is_welcome",
        ],
      },
      {
        label: "Issued ticket / voucher with its barcode token",
        table: "issued_vouchers",
        kind: "read",
        source: "src/lib/coupons.ts:244 (loadVouchers)",
        columns: [
          "id", "token_slug", "campaign_id", "member_id", "status", "issued_at", "expires_at",
          "issued_by", "issued_source", "redeemed_at", "redeemed_by", "redeemed_sale_id",
          "store_id",
        ],
      },
      {
        label: "Redeem a ticket at the till",
        table: "rpc:voucher_redeem",
        kind: "write",
        source: "src/lib/coupons.ts (voucher_redeem)",
        columns: ["_token", "_sale_id", "_store_id", "_staff"],
      },
    ],
  },
  {
    id: "membership",
    name: "Customers & membership sync",
    ops: [
      {
        label: "Member saved with points and spend",
        table: "members",
        kind: "write",
        source: "src/lib/pos-db.ts:219 (memberToRow)",
        columns: [
          "member_code", "full_name", "phone", "email", "address", "date_of_birth", "tier_id",
          "loyalty_points", "total_spent",
        ],
      },
      {
        label: "Tier rules for upgrades",
        table: "membership_tiers",
        kind: "read",
        source: "src/lib/pos-db.ts (tier cache)",
        columns: ["id", "name", "discount_percentage", "points_multiplier"],
      },
      {
        label: "Member's live vouchers in the register",
        table: "issued_vouchers",
        kind: "read",
        source: "src/lib/coupons.ts:291 (loadMemberVouchers)",
        columns: ["id", "token_slug", "campaign_id", "member_id", "status"],
      },
    ],
  },
];

/* ------------------------------------------------------------------ */
/* Probe                                                               */
/* ------------------------------------------------------------------ */

const NO_ROW = "00000000-0000-0000-0000-000000000000";

type Loose = {
  from: (t: string) => any;
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ error: any }>;
};
const sb = () => supabaseExternal as unknown as Loose;

/** Column names PostgREST names in its error text, e.g. 'event_id'. */
function namedColumn(message: string): string | null {
  const m =
    /column ["']?([a-z0-9_.]+)["']? does not exist/i.exec(message) ??
    /could not find the ['"]?([a-z0-9_]+)['"]? column/i.exec(message);
  return m?.[1]?.split(".").pop() ?? null;
}

type TableShape = { columns: Set<string>; required: Set<string> };

/**
 * Published table definitions straight from the live Data API — no repo file
 * is consulted. Used to name every gap at once instead of one error per run.
 */
async function loadShapes(): Promise<Record<string, TableShape>> {
  const { url, key } = supabaseConfig();
  // Use the signed-in staff session, exactly like every other health call.
  const token = (await supabaseExternal.auth.getSession()).data.session?.access_token ?? "";
  const headers: Record<string, string> = { apikey: key, Accept: "application/openapi+json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${url}/rest/v1/`, { headers });
  if (res.status === 401 || res.status === 403) {
    throw new Error(
      token
        ? "This account is not allowed to read the database's table list. Sign in with a staff account that has full access."
        : "Sign in with a staff account to run the database checks.",
    );
  }
  if (!res.ok) throw new Error(`The database did not publish its table list (HTTP ${res.status})`);
  const spec = (await res.json()) as {
    definitions?: Record<string, { properties?: Record<string, { description?: string }>; required?: string[] }>;
  };
  const out: Record<string, TableShape> = {};
  for (const [table, def] of Object.entries(spec.definitions ?? {})) {
    out[table] = {
      columns: new Set(Object.keys(def.properties ?? {})),
      required: new Set(def.required ?? []),
    };
  }
  return out;
}

async function probeOp(op: FeatureOp, shapes: Record<string, TableShape>): Promise<OpResult> {
  const base: OpResult = { ...op, ok: true, detail: "", missing: [], unmet: [] };

  // Database functions: call with the real argument names, no side effect
  // possible because the ids never match a row.
  if (op.table.startsWith("rpc:")) {
    const fn = op.table.slice(4);
    const args: Record<string, unknown> = {};
    for (const c of op.columns) args[c] = c.includes("id") ? NO_ROW : null;
    const { error } = await sb().rpc(fn, args);
    if (error && /could not find the function|does not exist/i.test(error.message ?? "")) {
      return { ...base, ok: false, detail: `Database function ${fn} is missing (${error.message})` };
    }
    return { ...base, detail: `Function ${fn} accepts this call` };
  }

  const shape = shapes[op.table];
  if (!shape) {
    return {
      ...base,
      ok: false,
      detail: `Missing table '${op.table}' — the live database does not publish it`,
      missing: op.columns,
    };
  }

  const missing = op.columns.filter((c) => !shape.columns.has(c));
  if (missing.length) {
    return {
      ...base,
      ok: false,
      missing,
      detail: missing
        .map((c) => `Missing column '${c}' on table '${op.table}'`)
        .join("; "),
    };
  }

  if (op.kind === "read") {
    const { error } = await sb()
      .from(op.table)
      .select(op.columns.join(","), { count: "exact", head: true });
    if (error) {
      const col = namedColumn(error.message ?? "");
      return {
        ...base,
        ok: false,
        missing: col ? [col] : [],
        detail: col
          ? `Missing column '${col}' on table '${op.table}'`
          : explainError(error),
      };
    }
    return { ...base, detail: `${op.columns.length} columns read cleanly` };
  }

  // Required fields the payload never sends — a save would trip the
  // "null value violates non-null constraint" rule the first time it runs.
  const unmet = (op.partial ? [] : [...shape.required]).filter(
    (c) => !op.columns.includes(c) && !["id", "created_at", "updated_at", "row_version"].includes(c),
  );

  const payload: Record<string, unknown> = {};
  for (const c of op.columns) payload[c] = null;
  const { error } = await sb().from(op.table).update(payload).eq(op.pk ?? "id", NO_ROW);
  if (error) {
    const col = namedColumn(error.message ?? "");
    return {
      ...base,
      ok: false,
      unmet,
      missing: col ? [col] : [],
      detail: col
        ? `Missing column '${col}' on table '${op.table}'`
        : explainError(error),
    };
  }
  return {
    ...base,
    ok: unmet.length === 0,
    unmet,
    detail: unmet.length
      ? `Payload never sends required field${unmet.length === 1 ? "" : "s"}: ${unmet.join(", ")}`
      : `${op.columns.length} columns accepted`,
  };
}

/** Run every feature's real query shapes against the live database. */
export async function runFeatureSchemaAudit(): Promise<FeatureSchemaReport> {
  let shapes: Record<string, TableShape>;
  try {
    shapes = await loadShapes();
  } catch (e) {
    return {
      at: new Date().toISOString(),
      features: FEATURES.map((f) => ({
        id: f.id,
        name: f.name,
        status: "skipped" as const,
        ops: f.ops.map((o) => ({ ...o, ok: false, detail: "Not checked", missing: [], unmet: [] })),
      })),
      error: (e as Error).message,
    };
  }

  const features: FeatureResult[] = [];
  for (const feature of FEATURES) {
    const ops: OpResult[] = [];
    for (const op of feature.ops) {
      try {
        ops.push(await probeOp(op, shapes));
      } catch (e) {
        ops.push({ ...op, ok: false, detail: (e as Error).message, missing: [], unmet: [] });
      }
    }
    features.push({
      id: feature.id,
      name: feature.name,
      status: ops.every((o) => o.ok) ? "healthy" : "fix-required",
      ops,
    });
  }
  return { at: new Date().toISOString(), features, error: null };
}

/** Plain text, for pasting into a support message. */
export function formatFeatureSchemaReport(report: FeatureSchemaReport): string {
  const lines = [`Feature & schema health — ${new Date(report.at).toLocaleString()}`, ""];
  if (report.error) lines.push(`Not checked: ${report.error}`, "");
  for (const f of report.features) {
    lines.push(`${f.status === "healthy" ? "[HEALTHY]" : "[SCHEMA FIX REQUIRED]"} ${f.name}`);
    for (const op of f.ops) {
      lines.push(`   ${op.ok ? "ok  " : "FAIL"} ${op.label} — ${op.table} — ${op.detail}`);
      lines.push(`        ${op.source}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
