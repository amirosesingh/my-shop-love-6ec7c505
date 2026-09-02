import type { PosState } from "@/core/types/pos-types";

/** Quote a JS value as a Postgres literal. */
const lit = (v: unknown): string => {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
  if (typeof v === "boolean") return v ? "true" : "false";
  const text = typeof v === "object" ? JSON.stringify(v) : String(v);
  return `'${text.replaceAll("'", "''")}'`;
};

function insertBlock(table: string, rows: Record<string, unknown>[]): string {
  if (!rows.length) return `-- ${table}: no rows\n`;
  const cols = Object.keys(rows[0]);
  const values = rows.map((r) => `  (${cols.map((c) => lit(r[c])).join(", ")})`).join(",\n");
  return `INSERT INTO public.${table} (${cols.join(", ")}) VALUES\n${values}\nON CONFLICT DO NOTHING;\n`;
}

/** Full local snapshot as a re-runnable SQL script. */
export function buildSqlBackup(state: PosState): string {
  const stamp = new Date().toISOString();
  const parts = [
    `-- POS backup generated ${stamp}`,
    `-- Restore with: psql <connection> -f this-file.sql`,
    "BEGIN;",
    insertBlock(
      "products",
      state.products.map((p) => ({
        id: p.id,
        barcode: p.barcode,
        sku: p.sku,
        name: p.name,
        category: p.category,
        cost_price: p.cost,
        selling_price: p.price,
        ecom_price: p.ecomPrice ?? null,
        ecom_visible: p.ecomVisible ?? true,
        stock_by_store: p.stockByStore,
        reorder_level: p.reorderLevel,
        tax_rate: p.taxRate,
      })),
    ),
    insertBlock(
      "members",
      state.members.map((m) => ({
        id: m.id,
        member_code: m.code,
        full_name: m.name,
        phone: m.phone,
        email: m.email,
        date_of_birth: m.birthday ?? null,
        loyalty_points: m.points,
        total_spent: m.totalSpend,
      })),
    ),
    insertBlock(
      "sales",
      state.sales.map((s) => ({
        id: s.id,
        bill_number: s.receiptNo,
        store_id: s.storeId,
        shift_id: s.shiftId,
        cashier_name: s.cashier,
        member_id: s.memberId,
        subtotal_amount: s.subtotal,
        discount_amount: s.discount,
        tax_amount: s.tax,
        total_amount: s.total,
        paid_amount: s.paid,
        change_amount: s.change,
        payment_type: s.method,
        points_earned: s.pointsEarned,
        is_refunded: !!s.refunded,
        created_at: s.createdAt,
      })),
    ),
    insertBlock(
      "sale_items",
      state.sales.flatMap((s) =>
        s.lines.map((l) => ({
          sale_id: s.id,
          product_id: l.productId,
          product_name: l.name,
          unit_price: l.price,
          quantity: l.qty,
          discount_amount: l.discount,
          tax_rate: l.taxRate,
          is_foc: !!l.foc,
        })),
      ),
    ),
    "COMMIT;",
    "",
    "-- Terminal-local data (stores, shifts, bookings, transfers) as JSON:",
    ...[
      ["stores", state.stores],
      ["shifts", state.shifts],
      ["bookings", state.bookings],
      ["transfers", state.transfers],
      ["settings", state.settings],
    ].map(([name, value]) => `-- ${name}: ${JSON.stringify(value)}`),
  ];
  return parts.join("\n");
}

export function downloadSqlBackup(state: PosState) {
  const blob = new Blob([buildSqlBackup(state)], { type: "application/sql" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `pos-backup-${new Date().toISOString().slice(0, 10)}.sql`;
  a.click();
  URL.revokeObjectURL(url);
}
