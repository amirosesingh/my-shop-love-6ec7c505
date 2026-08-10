import { toast } from "sonner";
import { supabaseExternal as supabase } from "@/integrations/supabase/external-client";
import { defaultSettings, sampleState } from "./pos-seed";
import { drainOutbox, runOpLive } from "./sync-engine";
import { electronDb, localDb, readBranch } from "./local-db";
import { enqueue, listQueue, persisted, type SyncOp } from "./sync-outbox";
import { isLiveOnly } from "./live-mode";
import {
  effectiveDatabaseMode,
  isConnectionError,
  noteConnectionLost,
  noteConnectionRestored,
} from "./db-mode";
import { notifyError, showNotification } from "./notify";
import { canRelay, relayStores } from "./sync-relay";
import { keyset, nextCursor, PAGE_SIZE, type Cursor, type Page } from "./keyset";
import {
  isLinkedRecordError,
  usageBlock,
  type ProductUsage,
} from "./product-delete";
import type {
  AppSettings,
  Member,
  MemberTier,
  PosState,
  Product,
  Promotion,
  Sale,
  Shift,
  ShiftSession,
  Store,
  PaperSize,
  PaymentMethod,
  PromoType,
  TaxMode,
} from "./pos-types";

/** Slices of app state that live in the cloud database. */
export type CloudSlice = Pick<
  PosState,
  "products" | "members" | "sales" | "promotions" | "settings"
> & { stores: Store[]; shifts: Shift[] };

type Row = Record<string, any>;

export function dbError(context: string, error: unknown) {
  console.error(`[db] ${context}:`, error);
  // Offline is a normal state for a till: the change is already stored here
  // and will sync later. Say so rather than failing silently.
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    showNotification(`${context} saved on this terminal — it will sync when the connection is back.`, "info");
    return;
  }
  notifyError(error, context);
}

const num = (v: unknown, fallback = 0) => (v == null ? fallback : Number(v));

/**
 * Which records still point at a product. Uses the database guard routine and
 * falls back to direct counts when that routine has not been installed yet.
 */
async function productDeleteBlock(id: string): Promise<{ code: string; reason: string } | null> {
  try {
    const rpc = (await (
      supabase as unknown as {
        rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
      }
    ).rpc("product_delete_guard", { _product_id: id })) as { data: unknown; error: unknown };
    if (!rpc.error && rpc.data) return usageBlock(rpc.data as ProductUsage);
  } catch {
    /* fall through to the direct counts below */
  }
  try {
    const probe = async (table: string, column: string) => {
      const res = await supabase.from(table as never).select("id").eq(column, id).limit(1);
      return !res.error && Array.isArray(res.data) && res.data.length > 0;
    };
    const [sales, purchases, transfers, adjustments, promotions] = await Promise.all([
      probe("sale_items", "product_id"),
      probe("purchase_order_items", "product_id"),
      probe("stock_transfer_items", "product_id"),
      probe("stock_adjustments", "product_id"),
      probe("promotions", "foc_product_id"),
    ]);
    return usageBlock({ sales, purchases, transfers, adjustments, promotions });
  } catch {
    return null;
  }
}

/* ------------------------------- mappers ------------------------------- */

export const rowToProduct = (r: Row): Product => ({
  id: r.id,
  name: r.name,
  sku: r.sku ?? r.barcode ?? "",
  barcode: r.barcode ?? "",
  category: r.category ?? "",
  subCategory: r.sub_category ?? undefined,
  unit: r.unit ?? undefined,
  packs: Array.isArray(r.packs) ? r.packs : [],
  barcodes: Array.isArray(r.barcode_aliases) ? r.barcode_aliases : [],
  price: num(r.selling_price),
  cost: num(r.cost_price),
  ecomPrice: r.ecom_price == null ? undefined : num(r.ecom_price),
  ecomVisible: r.ecom_visible ?? true,
  archived: r.is_archived === true,
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
  sub_category: p.subCategory ?? null,
  unit: p.unit ?? null,
  packs: p.packs ?? [],
  barcode_aliases: p.barcodes ?? [],
  cost_price: p.cost ?? 0,
  selling_price: p.price ?? 0,
  ecom_price: p.ecomPrice ?? null,
  ecom_visible: p.ecomVisible ?? true,
  is_archived: p.archived === true,
  archived_at: p.archived ? new Date().toISOString() : null,
  // Stock is only ever written when the caller actually carries the per-branch
  // map. A product saved without it (a price or name edit, a partial import)
  // must never zero the quantity that is already banked in the database.
  ...(p.stockByStore && typeof p.stockByStore === "object"
    ? {
        stock_quantity: Object.values(p.stockByStore).reduce((a, b) => a + (b || 0), 0),
        stock_by_store: p.stockByStore,
      }
    : {}),
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
  partner: r.partner ?? undefined,
});

export const rowToStore = (r: Row): Store => ({
  id: r.id,
  code: r.code ?? "",
  name: r.name ?? "",
  address: r.address ?? "",
  phone: r.phone ?? "",
  groupId: r.group_id ?? "default",
});

export const storeToRow = (s: Store): Row => ({
  id: s.id,
  code: s.code,
  name: s.name,
  address: s.address || null,
  phone: s.phone || null,
  group_id: s.groupId?.trim() || "default",
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
  partner: p.partner?.trim() ? p.partner.trim() : null,
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
          ...defaultSettings.receipt,
          paper: (r.paper_size ?? "80mm") as PaperSize,
          companyName: r.company_name ?? defaultSettings.receipt.companyName,
          taxNumber: r.tax_number ?? "",
          regNumber: r.reg_number ?? "",
          phone: r.phone ?? "",
          website: r.website ?? "",
          headerText: r.header_text ?? "",
          footerText: r.footer_text ?? "",
          showLogo: r.show_logo ?? true,
          showPoints: r.show_points ?? true,
          showBarcode: r.show_barcode ?? true,
          showTax: r.show_tax_details ?? true,
          fonts: {
            ...defaultSettings.receipt.fonts,
            ...((r.fonts ?? {}) as AppSettings["receipt"]["fonts"]),
          },
          customLines: Array.isArray(r.custom_lines) ? r.custom_lines : [],
          qr: { ...defaultSettings.receipt.qr, ...((r.qr ?? {}) as object) },
          bookingSlip: {
            ...defaultSettings.receipt.bookingSlip,
            ...((r.booking_slip ?? {}) as object),
          },
        },
        payment: {
          ...defaultSettings.payment,
          ...((r.payment_details ?? {}) as object),
        },
        whatsapp: {
          ...defaultSettings.whatsapp,
          ...((r.whatsapp_settings ?? {}) as object),
        },
        review: {
          maxVoids: num(r.review_max_voids, defaultSettings.review.maxVoids),
          maxRefunds: num(r.review_max_refunds, defaultSettings.review.maxRefunds),
          maxRefundValue: num(
            r.review_max_refund_value,
            defaultSettings.review.maxRefundValue,
          ),
          maxNoSaleOpens: num(r.review_max_nosale, defaultSettings.review.maxNoSaleOpens),
          maxDiscountPct: num(
            r.review_max_discount_pct,
            defaultSettings.review.maxDiscountPct,
          ),
        },
        hours: {
          dayStart: r.day_start_time ?? defaultSettings.hours.dayStart,
          dayEnd: r.day_end_time ?? defaultSettings.hours.dayEnd,
          maxShiftHours: num(r.max_shift_hours, defaultSettings.hours.maxShiftHours),
          reminderMinutes: num(
            r.shift_reminder_minutes,
            defaultSettings.hours.reminderMinutes,
          ),
        },
        visibility: {
          hidden: ((r.ui_visibility as { hidden?: Record<string, string[]> } | null)?.hidden ??
            {}) as Record<string, string[]>,
        },
        integrations: {
          ...defaultSettings.integrations,
          ...((r.integration_settings ?? {}) as object),
        },
      }
    : defaultSettings;

/**
 * Columns this database does not have (older POS schema). Once the API tells
 * us a column is unknown we stop sending it, so the rest of the settings keep
 * saving instead of the whole record failing.
 */
const missingSettingsColumns = new Set<string>();

/** "Could not find the 'x' column of 'pos_settings' in the schema cache" */
const unknownSettingsColumn = (message: string): string | null => {
  const m = /could not find the '([^']+)' column/i.exec(message);
  return m?.[1] ?? null;
};

const buildSettingsRow = (s: AppSettings): Row => ({
  id: 1,
  tax_percentage: s.tax.rate,
  enable_tax: s.tax.enabled,
  tax_mode: s.tax.mode,
  paper_size: s.receipt.paper,
  company_name: s.receipt.companyName,
  tax_number: s.receipt.taxNumber,
  reg_number: s.receipt.regNumber,
  phone: s.receipt.phone,
  website: s.receipt.website,
  fonts: s.receipt.fonts,
  custom_lines: s.receipt.customLines,
  qr: s.receipt.qr,
  booking_slip: s.receipt.bookingSlip,
  payment_details: s.payment,
  whatsapp_settings: s.whatsapp,
  header_text: s.receipt.headerText,
  footer_text: s.receipt.footerText,
  show_logo: s.receipt.showLogo,
  show_points: s.receipt.showPoints,
  show_barcode: s.receipt.showBarcode,
  show_tax_details: s.receipt.showTax,
  review_max_voids: s.review.maxVoids,
  review_max_refunds: s.review.maxRefunds,
  review_max_refund_value: s.review.maxRefundValue,
  review_max_nosale: s.review.maxNoSaleOpens,
  review_max_discount_pct: s.review.maxDiscountPct,
  day_start_time: s.hours.dayStart,
  day_end_time: s.hours.dayEnd,
  max_shift_hours: s.hours.maxShiftHours,
  shift_reminder_minutes: s.hours.reminderMinutes,
  ui_visibility: s.visibility ?? { hidden: {} },
  integration_settings: s.integrations ?? {},
  updated_at: new Date().toISOString(),
});

const settingsToRow = (s: AppSettings): Row => {
  const row = buildSettingsRow(s);
  missingSettingsColumns.forEach((col) => delete (row as Record<string, unknown>)[col]);
  return row;
};

const rowToShift = (r: Row): Shift => ({
  id: r.id,
  storeId: r.store_id ?? "",
  cashier: r.opened_by_name ?? "",
  openedAt: r.opened_at,
  closedAt: r.closed_at ?? null,
  openingFloat: Number(r.opening_float ?? 0),
  countedCash: r.counted_cash == null ? null : Number(r.counted_cash),
  note: r.note ?? "",
  status: (r.status as "OPEN" | "CLOSED" | null) ?? (r.closed_at ? "CLOSED" : "OPEN"),
  closingFloat: r.closing_float == null ? null : Number(r.closing_float),
  userId: r.user_id ?? null,
  terminalId: r.terminal_id ?? undefined,
  terminalName: r.terminal_name ?? undefined,
  openedByStaffId: r.opened_by_staff_id ?? undefined,
  openedByRole: r.opened_by_role ?? undefined,
  closedBy: r.closed_by_name ?? undefined,
  closedByStaffId: r.closed_by_staff_id ?? undefined,
  closedByRole: r.closed_by_role ?? undefined,
  expectedCash: r.expected_cash == null ? null : Number(r.expected_cash),
  overdue: Boolean(r.overdue),
});

const shiftToRow = (s: Shift): Row => ({
  id: s.id,
  store_id: s.storeId,
  terminal_id: s.terminalId ?? null,
  terminal_name: s.terminalName ?? null,
  opened_by_name: s.cashier,
  opened_by_staff_id: s.openedByStaffId ?? null,
  opened_by_role: s.openedByRole ?? null,
  closed_by_name: s.closedBy ?? null,
  closed_by_staff_id: s.closedByStaffId ?? null,
  closed_by_role: s.closedByRole ?? null,
  opened_at: s.openedAt,
  closed_at: s.closedAt,
  opening_float: s.openingFloat,
  counted_cash: s.countedCash,
  closing_float: s.closingFloat ?? s.countedCash ?? null,
  user_id: s.userId ?? null,
  status: s.status ?? (s.closedAt ? "CLOSED" : "OPEN"),
  expected_cash: s.expectedCash ?? null,
  note: s.note,
  overdue: s.overdue ?? false,
  updated_at: new Date().toISOString(),
});

const rowToShiftSession = (r: Row): ShiftSession => ({
  id: r.id,
  shiftId: r.shift_id ?? "",
  storeId: r.store_id ?? "",
  terminalId: r.terminal_id ?? null,
  terminalName: r.terminal_name ?? null,
  staffId: r.staff_id ?? null,
  staffName: r.staff_name ?? "",
  role: r.role ?? null,
  signedInAt: r.signed_in_at,
  signedOutAt: r.signed_out_at ?? null,
});

const shiftSessionToRow = (s: ShiftSession): Row => ({
  id: s.id,
  shift_id: s.shiftId,
  store_id: s.storeId,
  terminal_id: s.terminalId ?? null,
  terminal_name: s.terminalName ?? null,
  staff_id: s.staffId ?? null,
  staff_name: s.staffName,
  role: s.role ?? null,
  signed_in_at: s.signedInAt,
  signed_out_at: s.signedOutAt ?? null,
  updated_at: new Date().toISOString(),
});

/**
 * Exactly the bill and line columns the till renders — no `SELECT *`, so a
 * schema that grows new columns never inflates the payload of every read.
 */
const SALE_COLUMNS =
  "id, bill_number, store_id, shift_id, cashier_name, member_id, subtotal_amount, " +
  "discount_amount, tax_amount, total_amount, paid_amount, change_amount, payment_type, " +
  "payments, points_earned, is_refunded, original_bill_number, exchanged_to_bill_number, " +
  "exchange_credit, coupon_code, coupon_promo_id, coupon_scope, coupon_discount, created_at, " +
  "sale_items(product_id, product_name, unit_price, quantity, tax_rate, discount_percent, " +
  "discount_amount, is_return, is_foc, promo_id, coupon_code, coupon_discount, unit_cost)";

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
    couponCode: l.coupon_code ?? undefined,
    couponDiscount: num(l.coupon_discount) || undefined,
    cost: num(l.unit_cost) || undefined,
  })),
  subtotal: num(r.subtotal_amount),
  discount: num(r.discount_amount),
  tax: num(r.tax_amount),
  total: num(r.total_amount),
  paid: num(r.paid_amount),
  change: num(r.change_amount),
  method: (r.payment_type ?? "cash") as PaymentMethod,
  payments: Array.isArray(r.payments) ? (r.payments as Sale["payments"]) : undefined,
  memberId: r.member_id ?? null,
  pointsEarned: num(r.points_earned),
  cashier: r.cashier_name ?? "",
  createdAt: r.created_at,
  refunded: !!r.is_refunded,
  exchangeOfReceiptNo: r.original_bill_number ?? undefined,
  exchangedToReceiptNo: r.exchanged_to_bill_number ?? undefined,
  exchangeCredit: num(r.exchange_credit) || undefined,
  couponCode: r.coupon_code ?? undefined,
  couponPromoId: r.coupon_promo_id ?? undefined,
  couponScope: (r.coupon_scope ?? undefined) as Sale["couponScope"],
  couponDiscount: num(r.coupon_discount) || undefined,
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
  payments: s.payments ?? [],
  points_earned: s.pointsEarned,
  points_redeemed: s.method === "points" ? s.paid : 0,
  is_exchange: !!s.exchangeOfReceiptNo,
  original_bill_number: s.exchangeOfReceiptNo ?? null,
  exchange_credit: s.exchangeCredit ?? 0,
  paid_amount: s.paid,
  change_amount: s.change,
  is_refunded: !!s.refunded,
  coupon_code: s.couponCode ?? null,
  coupon_promo_id: s.couponPromoId ?? null,
  coupon_scope: s.couponScope ?? null,
  coupon_discount: s.couponDiscount ?? 0,
  created_at: s.createdAt,
});

const saleItemRows = (s: Sale) =>
  s.lines.map((l) => ({
    sale_id: s.id,
    product_id: l.productId || null,
    product_name: l.name,
    unit_price: l.price,
    unit_cost: l.cost ?? 0,
    quantity: l.qty,
    discount_percent: l.discountType === "percent" ? (l.discount ?? 0) : 0,
    discount_amount: l.discountType === "percent" ? 0 : (l.discount ?? 0),
    tax_rate: l.taxRate ?? 0,
    is_return: !!l.credit,
    is_foc: !!l.foc,
    promo_id: l.promoId ?? null,
    coupon_code: l.couponCode ?? null,
    coupon_discount: l.couponDiscount ?? 0,
  }));

/* --------------------------- tier name cache --------------------------- */

let tierIdByName: Record<string, string> = {};
let tierNameById: Record<string, MemberTier> = {};

const tierId = (name: MemberTier) => tierIdByName[name] ?? null;
const tierName = (id: string | null): MemberTier => (id && tierNameById[id]) || "Bronze";

/* ------------------------------ bootstrap ------------------------------ */

/**
 * Copy the built-in sample catalogue into the database. Never called on start
 * up — only from the explicit "Load sample data" action, so deleted records
 * stay deleted.
 */
export async function importSampleData() {
  const idMap = new Map<string, string>();
  const products = sampleState.products.map((p) => {
    const id = crypto.randomUUID();
    idMap.set(p.id, id);
    return productToRow({ ...p, id });
  });
  await supabase.from("products").insert(products as never);

  const members = sampleState.members.map((m) =>
    memberToRow({ ...m, id: crypto.randomUUID() }, tierId),
  );
  await supabase.from("members").insert(members as never);

  const promotions = sampleState.promotions.map((p) =>
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

  const [products, members, sales, promotions, settings, stores, shifts] = await Promise.all([
    supabase.from("products").select("*").order("name"),
    supabase.from("members").select("*").order("created_at"),
    supabase
      .from("sales")
      .select(SALE_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(500),
    supabase.from("promotions").select("*").order("created_at"),
    supabase.from("pos_settings").select("*").eq("id", 1).maybeSingle(),
    // The stores table only exists once schema10.sql has been applied; a
    // missing table must not stop the till from loading. Supabase query
    // builders are thenables, not Promises, so guard with try/catch.
    (async (): Promise<{ data: Row[] | null }> => {
      try {
        if (canRelay()) {
          const relayed = await relayStores();
          if (relayed.ok) return { data: (relayed.rows as Row[] | undefined) ?? [] };
        }
        // Branches are protected operational data. Without a proven staff or
        // terminal identity, keep the local snapshot instead of issuing a
        // browser request that row security is expected to refuse.
        return { data: null };
      } catch {
        return { data: null };
      }
    })(),
    (async (): Promise<{ data: Row[] | null }> => {
      try {
        const res = await supabase
          .from("shifts" as never)
          .select("*")
          .order("opened_at", { ascending: false })
          .limit(300);
        return { data: (res.data as Row[] | null) ?? null };
      } catch {
        return { data: null };
      }
    })(),
  ]);

  const err = products.error || members.error || sales.error || promotions.error || settings.error;
  if (err) throw err;

  return {
    products: (products.data ?? []).map(rowToProduct),
    members: (members.data ?? []).map((m) => rowToMember(m, tierName)),
    sales: (sales.data ?? []).map(rowToSale),
    promotions: (promotions.data ?? []).map(rowToPromotion),
    settings: rowToSettings(settings.data as Row | null),
    stores: ((stores.data as Row[] | null) ?? []).map(rowToStore),
    shifts: ((shifts.data as Row[] | null) ?? []).map(rowToShift),
  };
}

/* ------------------------------- writers ------------------------------- */

/**
 * The one authoritative "is the till open?" question.
 *
 * Strictly status-driven: a shift opened on any past date stays active until
 * something explicitly closes it. No date or time filtering here, ever.
 */
export async function loadActiveShift(storeId: string): Promise<Shift | null> {
  // A cashier signed in with a PIN has no account on the central database, so
  // the direct read is refused or filtered out. The proven server relay answers
  // for those tills — without it the register would flip back to "locked"
  // moments after a shift was opened.
  const { hasStaffSession, canRelay, relayActiveShift } = await import("./sync-relay");

  if (hasStaffSession()) {
    const res = await supabase
      .from("shifts" as never)
      .select("*")
      .eq("store_id", storeId)
      .eq("status", "OPEN")
      .order("opened_at", { ascending: false })
      .limit(1);
    if (!res.error) {
      const rows = (res.data as Row[] | null) ?? [];
      return rows.length ? rowToShift(rows[0]) : null;
    }
    if (!canRelay()) throw res.error;
  }

  if (!canRelay()) throw new Error("This till cannot read the central database yet");
  const relayed = await relayActiveShift(storeId);
  if (!relayed.ok) throw new Error(relayed.error ?? "Could not read the open shift");
  return relayed.row ? rowToShift(relayed.row as Row) : null;
}

/**
 * One page of older bills for a branch, newest first.
 *
 * Keyset paging on `(created_at, id)`: the register keeps the most recent 500
 * bills in memory, and history screens walk further back a page at a time
 * without ever paying for an OFFSET.
 */
export async function loadSalesPage(
  storeId: string,
  cursor: Cursor = null,
  limit = PAGE_SIZE,
): Promise<Page<Sale>> {
  let q = supabase.from("sales").select(SALE_COLUMNS);
  if (storeId) q = q.eq("store_id", storeId) as typeof q;
  const res = await keyset(q as never, "created_at", cursor, limit);
  const err = (res as { error?: { message: string } }).error;
  if (err) throw new Error(err.message);
  const rows = ((res as { data?: Row[] | null }).data ?? []) as Row[];
  return {
    rows: rows.map(rowToSale),
    cursor: nextCursor(rows, "created_at", limit),
    hasMore: rows.length >= limit,
  };
}

/** Recent sign-in sessions for a branch, newest first. */
export async function loadShiftSessions(storeId: string, limit = 200): Promise<ShiftSession[]> {
  const res = await supabase
    .from("shift_sessions" as never)
    .select("*")
    .eq("store_id", storeId)
    .order("signed_in_at", { ascending: false })
    .limit(limit);
  if (res.error) throw res.error;
  return ((res.data as Row[] | null) ?? []).map(rowToShiftSession);
}

/* --------------------- receiving invoices (purchase orders) -------------- */

export type ReceivingLine = {
  id: string;
  productId: string | null;
  barcode: string;
  sku: string;
  name: string;
  cost: number;
  price: number;
  qty: number;
};

export type ReceivingInvoice = {
  id: string;
  invoiceNo: string;
  supplier: string;
  supplierId: string | null;
  operator: string;
  storeId: string | null;
  storeCode: string | null;
  invoiceDate: string | null;
  entryDate: string;
  totalCost: number;
  itemCount: number;
  createdAt: string;
  lines: ReceivingLine[];
};

const rowToReceivingLine = (r: Row): ReceivingLine => ({
  id: r.id,
  productId: r.product_id ?? null,
  barcode: r.barcode ?? "",
  sku: r.sku ?? r.barcode ?? "",
  name: r.product_name ?? "",
  cost: num(r.cost_price),
  price: num(r.selling_price),
  qty: num(r.quantity_received),
});

const rowToReceivingInvoice = (r: Row): ReceivingInvoice => ({
  id: r.id,
  invoiceNo: r.po_number ?? "",
  supplier: r.supplier_name ?? "",
  supplierId: r.supplier_id ?? null,
  operator: r.operator_name ?? "",
  storeId: r.store_id ?? null,
  storeCode: r.store_code ?? null,
  invoiceDate: r.invoice_date ?? null,
  entryDate: r.invoice_entry_date ?? r.created_at ?? new Date().toISOString(),
  totalCost: num(r.total_cost),
  itemCount: num(r.total_items_count),
  createdAt: r.created_at ?? new Date().toISOString(),
  lines: (Array.isArray(r.purchase_order_items) ? (r.purchase_order_items as Row[]) : []).map(
    rowToReceivingLine,
  ),
});

const invoiceRow = (inv: ReceivingInvoice): Row => ({
  id: inv.id,
  po_number: inv.invoiceNo,
  supplier_name: inv.supplier,
  supplier_id: inv.supplierId,
  operator_name: inv.operator,
  store_id: inv.storeId,
  store_code: inv.storeCode,
  invoice_date: inv.invoiceDate,
  invoice_entry_date: inv.entryDate,
  total_cost: inv.totalCost,
  total_items_count: inv.itemCount,
});

const invoiceLineRow = (poId: string, l: ReceivingLine): Row => ({
  id: l.id,
  po_id: poId,
  product_id: l.productId,
  barcode: l.barcode,
  sku: l.sku || l.barcode || null,
  product_name: l.name,
  cost_price: l.cost,
  selling_price: l.price,
  quantity_received: l.qty,
  subtotal_cost: Number((l.cost * l.qty).toFixed(2)),
});

/**
 * Receiving invoices for a branch, newest first, with their lines.
 *
 * Invoices saved before this screen carried a branch have no `store_id`; they
 * are included so nothing that was already recorded disappears from view.
 */
export async function loadReceivingInvoices(
  storeId: string | null,
  limit = 100,
): Promise<ReceivingInvoice[]> {
  let q = supabase
    .from("purchase_orders" as never)
    .select("*, purchase_order_items(*)")
    .order("invoice_entry_date", { ascending: false })
    .limit(limit);
  if (storeId) q = q.or(`store_id.eq.${storeId},store_id.is.null`) as typeof q;
  const res = await q;
  if (res.error) throw res.error;
  return ((res.data as Row[] | null) ?? []).map(rowToReceivingInvoice);
}

/** True when another invoice already uses this number (the column is unique). */
export async function invoiceNumberTaken(invoiceNo: string, exceptId?: string): Promise<boolean> {
  const res = await supabase
    .from("purchase_orders" as never)
    .select("id")
    .eq("po_number", invoiceNo)
    .limit(2);
  if (res.error) return false; // offline: the unique index is still the last word
  return ((res.data as Row[] | null) ?? []).some((r) => r.id !== exceptId);
}

/** Latest catalogue rows for a set of products, straight from the database. */
export async function loadProductsByIds(ids: string[]): Promise<Product[]> {
  if (!ids.length) return [];
  const res = await supabase.from("products").select("*").in("id", ids);
  if (res.error) throw res.error;
  return ((res.data as Row[] | null) ?? []).map(rowToProduct);
}

/**
 * Writes never hit the network directly.
 *
 * On the Windows desktop shell they are committed to the local Microsoft SQL
 * Server instance (the source of truth) and the background worker pushes them
 * to the cloud later. In the browser they go to the localStorage outbox and the
 * in-page sync engine drains them. Either way the till keeps working offline.
 */
const queue = (context: string, op: SyncOp) => {
  // Android is live-only: the write goes to the backend now, and any failure
  // is surfaced instead of being queued for later.
  if (isLiveOnly()) {
    void runOpLive(context, op).catch((e) => dbError(context, e));
    return;
  }
  const bridge = localDb();
  if (bridge) {
    void bridge.write(context, op).then((res) => {
      if (!res.ok) dbError(context, new Error(res.error ?? "Local database write failed"));
    });
    return;
  }
  enqueue(context, op);
  void drainOutbox();
};

/* ---------------------------- durable commits --------------------------- */

/** Where a committed change actually landed. */
export type CommitTarget = "cloud" | "local" | "outbox";

/**
 * Store a group of writes and only resolve once they are safe somewhere:
 * the cloud database, the local desktop database, or the on-disk outbox.
 *
 * Callers await this before printing, clearing the cart or starting the next
 * action — nothing moves on while the data is still only in memory.
 */
export async function commitOps(context: string, ops: SyncOp[]): Promise<CommitTarget> {
  if (!ops.length) return noteCommitTarget("cloud");

  // Android / live-only: the backend is the single source of truth.
  if (isLiveOnly()) {
    for (const op of ops) await runOpLive(context, op);
    return noteCommitTarget("cloud");
  }

  // Windows desktop: the local SQL Server instance is the source of truth.
  const bridge = localDb();
  if (bridge) {
    for (const op of ops) {
      const res = await bridge.write(context, op);
      if (!res.ok) throw new Error(res.error ?? `${context} could not be stored locally`);
    }
    return noteCommitTarget("local");
  }

  // Browser: queue to disk first (durable), then try to push it up now.
  // In "Online only" mode the central database is tried first; the queue is
  // still used the moment that attempt cannot reach the server.
  if (effectiveDatabaseMode() === "online") {
    try {
      for (const op of ops) await runOpLive(context, op);
      noteConnectionRestored();
      return noteCommitTarget("cloud");
    } catch (e) {
      if (!isConnectionError(e)) throw e;
      noteConnectionLost();
      /* fall through: store it locally so nothing is lost */
    }
  }
  const ids = ops.map((op) => enqueue(context, op).id);
  if (!persisted(ids)) {
    throw new Error(`${context} could not be stored on this device — nothing was saved`);
  }
  try {
    await drainOutbox();
  } catch {
    /* still safely queued on disk */
  }
  const remaining = listQueue().filter((q) => ids.includes(q.id));
  const stuck = remaining.find((q) => q.quarantined);
  if (stuck) throw new Error(stuck.lastError ?? `${context} failed`);
  return noteCommitTarget(remaining.length ? "outbox" : "cloud");
}

/** Human wording for a completed commit. */
export const commitLabel = (t: CommitTarget) =>
  t === "cloud" ? "Saved" : t === "local" ? "Saved on this terminal" : "Saved offline — will sync";

let lastTarget: CommitTarget = "cloud";
/** Where the most recent successful commit landed (for the "Saved…" note). */
export const lastCommitTarget = () => lastTarget;
export const noteCommitTarget = (t: CommitTarget) => {
  lastTarget = t;
  return t;
};

export const db = {
  upsertProduct: (p: Product) =>
    queue("Saving product", { kind: "upsert", table: "products", rows: [productToRow(p)] }),
  upsertProducts: (list: Product[]) => {
    if (!list.length) return;
    queue("Saving products", { kind: "upsert", table: "products", rows: list.map(productToRow) });
  },
  deleteProduct: (id: string) =>
    queue("Deleting product", { kind: "delete", table: "products", match: { id } }),
  /**
   * Asks the database which records still point at a product before anything
   * is deleted, so the screen can explain the refusal instead of relying on a
   * raw constraint error. A guard that cannot be reached returns null and the
   * delete goes ahead — the foreign keys are still the final word.
   */
  /**
   * Delete a product and wait for the answer.
   *
   * Unlike the queued version this surfaces a refusal from the database (for
   * example the item is on past bills) so the screen can explain it instead of
   * silently dropping the row. A plain connectivity failure still falls back to
   * the durable queue.
   */
  deleteProductNow: async (id: string): Promise<void> => {
    const op: SyncOp = { kind: "delete", table: "products", match: { id } };
    const bridge = localDb();
    if (bridge) {
      const res = await bridge.write("Deleting product", op);
      if (!res.ok) throw new Error(res.error ?? "Deleting product failed");
      return;
    }
    try {
      const block = await productDeleteBlock(id);
      if (block) throw new Error(`${block.code}: ${block.reason}`);
      await runOpLive("Deleting product", op);
    } catch (e) {
      const message = (e as { message?: string })?.message ?? String(e);
      if (isLinkedRecordError(message)) throw e instanceof Error ? e : new Error(message);
      const offline = typeof navigator !== "undefined" && !navigator.onLine;
      if (!isLiveOnly() && (offline || /failed to fetch|network|timeout/i.test(message))) {
        enqueue("Deleting product", op);
        void drainOutbox();
        return;
      }
      throw e instanceof Error ? e : new Error(message);
    }
  },

  upsertStore: (s: Store) =>
    queue("Saving location", { kind: "upsert", table: "stores", rows: [storeToRow(s)] }),
  upsertStores: (list: Store[]) => {
    if (!list.length) return;
    queue("Saving locations", { kind: "upsert", table: "stores", rows: list.map(storeToRow) });
  },
  deleteStore: (id: string) =>
    queue("Deleting location", { kind: "delete", table: "stores", match: { id } }),

  upsertMember: (m: Member) =>
    queue("Saving member", { kind: "upsert", table: "members", rows: [memberToRow(m, tierId)] }),
  deleteMember: (id: string) =>
    queue("Deleting member", { kind: "delete", table: "members", match: { id } }),

  upsertPromotion: (p: Promotion) =>
    queue("Saving promotion", { kind: "upsert", table: "promotions", rows: [promotionToRow(p)] }),
  deletePromotion: (id: string) =>
    queue("Deleting promotion", { kind: "delete", table: "promotions", match: { id } }),

  upsertShift: (s: Shift) =>
    queue("Saving shift", { kind: "upsert", table: "shifts", rows: [shiftToRow(s)] }),

  upsertShiftSession: (s: ShiftSession) =>
    queue("Saving shift sign-in", {
      kind: "upsert",
      table: "shift_sessions",
      rows: [shiftSessionToRow(s)],
    }),

  saveSettings: (s: AppSettings) =>
    queue("Saving settings", {
      kind: "upsert",
      table: "pos_settings",
      rows: [settingsToRow(s)],
    }),

  /**
   * Explicit "Save settings" from a settings page: writes the whole record and
   * waits for confirmation, so the page can say whether it really landed.
   */
  async saveSettingsNow(s: AppSettings): Promise<void> {
    const op: SyncOp = {
      kind: "upsert",
      table: "pos_settings",
      rows: [settingsToRow(s)],
    };
    const bridge = localDb();
    if (bridge) {
      const res = await bridge.write("Saving settings", op);
      if (!res.ok) throw new Error(res.error ?? "Local database write failed");
      return;
    }
    const res = await supabase.from("pos_settings").upsert(settingsToRow(s) as never);
    if (!res.error) return;
    // The database is missing a newer column: drop it and save the rest, so a
    // single missing field never blocks the whole settings record.
    const col = unknownSettingsColumn(res.error.message);
    if (!col) throw new Error(res.error.message);
    missingSettingsColumns.add(col);
    const retry = await supabase.from("pos_settings").upsert(settingsToRow(s) as never);
    if (retry.error) throw new Error(retry.error.message);
    console.warn(
      `[settings] this database has no "${col}" column on pos_settings — saved everything else. Run supabase/schema27.sql to add it.`,
    );
  },

  /** Persist a completed bill, its lines, the stock movement and member points. */
  recordSale(sale: Sale, products: Product[], member: Member | null) {
    // Desktop shell: one transactional, fully offline call into local SQL Server.
    const bridge = electronDb();
    if (bridge) {
      void bridge
        .createSale({
          sale: saleToRow(sale),
          items: saleItemRows(sale),
          products: products.map(productToRow),
          member: member ? memberToRow(member, tierId) : null,
          branchId: readBranch().branchId ?? sale.storeId ?? null,
          exchangeOfBillNumber: sale.exchangeOfReceiptNo ?? null,
        })
        .then((res) => {
          if (!res.ok) dbError("Saving sale", new Error(res.error ?? "Local sale write failed"));
        })
        .catch((err) => dbError("Saving sale", err));
      return;
    }
    // Order matters — the queue drains sequentially and stops on failure.
    queue("Saving sale", { kind: "insert", table: "sales", rows: [saleToRow(sale)] });
    queue("Saving sale items", { kind: "insert", table: "sale_items", rows: saleItemRows(sale) });
    if (products.length) db.upsertProducts(products);
    if (member) db.upsertMember(member);
    if (sale.exchangeOfReceiptNo) {
      queue("Linking exchange bill", {
        kind: "update",
        table: "sales",
        values: { exchanged_to_bill_number: sale.receiptNo },
        match: { bill_number: sale.exchangeOfReceiptNo },
      });
    }
  },

  refundSale(saleId: string, products: Product[]) {
    queue("Refunding sale", {
      kind: "update",
      table: "sales",
      values: { is_refunded: true },
      match: { id: saleId },
    });
    if (products.length) db.upsertProducts(products);
  },

  /** Correct the tender recorded against a completed bill (e.g. card -> cash). */
  updateSalePayment(saleId: string, method: PaymentMethod) {
    queue("Correcting bill payment", {
      kind: "update",
      table: "sales",
      values: { payment_type: method },
      match: { id: saleId },
    });
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
    const { error } = await supabase.from("audit_logs").upsert(
      rows.map((r) => ({
        id: r.id,
        user_name: r.staffName,
        action_category: r.category,
        action_name: r.action,
        target_module: r.module,
        details: r.details as never,
        created_at: r.at,
      })) as never,
      { onConflict: "id", ignoreDuplicates: true },
    );
    if (error) throw error;
    return rows.map((r) => r.id);
  },

  /** Purchase order / receiving invoice. */
  /** No-sale cash-drawer open, queued so it survives an offline till. */
  recordDrawerEvent(row: {
    id: string;
    storeId: string | null;
    terminalId: string | null;
    shiftId: string | null;
    staffId: string | null;
    staffName: string | null;
    role: string | null;
    reason: string;
    note: string | null;
    approvedBy: string | null;
    at: string;
  }) {
    queue("Logging drawer open", {
      kind: "insert",
      table: "drawer_events",
      rows: [
        {
          id: row.id,
          store_id: row.storeId,
          terminal_id: row.terminalId,
          shift_id: row.shiftId,
          staff_id: row.staffId,
          staff_name: row.staffName,
          role: row.role,
          reason: row.reason,
          note: row.note,
          approved_by: row.approvedBy,
          created_at: row.at,
        },
      ],
    });
  },

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
    // The id is minted locally so the items can reference the invoice without
    // waiting for a server round-trip (works fully offline).
    const poId = crypto.randomUUID();
    queue("Saving purchase order", {
      kind: "insert",
      table: "purchase_orders",
      rows: [
        {
          id: poId,
          po_number: po.poNumber,
          supplier_name: po.supplier,
          operator_name: po.operator,
          total_cost: po.totalCost,
          total_items_count: po.itemCount,
        },
      ],
    });
    queue("Saving purchase order items", {
      kind: "insert",
      table: "purchase_order_items",
      rows: items.map((i) => ({
        po_id: poId,
        product_id: i.productId,
        barcode: i.barcode,
        product_name: i.name,
        cost_price: i.cost,
        selling_price: i.price,
        quantity_received: i.qty,
        subtotal_cost: i.cost * i.qty,
      })),
    });
  },

  /**
   * Store a receiving invoice and its lines, and wait until they are safe
   * (cloud, local database or the durable outbox). Nothing on screen is
   * cleared until this resolves, so an invoice can no longer vanish.
   */
  commitReceivingInvoice: (inv: ReceivingInvoice) =>
    commitOps("Saving receiving invoice", [
      { kind: "upsert", table: "purchase_orders", rows: [invoiceRow(inv)] },
      ...(inv.lines.length
        ? [
            {
              kind: "upsert" as const,
              table: "purchase_order_items",
              rows: inv.lines.map((l) => invoiceLineRow(inv.id, l)),
            },
          ]
        : []),
    ]),

  /**
   * Save corrections to an existing invoice in place. Removed lines are
   * deleted by id; everything else is updated, so history and the invoice id
   * survive the edit.
   */
  updateReceivingInvoice: (inv: ReceivingInvoice, removedLineIds: string[]) =>
    commitOps("Updating receiving invoice", [
      { kind: "upsert", table: "purchase_orders", rows: [invoiceRow(inv)] },
      ...(inv.lines.length
        ? [
            {
              kind: "upsert" as const,
              table: "purchase_order_items",
              rows: inv.lines.map((l) => invoiceLineRow(inv.id, l)),
            },
          ]
        : []),
      ...removedLineIds.map((id) => ({
        kind: "delete" as const,
        table: "purchase_order_items",
        match: { id },
      })),
    ]),

  /* --------------------- awaited, confirmed versions --------------------- */

  /** Save a completed bill and wait until it is stored somewhere. */
  async commitSale(sale: Sale, products: Product[], member: Member | null): Promise<CommitTarget> {
    const bridge = electronDb();
    if (bridge) {
      const res = await bridge.createSale({
        sale: saleToRow(sale),
        items: saleItemRows(sale),
        products: products.map(productToRow),
        member: member ? memberToRow(member, tierId) : null,
        branchId: readBranch().branchId ?? sale.storeId ?? null,
        exchangeOfBillNumber: sale.exchangeOfReceiptNo ?? null,
      });
      if (!res.ok) throw new Error(res.error ?? "The sale could not be stored on this terminal");
      return "local";
    }
    const ops: SyncOp[] = [
      { kind: "insert", table: "sales", rows: [saleToRow(sale)] },
      { kind: "insert", table: "sale_items", rows: saleItemRows(sale) },
    ];
    if (products.length)
      ops.push({ kind: "upsert", table: "products", rows: products.map(productToRow) });
    if (member) ops.push({ kind: "upsert", table: "members", rows: [memberToRow(member, tierId)] });
    if (sale.exchangeOfReceiptNo)
      ops.push({
        kind: "update",
        table: "sales",
        values: { exchanged_to_bill_number: sale.receiptNo },
        match: { bill_number: sale.exchangeOfReceiptNo },
      });
    return commitOps("Saving sale", ops);
  },

  /** Save a shift open/close and wait until it is stored somewhere. */
  commitShift: (s: Shift) =>
    commitOps("Saving shift", [{ kind: "upsert", table: "shifts", rows: [shiftToRow(s)] }]),

  /**
   * Read a shift straight back from the central database.
   *
   * Used after opening a shift so the till only unlocks once the row really
   * exists — a cashier must never be told "Shift opened" on a write the
   * database quietly refused.
   */
  async shiftExists(id: string): Promise<"yes" | "no" | "unknown"> {
    try {
      const res = await supabase
        .from("shifts" as never)
        .select("id")
        .eq("id", id)
        .limit(1);
      // A refused or failed read tells us nothing about the write itself.
      if (res.error) return "unknown";
      return Array.isArray(res.data) && res.data.length > 0 ? "yes" : "no";
    } catch {
      return "unknown";
    }
  },

  /** Log a manual drawer open and wait until it is stored somewhere. */
  commitDrawerEvent: (row: {
    id: string;
    storeId: string | null;
    terminalId: string | null;
    shiftId: string | null;
    staffId: string | null;
    staffName: string | null;
    role: string | null;
    reason: string;
    note: string | null;
    approvedBy: string | null;
    at: string;
  }) =>
    commitOps("Logging drawer open", [
      {
        kind: "insert",
        table: "drawer_events",
        rows: [
          {
            id: row.id,
            store_id: row.storeId,
            terminal_id: row.terminalId,
            shift_id: row.shiftId,
            staff_id: row.staffId,
            staff_name: row.staffName,
            role: row.role,
            reason: row.reason,
            note: row.note,
            approved_by: row.approvedBy,
            created_at: row.at,
          },
        ],
      },
    ]),

  /** Save a staff sign-in and wait until it is stored somewhere. */
  commitShiftSession: (s: ShiftSession) =>
    commitOps("Saving shift sign-in", [
      { kind: "upsert", table: "shift_sessions", rows: [shiftSessionToRow(s)] },
    ]),

  /** Save stock changes and wait until they are stored somewhere. */
  commitProducts: (list: Product[]) =>
    list.length
      ? commitOps("Saving products", [
          { kind: "upsert", table: "products", rows: list.map(productToRow) },
        ])
      : Promise.resolve<CommitTarget>("cloud"),

  /** Save a member and wait until it is stored somewhere. */
  commitMember: (m: Member) =>
    commitOps("Saving member", [
      { kind: "upsert", table: "members", rows: [memberToRow(m, tierId)] },
    ]),

  /** Save one product and wait until it is stored somewhere. */
  commitProduct: (p: Product) =>
    commitOps("Saving product", [
      { kind: "upsert", table: "products", rows: [productToRow(p)] },
    ]),

  /** Save a promotion and wait until it is stored somewhere. */
  commitPromotion: (p: Promotion) =>
    commitOps("Saving promotion", [
      { kind: "upsert", table: "promotions", rows: [promotionToRow(p)] },
    ]),

  /* ------------------------- held tickets ------------------------- */

  /** Park a ticket in the database so it survives a reload or a swapped till. */
  commitHeldOrder: (row: {
    id: string;
    label: string;
    storeId: string | null;
    heldBy: string | null;
    total: number;
    lines: unknown;
    cartDiscount?: number;
    cartDiscountType?: string;
    exchangeRef?: string | null;
    memberId?: string | null;
    memberName?: string | null;
    coupon?: unknown;
    note?: string;
    cancelledFrom?: string | null;
    heldAt: string;
  }) =>
    commitOps("Holding ticket", [
      {
        kind: "upsert",
        table: "held_orders",
        rows: [
          {
            id: row.id,
            label: row.label,
            store_id: row.storeId,
            held_by: row.heldBy,
            total: row.total,
            lines: row.lines,
            cart_discount: row.cartDiscount ?? 0,
            cart_discount_type: row.cartDiscountType ?? "amount",
            exchange_ref: row.exchangeRef ?? null,
            member_id: row.memberId ?? null,
            member_name: row.memberName ?? null,
            coupon: row.coupon ?? null,
            note: row.note ?? "",
            cancelled_from: row.cancelledFrom ?? null,
            held_at: row.heldAt,
          },
        ],
      },
    ]),

  /** Remove a parked ticket once it has been resumed or discarded. */
  removeHeldOrder: (id: string) =>
    queue("Releasing held ticket", { kind: "delete", table: "held_orders", match: { id } }),

  /** Every ticket still parked, newest first. */
  async listHeldOrders() {
    const { data, error } = await supabase
      .from("held_orders")
      .select("*")
      .order("held_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  /* ----------------------- stock adjustments ---------------------- */

  /** Record a stock correction with its reason and cost impact. */
  recordStockAdjustment: (row: {
    id?: string;
    productId: string | null;
    productName: string | null;
    sku: string | null;
    storeId: string | null;
    terminalId?: string | null;
    reason: string;
    note?: string;
    previousStock: number;
    updatedStock: number;
    delta: number;
    costImpact?: number;
    staffId?: string | null;
    staffName?: string | null;
    role?: string | null;
    at?: string;
  }) =>
    queue("Recording stock adjustment", {
      kind: "insert",
      table: "stock_adjustments",
      rows: [
        {
          id: row.id ?? crypto.randomUUID(),
          product_id: row.productId,
          product_name: row.productName,
          sku: row.sku,
          store_id: row.storeId,
          terminal_id: row.terminalId ?? null,
          reason: row.reason,
          note: row.note ?? "",
          previous_stock: Math.round(row.previousStock),
          updated_stock: Math.round(row.updatedStock),
          delta: Math.round(row.delta),
          cost_impact: row.costImpact ?? 0,
          staff_id: row.staffId ?? null,
          staff_name: row.staffName ?? null,
          role: row.role ?? null,
          created_at: row.at ?? new Date().toISOString(),
        },
      ],
    }),

  /* ------------------------ whatsapp outbox ----------------------- */

  /** Park a WhatsApp bill so it is not lost when the branch is offline. */
  queueWhatsAppMessage: (row: {
    id: string;
    phoneNumberId: string;
    to: string;
    body: string;
    reference: string | null;
    storeId?: string | null;
    queuedAt: string;
  }) =>
    queue("Queuing WhatsApp bill", {
      kind: "upsert",
      table: "whatsapp_queue",
      rows: [
        {
          id: row.id,
          phone_number_id: row.phoneNumberId,
          recipient: row.to,
          body: row.body,
          reference: row.reference,
          store_id: row.storeId ?? null,
          status: "QUEUED",
          queued_at: row.queuedAt,
        },
      ],
    }),

  /** Mark a queued WhatsApp bill as sent (or failed). */
  settleWhatsAppMessage: (id: string, ok: boolean, error?: string) =>
    queue("Updating WhatsApp bill", {
      kind: "update",
      table: "whatsapp_queue",
      values: {
        status: ok ? "SENT" : "FAILED",
        error: error ?? null,
        sent_at: ok ? new Date().toISOString() : null,
      },
      match: { id },
    }),
};
