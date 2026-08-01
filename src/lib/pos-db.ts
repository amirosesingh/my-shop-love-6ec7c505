import { toast } from "sonner";
import { supabaseExternal as supabase } from "@/integrations/supabase/external-client";
import { defaultSettings, seedState } from "./pos-seed";
import type {
  AppSettings,
  Member,
  MemberTier,
  PosState,
  Product,
  Promotion,
  Sale,
  PaperSize,
  PaymentMethod,
  PromoType,
  TaxMode,
} from "./pos-types";

/** Slices of app state that live in the cloud database. */
export type CloudSlice = Pick<
  PosState,
  "products" | "members" | "sales" | "promotions" | "settings"
>;

type Row = Record<string, any>;

export function dbError(context: string, error: unknown) {
  const message = (error as { message?: string })?.message ?? String(error);
  console.error(`[db] ${context}:`, error);
  toast.error(`${context} failed`, { description: message });
}

const num = (v: unknown, fallback = 0) => (v == null ? fallback : Number(v));

/* ------------------------------- mappers ------------------------------- */

export const rowToProduct = (r: Row): Product => ({
  id: r.id,
  name: r.name,
  sku: r.sku ?? r.barcode ?? "",
  barcode: r.barcode ?? "",
  category: r.category ?? "",
  price: num(r.selling_price),
  cost: num(r.cost_price),
  ecomPrice: r.ecom_price == null ? undefined : num(r.ecom_price),
  ecomVisible: r.ecom_visible ?? true,
  stockByStore: (r.stock_by_store ?? {}) as Record<string, number>,
  reorderLevel: num(r.reorder_level),
  taxRate: num(r.tax_rate),
  customPoints: r.custom_points == null ? undefined : num(r.custom_points),
});

export const productToRow = (p: Product): Row => ({
  id: p.id,
  barcode: p.barcode || p.sku || p.id,
  name: p.name,
  sku: p.sku ?? null,
  category: p.category ?? null,
  cost_price: p.cost ?? 0,
  selling_price: p.price ?? 0,
  ecom_price: p.ecomPrice ?? null,
  ecom_visible: p.ecomVisible ?? true,
  stock_quantity: Object.values(p.stockByStore ?? {}).reduce((a, b) => a + (b || 0), 0),
  stock_by_store: p.stockByStore ?? {},
  reorder_level: p.reorderLevel ?? 0,
  tax_rate: p.taxRate ?? 0,
  custom_points: p.customPoints ?? null,
});

const rowToMember = (r: Row, tierName: (id: string | null) => MemberTier): Member => ({
  id: r.id,
  code: r.member_code,
  name: r.full_name,
  phone: r.phone ?? "",
  email: r.email ?? "",
  tier: tierName(r.tier_id),
  points: num(r.loyalty_points),
  totalSpend: num(r.total_spent),
  joinedAt: (r.created_at ?? new Date().toISOString()).slice(0, 10),
  homeStoreId: r.address ?? undefined,
  birthday: r.date_of_birth ?? undefined,
});

const memberToRow = (m: Member, tierId: (name: MemberTier) => string | null): Row => ({
  id: m.id,
  member_code: m.code,
  full_name: m.name,
  phone: m.phone,
  email: m.email || null,
  address: m.homeStoreId ?? null,
  date_of_birth: m.birthday || null,
  tier_id: tierId(m.tier),
  loyalty_points: m.points ?? 0,
  total_spent: m.totalSpend ?? 0,
});

const rowToPromotion = (r: Row): Promotion => ({
  id: r.id,
  name: r.title,
  type: r.promo_type as PromoType,
  active: !!r.is_active,
  startDate: r.start_date ?? undefined,
  endDate: r.end_date ?? undefined,
  pointsPerDollar: num(r.points_per_dollar, 1),
  minBill: num(r.min_spend),
  focProductId: r.foc_product_id ?? undefined,
  focQty: 1,
  value: num(r.discount_percent) || num(r.discount_amount),
  valueType: num(r.discount_percent) ? "percent" : "amount",
  tierRates: (r.tier_rates ?? undefined) as Record<MemberTier, number> | undefined,
});

const promotionToRow = (p: Promotion): Row => ({
  id: p.id,
  title: p.name,
  promo_type: p.type,
  is_active: p.active,
  start_date: p.startDate || null,
  end_date: p.endDate || null,
  points_per_dollar: p.pointsPerDollar ?? 1,
  min_spend: p.minBill ?? 0,
  foc_product_id: p.focProductId ?? null,
  discount_percent: p.valueType === "percent" ? (p.value ?? 0) : 0,
  discount_amount: p.valueType === "amount" ? (p.value ?? 0) : 0,
  tier_rates: p.tierRates ?? null,
});

const rowToSettings = (r: Row | null): AppSettings =>
  r
    ? {
        tax: {
          enabled: !!r.enable_tax,
          rate: num(r.tax_percentage),
          mode: (r.tax_mode ?? "exclusive") as TaxMode,
        },
        receipt: {
          paper: (r.paper_size ?? "80mm") as PaperSize,
          headerText: r.header_text ?? "",
          footerText: r.footer_text ?? "",
          showLogo: r.show_logo ?? true,
          showPoints: r.show_points ?? true,
          showBarcode: r.show_barcode ?? true,
          showTax: r.show_tax_details ?? true,
        },
      }
    : defaultSettings;

const settingsToRow = (s: AppSettings): Row => ({
  id: 1,
  tax_percentage: s.tax.rate,
  enable_tax: s.tax.enabled,
  tax_mode: s.tax.mode,
  paper_size: s.receipt.paper,
  header_text: s.receipt.headerText,
  footer_text: s.receipt.footerText,
  show_logo: s.receipt.showLogo,
  show_points: s.receipt.showPoints,
  show_barcode: s.receipt.showBarcode,
  show_tax_details: s.receipt.showTax,
  updated_at: new Date().toISOString(),
});

const rowToSale = (r: Row): Sale => ({
  id: r.id,
  receiptNo: r.bill_number,
  storeId: r.store_id ?? "",
  shiftId: r.shift_id ?? "",
  lines: ((r.sale_items ?? []) as Row[]).map((l) => ({
    productId: l.product_id ?? "",
    name: l.product_name,
    price: num(l.unit_price),
    qty: Number(l.quantity),
    taxRate: num(l.tax_rate),
    discount: num(l.discount_percent) || num(l.discount_amount),
    discountType: num(l.discount_percent) ? "percent" : "amount",
    credit: !!l.is_return,
    foc: !!l.is_foc,
    promoId: l.promo_id ?? undefined,
  })),
  subtotal: num(r.subtotal_amount),
  discount: num(r.discount_amount),
  tax: num(r.tax_amount),
  total: num(r.total_amount),
  paid: num(r.paid_amount),
  change: num(r.change_amount),
  method: (r.payment_type ?? "cash") as PaymentMethod,
  memberId: r.member_id ?? null,
  pointsEarned: num(r.points_earned),
  cashier: r.cashier_name ?? "",
  createdAt: r.created_at,
  refunded: !!r.is_refunded,
  exchangeOfReceiptNo: r.original_bill_number ?? undefined,
  exchangedToReceiptNo: r.exchanged_to_bill_number ?? undefined,
  exchangeCredit: num(r.exchange_credit) || undefined,
});

const saleToRow = (s: Sale): Row => ({
  id: s.id,
  bill_number: s.receiptNo,
  member_id: s.memberId,
  store_id: s.storeId,
  shift_id: s.shiftId,
  cashier_name: s.cashier,
  subtotal_amount: s.subtotal,
  total_amount: s.total,
  discount_amount: s.discount,
  tax_amount: s.tax,
  payment_type: s.method,
  points_earned: s.pointsEarned,
  points_redeemed: s.method === "points" ? s.paid : 0,
  is_exchange: !!s.exchangeOfReceiptNo,
  original_bill_number: s.exchangeOfReceiptNo ?? null,
  exchange_credit: s.exchangeCredit ?? 0,
  paid_amount: s.paid,
  change_amount: s.change,
  is_refunded: !!s.refunded,
  created_at: s.createdAt,
});

const saleItemRows = (s: Sale) =>
  s.lines.map((l) => ({
    sale_id: s.id,
    product_id: l.productId || null,
    product_name: l.name,
    unit_price: l.price,
    quantity: l.qty,
    discount_percent: l.discountType === "percent" ? (l.discount ?? 0) : 0,
    discount_amount: l.discountType === "percent" ? 0 : (l.discount ?? 0),
    tax_rate: l.taxRate ?? 0,
    is_return: !!l.credit,
    is_foc: !!l.foc,
    promo_id: l.promoId ?? null,
  }));

/* --------------------------- tier name cache --------------------------- */

let tierIdByName: Record<string, string> = {};
let tierNameById: Record<string, MemberTier> = {};

const tierId = (name: MemberTier) => tierIdByName[name] ?? null;
const tierName = (id: string | null): MemberTier =>
  (id && tierNameById[id]) || "Bronze";

/* ------------------------------ bootstrap ------------------------------ */

/** First run: copy the built-in demo catalogue into the empty database. */
async function seedCloud() {
  const idMap = new Map<string, string>();
  const products = seedState.products.map((p) => {
    const id = crypto.randomUUID();
    idMap.set(p.id, id);
    return productToRow({ ...p, id });
  });
  await supabase.from("products").insert(products as never);

  const members = seedState.members.map((m) =>
    memberToRow({ ...m, id: crypto.randomUUID() }, tierId),
  );
  await supabase.from("members").insert(members as never);

  const promotions = seedState.promotions.map((p) =>
    promotionToRow({
      ...p,
      id: crypto.randomUUID(),
      focProductId: p.focProductId ? idMap.get(p.focProductId) : undefined,
    }),
  );
  await supabase.from("promotions").insert(promotions as never);
}

/** Load every cloud-backed slice of the POS state. */
export async function loadCloudState(): Promise<CloudSlice> {
  const tiers = await supabase.from("membership_tiers").select("id, name");
  if (tiers.error) throw tiers.error;
  tierIdByName = {};
  tierNameById = {};
  for (const t of tiers.data ?? []) {
    tierIdByName[t.name] = t.id;
    tierNameById[t.id] = t.name as MemberTier;
  }

  const first = await supabase.from("products").select("id").limit(1);
  if (first.error) throw first.error;
  if (!first.data?.length) await seedCloud();

  const [products, members, sales, promotions, settings] = await Promise.all([
    supabase.from("products").select("*").order("name"),
    supabase.from("members").select("*").order("created_at"),
    supabase
      .from("sales")
      .select("*, sale_items(*)")
      .order("created_at", { ascending: false })
      .limit(500),
    supabase.from("promotions").select("*").order("created_at"),
    supabase.from("pos_settings").select("*").eq("id", 1).maybeSingle(),
  ]);

  const err =
    products.error || members.error || sales.error || promotions.error || settings.error;
  if (err) throw err;

  return {
    products: (products.data ?? []).map(rowToProduct),
    members: (members.data ?? []).map((m) => rowToMember(m, tierName)),
    sales: (sales.data ?? []).map(rowToSale),
    promotions: (promotions.data ?? []).map(rowToPromotion),
    settings: rowToSettings(settings.data as Row | null),
  };
}

/* ------------------------------- writers ------------------------------- */

const run = async (
  context: string,
  fn: () => PromiseLike<{ error?: unknown } | void>,
) => {
  try {
    const res = await fn();
    if (res && (res as { error?: unknown }).error) dbError(context, (res as { error: unknown }).error);
  } catch (e) {
    dbError(context, e);
  }
};

export const db = {
  upsertProduct: (p: Product) =>
    run("Saving product", () =>
      supabase.from("products").upsert(productToRow(p) as never, { onConflict: "id" }),
    ),
  upsertProducts: (list: Product[]) =>
    run("Saving products", () =>
      supabase
        .from("products")
        .upsert(list.map(productToRow) as never, { onConflict: "id" }),
    ),
  deleteProduct: (id: string) =>
    run("Deleting product", () => supabase.from("products").delete().eq("id", id)),

  upsertMember: (m: Member) =>
    run("Saving member", () =>
      supabase.from("members").upsert(memberToRow(m, tierId) as never, { onConflict: "id" }),
    ),
  deleteMember: (id: string) =>
    run("Deleting member", () => supabase.from("members").delete().eq("id", id)),

  upsertPromotion: (p: Promotion) =>
    run("Saving promotion", () =>
      supabase.from("promotions").upsert(promotionToRow(p) as never, { onConflict: "id" }),
    ),
  deletePromotion: (id: string) =>
    run("Deleting promotion", () => supabase.from("promotions").delete().eq("id", id)),

  saveSettings: (s: AppSettings) =>
    run("Saving settings", () =>
      supabase.from("pos_settings").upsert(settingsToRow(s) as never, { onConflict: "id" }),
    ),

  /** Persist a completed bill, its lines, the stock movement and member points. */
  async recordSale(sale: Sale, products: Product[], member: Member | null) {
    await run("Saving sale", async () => {
      const res = await supabase.from("sales").insert(saleToRow(sale) as never);
      if (res.error) return res;
      return supabase.from("sale_items").insert(saleItemRows(sale) as never);
    });
    if (products.length) await db.upsertProducts(products);
    if (member) await db.upsertMember(member);
    if (sale.exchangeOfReceiptNo) {
      await run("Linking exchange bill", () =>
        supabase
          .from("sales")
          .update({ exchanged_to_bill_number: sale.receiptNo } as never)
          .eq("bill_number", sale.exchangeOfReceiptNo!),
      );
    }
  },

  async refundSale(saleId: string, products: Product[]) {
    await run("Refunding sale", () =>
      supabase.from("sales").update({ is_refunded: true } as never).eq("id", saleId),
    );
    if (products.length) await db.upsertProducts(products);
  },

  /** Batch-push pending audit rows; returns the ids that landed in the cloud. */
  async pushAuditLogs(
    rows: {
      id: string;
      at: string;
      staffName: string;
      category: string;
      action: string;
      module: string;
      details: Record<string, unknown>;
    }[],
  ) {
    const { error } = await supabase.from("audit_logs").insert(
      rows.map((r) => ({
        id: r.id,
        user_name: r.staffName,
        action_category: r.category,
        action_name: r.action,
        target_module: r.module,
        details: r.details as never,
        created_at: r.at,
      })) as never,
    );
    if (error) throw error;
    return rows.map((r) => r.id);
  },

  /** Purchase order / receiving invoice. */
  async recordPurchaseOrder(
    po: {
      poNumber: string;
      supplier: string;
      operator: string;
      totalCost: number;
      itemCount: number;
    },
    items: {
      productId: string | null;
      barcode: string;
      name: string;
      cost: number;
      price: number;
      qty: number;
    }[],
  ) {
    try {
      const { data, error } = await supabase
        .from("purchase_orders")
        .insert({
          po_number: po.poNumber,
          supplier_name: po.supplier,
          operator_name: po.operator,
          total_cost: po.totalCost,
          total_items_count: po.itemCount,
        } as never)
        .select("id")
        .single();
      if (error) throw error;
      const poId = (data as unknown as { id: string }).id;
      const { error: itemsError } = await supabase.from("purchase_order_items").insert(
        items.map((i) => ({
          po_id: poId,
          product_id: i.productId,
          barcode: i.barcode,
          product_name: i.name,
          cost_price: i.cost,
          selling_price: i.price,
          quantity_received: i.qty,
          subtotal_cost: i.cost * i.qty,
        })) as never,
      );
      if (itemsError) throw itemsError;
    } catch (e) {
      dbError("Saving purchase order", e);
    }
  },
};