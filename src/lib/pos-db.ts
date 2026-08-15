import { toast } from "sonner";
import { supabaseExternal as supabase } from "@/integrations/supabase/external-client";
import { defaultSettings, sampleState } from "./pos-seed";
import { drainOutbox, runOpLive } from "./sync-engine";
import { localDb } from "./local-db";
import { routedQuery } from "./db-query";
import { readSnapshot } from "./offline-snapshot";
import { enqueue, type SyncOp } from "./sync-outbox";
import { isLiveOnly } from "./live-mode";
import {
  AllTargetsFailed,
  isConnectionError,
  noteConnectionLost,
  noteConnectionRestored,
  setCloudDirect,
} from "./db-mode";
import { notifyError, showNotification } from "./notify";
import { logSync } from "./sync-log";
import { canRelay, relayStores } from "./sync-relay";
import { isOperationalTable } from "./pos-auth-route";
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
  group: r.product_group ?? undefined,
  subCategory: r.sub_category ?? undefined,
  unit: r.unit ?? undefined,
  packs: Array.isArray(jsonValue(r.packs, [])) ? jsonValue(r.packs, []) : [],
  barcodes: Array.isArray(jsonValue(r.barcode_aliases, [])) ? jsonValue(r.barcode_aliases, []) : [],
  variants: Array.isArray(jsonValue(r.barcode_variants, []))
    ? (jsonValue(r.barcode_variants, []) as Product["variants"])
    : [],
  price: num(r.selling_price),
  cost: num(r.cost_price),
  ecomPrice: r.ecom_price == null ? undefined : num(r.ecom_price),
  ecomVisible: r.ecom_visible ?? true,
  archived: r.is_archived === true,
  stockByStore: jsonValue<Record<string, number>>(r.stock_by_store, {}),
  reorderLevel: num(r.reorder_level),
  taxRate: num(r.tax_rate),
  customPoints: r.custom_points == null ? undefined : num(r.custom_points),
});

function jsonValue<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return (value ?? fallback) as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/** Strict numeric coercion: "" / null / NaN / Infinity never reach the database. */
export const safeNum = (value: unknown, fallback = 0): number => {
  if (value === "" || value == null || typeof value === "boolean") return fallback;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
};

/** Integer columns must never receive a decimal. */
const safeInt = (value: unknown, fallback = 0): number => Math.round(safeNum(value, fallback));

/** Optional numeric columns keep NULL rather than collapsing to zero. */
const safeNumOrNull = (value: unknown): number | null => {
  if (value === "" || value == null) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
};

const safeArray = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

const safeStockMap = (value: unknown): Record<string, number> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, number> = {};
  for (const [key, qty] of Object.entries(value as Record<string, unknown>)) {
    if (!key) continue;
    out[key] = safeInt(qty);
  }
  return out;
};

export const productToRow = (p: Product): Row => {
  const stock =
    p.stockByStore && typeof p.stockByStore === "object" && !Array.isArray(p.stockByStore)
      ? safeStockMap(p.stockByStore)
      : null;
  return {
  id: p.id,
  barcode: p.barcode || p.sku || p.id,
  name: p.name,
  sku: p.sku ?? null,
  category: p.category ?? null,
  product_group: p.group ?? null,
  sub_category: p.subCategory ?? null,
  unit: p.unit ?? null,
  packs: safeArray(p.packs),
  barcode_aliases: safeArray<string>(p.barcodes)
    .map((b) => String(b ?? "").trim())
    .filter(Boolean),
  barcode_variants: safeArray<{ code?: string; label?: string }>(p.variants)
    .map((v) => ({ code: String(v?.code ?? "").trim(), label: v?.label?.trim() || undefined }))
    .filter((v) => v.code),
  cost_price: safeNum(p.cost),
  selling_price: safeNum(p.price),
  ecom_price: safeNumOrNull(p.ecomPrice),
  ecom_visible: p.ecomVisible ?? true,
  is_archived: p.archived === true,
  archived_at: p.archived ? new Date().toISOString() : null,
  // Stock is only ever written when the caller actually carries the per-branch
  // map. A product saved without it (a price or name edit, a partial import)
  // must never zero the quantity that is already banked in the database.
  ...(stock
    ? {
        stock_quantity: safeInt(Object.values(stock).reduce((a, b) => a + b, 0)),
        stock_by_store: stock,
      }
    : {}),
  reorder_level: safeInt(p.reorderLevel),
  tax_rate: safeNum(p.taxRate),
  custom_points: safeNumOrNull(p.customPoints),
  };
};

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
const SALE_COLUMNS_BASE =
  "id, bill_number, store_id, shift_id, cashier_name, member_id, subtotal_amount, " +
  "discount_amount, tax_amount, total_amount, paid_amount, change_amount, payment_type, " +
  "payments, points_earned, is_refunded, original_bill_number, exchanged_to_bill_number, " +
  "exchange_credit, coupon_code, coupon_promo_id, coupon_scope, coupon_discount, created_at, " +
  "sale_items(product_id, product_name, unit_price, quantity, tax_rate, discount_percent, " +
  "discount_amount, is_return, is_foc, promo_id, coupon_code, coupon_discount, unit_cost)";

/**
 * Older databases have not had the checkout-attempt column added yet. Asking
 * for it there fails the whole read, so the first refusal switches every later
 * query to the columns that definitely exist.
 */
let hasClientTxnColumn = true;

const saleColumns = () =>
  hasClientTxnColumn ? `${SALE_COLUMNS_BASE}, client_transaction_id` : SALE_COLUMNS_BASE;

/** True when a failure is "that column is not in this database (yet)". */
export const isMissingTxnColumn = (message: string | undefined | null) =>
  !!message && /client_transaction_id/.test(message) && /does not exist|schema cache/i.test(message);

const forgetTxnColumn = () => {
  hasClientTxnColumn = false;
};

const rowToSale = (r: Row): Sale => ({
  id: r.id,
  receiptNo: r.bill_number,
  clientTxnId: r.client_transaction_id ?? undefined,
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
  client_transaction_id: s.clientTxnId ?? null,
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

/**
 * One ledger row per tender on the bill, so partial settlements across sales
 * and bookings can be read from a single place.
 */
const salePaymentRows = (s: Sale) => {
  const tenders =
    s.payments && s.payments.length
      ? s.payments.map((p) => ({ method: String(p.method), amount: Number(p.amount) || 0 }))
      : [{ method: String(s.method), amount: s.paid }];
  return tenders
    .filter((t) => t.amount !== 0)
    .map((t) => ({
      id: crypto.randomUUID(),
      source_type: "sale",
      sale_id: s.id,
      member_id: s.memberId,
      store_id: s.storeId,
      shift_id: s.shiftId,
      amount: t.amount,
      method: t.method,
      kind: s.refunded ? "refund" : "payment",
      reference: s.receiptNo,
      cashier_name: s.cashier,
      note: "",
      paid_at: s.createdAt,
    }));
};

/** One inventory-movement row per sold line, for the unified item history. */
const saleActivityRows = (s: Sale) =>
  s.lines
    .filter((l) => l.productId)
    .map((l) => ({
      id: crypto.randomUUID(),
      product_id: l.productId,
      product_name: l.name,
      store_id: s.storeId,
      activity_type: l.credit ? "return" : "sale",
      reference: s.receiptNo,
      quantity_delta: -Math.round(l.qty),
      unit_cost: l.cost ?? 0,
      staff_name: s.cashier,
      note: "",
      created_at: s.createdAt,
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
  await commitOps("Loading sample catalogue", [
    { kind: "insert", table: "products", rows: products as Row[] },
  ]);

  const members = sampleState.members.map((m) =>
    memberToRow({ ...m, id: crypto.randomUUID() }, tierId),
  );
  await commitOps("Loading sample members", [
    { kind: "insert", table: "members", rows: members as Row[] },
  ]);

  const promotions = sampleState.promotions.map((p) =>
    promotionToRow({
      ...p,
      id: crypto.randomUUID(),
      focProductId: p.focProductId ? idMap.get(p.focProductId) : undefined,
    }),
  );
  await commitOps("Loading sample promotions", [
    { kind: "insert", table: "promotions", rows: promotions as Row[] },
  ]);
}

/** Load every cloud-backed slice of the POS state. */
export async function loadCloudState(): Promise<CloudSlice> {
  const { hydrateTerminalConfig } = await import("./terminal-tokens");
  await hydrateTerminalConfig();
  const tiers = await supabase.from("membership_tiers").select("id, name");
  if (tiers.error) return loadLocalState(tiers.error);
  tierIdByName = {};
  tierNameById = {};
  for (const t of tiers.data ?? []) {
    tierIdByName[t.name] = t.id;
    tierNameById[t.id] = t.name as MemberTier;
  }

  const [products, members, sales, promotions, settings, stores, shifts] = await Promise.all([
    supabase.from("products").select("*").order("name"),
    supabase.from("members").select("*").order("created_at"),
    (async () => {
      const read = () =>
        supabase
          .from("sales")
          .select(saleColumns())
          .order("created_at", { ascending: false })
          .limit(500);
      const first = await read();
      if (first.error && isMissingTxnColumn(first.error.message)) {
        forgetTxnColumn();
        return await read();
      }
      return first;
    })(),
    supabase.from("promotions").select("*").order("created_at"),
    supabase.from("pos_settings").select("*").eq("id", 1).maybeSingle(),
    // The stores table only exists once schema10.sql has been applied; a
    // missing table must not stop the till from loading. Supabase query
    // builders are thenables, not Promises, so guard with try/catch.
    (async (): Promise<{ data: Row[] | null }> => {
      try {
        const { loadCashierToken } = await import("./pos-credentials");
        const cashierToken = await loadCashierToken();
        // A PIN-only cashier has no database auth session, so use the proven
        // relay immediately instead of accepting an RLS-filtered empty list.
        if (cashierToken && canRelay()) {
          const relayed = await relayStores();
          if (relayed.ok) return { data: (relayed.rows as Row[] | undefined) ?? [] };
        }
        const direct = await supabase.from("stores").select("*").order("name");
        if (!direct.error) return { data: (direct.data as Row[] | null) ?? [] };
        // Registered terminals and staff sessions can still recover through
        // the server relay when a direct RLS read is unavailable.
        if (canRelay()) {
          const relayed = await relayStores();
          if (relayed.ok) return { data: (relayed.rows as Row[] | undefined) ?? [] };
        }
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
  if (err) return loadLocalState(err);

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

async function loadLocalState(cause: unknown): Promise<CloudSlice> {
  const bridge = localDb();
  if (!bridge) {
    // No local SQL engine on this device: the last good copy this terminal
    // kept on disk is still better than an empty register.
    const snap = readSnapshot();
    if (!snap) throw cause;
    const { savedAt: _savedAt, ...slice } = snap;
    return slice as CloudSlice;
  }
  const result = await bridge.snapshot();
  if (!result.ok) throw cause;
  tierIdByName = {};
  tierNameById = {};
  for (const tier of result.tiers ?? []) {
    const name = String(tier.name ?? "Member") as MemberTier;
    tierIdByName[name] = String(tier.id);
    tierNameById[String(tier.id)] = name;
  }
  return {
    products: (result.products ?? []).map(rowToProduct),
    members: (result.members ?? []).map((row) => rowToMember(row, tierName)),
    sales: [],
    promotions: (result.promotions ?? []).map(rowToPromotion),
    settings: rowToSettings((result.settings as Row | null) ?? null),
    stores: (result.stores ?? []).map(rowToStore),
    shifts: (result.shifts ?? []).map(rowToShift),
  };
}

/* ------------------------------- writers ------------------------------- */

/**
 * The one authoritative "is the till open?" question.
 *
 * Strictly status-driven: a shift opened on any past date stays active until
 * something explicitly closes it. No date or time filtering here, ever.
 */
/**
 * The open shift according to this terminal's own copy. `undefined` means the
 * terminal has no copy to answer with, which is different from "no shift".
 */
function localOpenShift(storeId: string): Shift | null | undefined {
  const snap = readSnapshot();
  if (!snap) return undefined;
  const open = (snap.shifts ?? []).filter((s) => s.storeId === storeId && s.status === "OPEN");
  if (!open.length) return null;
  return [...open].sort((a, b) => (a.openedAt < b.openedAt ? 1 : -1))[0];
}

export async function loadActiveShift(storeId: string): Promise<Shift | null> {
  // A cashier signed in with a PIN has no account on the central database, so
  // the direct read is refused or filtered out. The proven server relay answers
  // for those tills — without it the register would flip back to "locked"
  // moments after a shift was opened.
  const { hasStaffSession, canRelay, relayActiveShift } = await import("./sync-relay");

  if (hasStaffSession()) {
    // The server routine answers for every staff account, whatever branch is
    // written on their profile, and hands back the whole row in one call.
    const rpc = await supabase.rpc("shift_active_for_branch" as never, {
      p_store_id: storeId,
    } as never);
    if (!rpc.error) {
      const row = (Array.isArray(rpc.data) ? rpc.data[0] : rpc.data) as Row | null;
      return row?.id ? rowToShift(row) : null;
    }
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

  if (!canRelay()) {
    const local = localOpenShift(storeId);
    if (local !== undefined) return local;
    throw new Error("This till cannot read the central database yet");
  }
  const relayed = await relayActiveShift(storeId);
  if (!relayed.ok) {
    const local = localOpenShift(storeId);
    if (local !== undefined) return local;
    throw new Error(relayed.error ?? "Could not read the open shift");
  }
  return relayed.row ? rowToShift(relayed.row as Row) : null;
}

/**
 * Open a shift through the server routine, which stores the row and hands the
 * stored record straight back — no second, rule-checked read to unlock the
 * till. Returns `null` when the central database cannot be reached, so the
 * caller falls back to the usual local/offline commit path.
 */
export async function openShiftOnServer(s: Shift): Promise<Shift | null> {
  const { hasStaffSession } = await import("./sync-relay");
  if (!hasStaffSession()) return null;
  try {
    const res = await supabase.rpc("shift_open" as never, {
      p_id: s.id,
      p_store_id: s.storeId,
      p_opened_by_name: s.cashier,
      p_opening_float: s.openingFloat,
      p_terminal_id: s.terminalId ?? null,
      p_terminal_name: s.terminalName ?? null,
      p_opened_by_staff_id: s.openedByStaffId ?? null,
      p_opened_by_role: s.openedByRole ?? null,
      p_user_id: s.userId ?? null,
    } as never);
    if (res.error) return null;
    const row = (Array.isArray(res.data) ? res.data[0] : res.data) as Row | null;
    return row?.id ? rowToShift(row) : null;
  } catch {
    return null;
  }
}

/**
 * One page of older bills for a branch, newest first.
 *
 * Keyset paging on `(created_at, id)`: the register keeps the most recent 500
 * bills in memory, and history screens walk further back a page at a time
 * without ever paying for an OFFSET.
 */
/** The same page of bills served from this terminal's copy. */
function localSalesPage(storeId: string, cursor: Cursor, limit: number): Page<Sale> | null {
  const snap = readSnapshot();
  if (!snap) return null;
  const all = (snap.sales ?? [])
    .filter((s) => !storeId || s.storeId === storeId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  const after = cursor ? all.filter((s) => s.createdAt < (cursor as { createdAt: string }).createdAt) : all;
  const rows = after.slice(0, limit);
  return {
    rows,
    cursor: rows.length ? ({ createdAt: rows[rows.length - 1].createdAt, id: rows[rows.length - 1].id } as unknown as Cursor) : null,
    hasMore: after.length > limit,
  };
}

export async function loadSalesPage(
  storeId: string,
  cursor: Cursor = null,
  limit = PAGE_SIZE,
): Promise<Page<Sale>> {
  const query = () => {
    let q = supabase.from("sales").select(saleColumns());
    if (storeId) q = q.eq("store_id", storeId) as typeof q;
    return keyset(q as never, "created_at", cursor, limit);
  };
  let res = await query();
  let err = (res as { error?: { message: string } }).error;
  if (err && isMissingTxnColumn(err.message)) {
    forgetTxnColumn();
    res = await query();
    err = (res as { error?: { message: string } }).error;
  }
  if (err) {
    const cached = localSalesPage(storeId, cursor, limit);
    if (cached && isConnectionError(new Error(err.message))) return cached;
    throw new Error(err.message);
  }
  const rows = ((res as { data?: Row[] | null }).data ?? []) as Row[];
  return {
    rows: rows.map(rowToSale),
    cursor: nextCursor(rows, "created_at", limit),
    hasMore: rows.length >= limit,
  };
}

/** Recent sign-in sessions for a branch, newest first. */
export async function loadShiftSessions(storeId: string, limit = 200): Promise<ShiftSession[]> {
  const rows = await routedQuery("shift_sessions", {
    match: { store_id: storeId },
    orderBy: { column: "signed_in_at", ascending: false },
    limit,
  });
  return rows.map(rowToShiftSession);
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
  allStores = false,
): Promise<ReceivingInvoice[]> {
  let q = supabase
    .from("purchase_orders" as never)
    .select("*, purchase_order_items(*)")
    .order("invoice_entry_date", { ascending: false })
    .limit(limit);
  if (storeId && !allStores) {
    // PostgREST needs the literal quoted; branch ids are free text and may hold
    // a comma, dot or space that would otherwise break the filter (400).
    const quoted = `"${storeId.replace(/"/g, '\\"')}"`;
    q = q.or(`store_id.eq.${quoted},store_id.is.null`) as typeof q;
  }
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
  try {
    const res = await supabase.from("products").select("*").in("id", ids);
    if (res.error) throw new Error(res.error.message);
    return ((res.data as Row[] | null) ?? []).map(rowToProduct);
  } catch (e) {
    // Offline with a terminal copy on disk: those rows are already in the
    // shape the app uses, so they are handed back as they are.
    const snap = readSnapshot();
    if (snap && isConnectionError(e)) return snap.products.filter((p) => ids.includes(p.id));
    throw e;
  }
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
  // Operational business data is never parked in browser storage: it goes to
  // the central database (directly or through the relay) or it fails loudly.
  if (isOperationalTable(op.table)) {
    void runOpLive(context, op).catch((e) => dbError(context, e));
    return;
  }
  enqueue(context, op);
  void drainOutbox();
};

/* ---------------------------- durable commits --------------------------- */

/** Where a committed change actually landed. */
export type CommitTarget = "cloud" | "local" | "outbox";

/**
 * Copy rows that are already safe centrally onto this terminal, in the
 * background. A failure here is only written to the sync log: the sale is
 * finished and the operator must never be interrupted for it.
 */
export async function mirrorToLocal(context: string, ops: SyncOp[]) {
  const bridge = localDb();
  if (!bridge) return;
  for (const op of ops) {
    try {
      const res = await bridge.write(context, op);
      if (!res.ok) logSync("push", op.table, false, res.error ?? `${context}: local copy failed`);
    } catch (e) {
      logSync("push", op.table, false, `${context}: ${(e as Error)?.message ?? String(e)}`);
    }
  }
}

/** One relative stock change, keyed on the movement row that caused it. */
type StockDelta = { movementId: string; productId: string; storeId: string | null; delta: number };

/**
 * Split absolute stock out of a batch. When the batch carries stock movement
 * rows, the products upsert loses its stock columns and the movements become
 * relative deltas for the central database to apply.
 */
function withRelativeStock(ops: SyncOp[]): { ops: SyncOp[]; deltas: StockDelta[] } {
  const movements = ops.flatMap((op) =>
    op.kind === "insert" && op.table === "item_activity_logs" ? (op.rows as Row[]) : [],
  );
  if (!movements.length) return { ops, deltas: [] };

  const deltas: StockDelta[] = movements
    .filter((m) => m["product_id"] && Number(m["quantity_delta"] ?? 0) !== 0)
    .map((m) => ({
      movementId: String(m["id"]),
      productId: String(m["product_id"]),
      storeId: (m["store_id"] as string | null) ?? null,
      delta: Number(m["quantity_delta"] ?? 0),
    }));
  if (!deltas.length) return { ops, deltas: [] };

  const next = ops.map((op) => {
    if (op.table !== "products" || (op.kind !== "upsert" && op.kind !== "insert")) return op;
    const rows = (op.rows as Row[]).map((row) => {
      const { stock_quantity: _q, stock_by_store: _s, ...rest } = row;
      return rest as Row;
    });
    return { ...op, rows };
  });
  return { ops: next, deltas };
}

/**
 * Ask the central database to apply each movement once. Failures are logged,
 * not thrown: the movement row is already stored, so the figure can be
 * reconciled without failing a completed sale.
 */
async function applyStockDeltas(deltas: StockDelta[]) {
  for (const d of deltas) {
    try {
      const { error } = await (
        supabase as unknown as {
          rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
        }
      ).rpc("stock_apply_delta", {
        _movement_id: d.movementId,
        _product_id: d.productId,
        _store_id: d.storeId,
        _delta: d.delta,
      });
      if (error) logSync("push", "products", false, `Stock delta: ${error.message}`);
    } catch (e) {
      logSync("push", "products", false, `Stock delta: ${(e as Error)?.message ?? String(e)}`);
    }
  }
}

/**
 * Store a group of writes and only resolve once they are safe somewhere:
 * the cloud database, the local desktop database, or the on-disk outbox.
 *
 * Callers await this before printing, clearing the cart or starting the next
 * action — nothing moves on while the data is still only in memory.
 */
export async function commitOps(context: string, ops: SyncOp[]): Promise<CommitTarget> {
  if (!ops.length) return noteCommitTarget("cloud");
  // A packaged or browser till may carry an encrypted tenant override. Never
  // let an early write resolve the client against the build-time tenant first.
  const { hydrateTerminalConfig } = await import("./terminal-tokens");
  await hydrateTerminalConfig();

  // Stock never travels centrally as an absolute figure: the movement rows go
  // up and the central database applies each one as a relative change, keyed
  // on the movement id so a retry can never deduct twice. The terminal copy
  // still receives the full row, so the till shows the new count at once.
  const { ops: cloudOps, deltas } = withRelativeStock(ops);

  // Android / live-only: the backend is the single source of truth.
  if (isLiveOnly()) {
    try {
      for (const op of cloudOps) await runOpLive(context, op);
      await applyStockDeltas(deltas);
    } catch (e) {
      if (isConnectionError(e)) throw new AllTargetsFailed(context, e);
      throw e;
    }
    return noteCommitTarget("cloud");
  }

  // Windows desktop with a local SQL Server present.
  const bridge = localDb();
  if (bridge) {
    // Desktop is always cloud first. Local SQL is a durable fallback only for
    // connection-class cloud failures; validation and permission errors remain visible.
    try {
      for (const op of cloudOps) await runOpLive(context, op);
      await applyStockDeltas(deltas);
      noteConnectionRestored();
      setCloudDirect(false);
      void mirrorToLocal(context, ops);
      return noteCommitTarget("cloud");
    } catch (cloud) {
      if (!isConnectionError(cloud)) throw cloud;
      noteConnectionLost();
      try {
        for (const op of ops) {
          const res = await bridge.write(context, op);
          if (!res.ok) throw new Error(res.error ?? `${context} could not be stored locally`);
        }
        setCloudDirect(false);
        if (bridge.push) void bridge.push();
        return noteCommitTarget("local");
      } catch (local) {
        throw new AllTargetsFailed(context, local);
      }
    }
  }

  // Browser build: there is no local SQL engine on this device, so every
  // write goes to the central database or the action stops. Nothing about the
  // business is parked in browser storage.
  const operational = ops.every((op) => isOperationalTable(op.table));
  {
    try {
      for (const op of cloudOps) await runOpLive(context, op);
      await applyStockDeltas(deltas);
      noteConnectionRestored();
      setCloudDirect(operational);
      return noteCommitTarget("cloud");
    } catch (cloud) {
      if (!isConnectionError(cloud)) throw cloud;
      noteConnectionLost();
      throw new AllTargetsFailed(context, cloud);
    }
  }
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
    const op2: SyncOp = op;
    let res: { error: { message: string } | null };
    try {
      res = await supabase.from("pos_settings").upsert(settingsToRow(s) as never);
    } catch (e) {
      // The line is down: park the change so it lands when it is back.
      if (!isConnectionError(e)) throw e;
      await commitOps("Saving settings", [op2]);
      return;
    }
    if (!res.error) return;
    if (isConnectionError(new Error(res.error.message))) {
      await commitOps("Saving settings", [op2]);
      return;
    }
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
    void db.commitSale(sale, products, member).catch((error) => dbError("Saving sale", error));
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
    // A retried checkout (double click, network drop) must never bill twice:
    // if this attempt already reached the central database, stop here.
    if (sale.clientTxnId && (await db.saleAttemptExists(sale.clientTxnId)) === "yes")
      return "cloud";
    const ops: SyncOp[] = [
      { kind: "insert", table: "sales", rows: [saleToRow(sale)] },
      { kind: "insert", table: "sale_items", rows: saleItemRows(sale) },
    ];
    const tenders = salePaymentRows(sale);
    if (tenders.length)
      ops.push({ kind: "insert", table: "payment_transactions", rows: tenders });
    const movements = saleActivityRows(sale);
    if (movements.length)
      ops.push({ kind: "insert", table: "item_activity_logs", rows: movements });
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

  /**
   * Has this checkout attempt already been stored centrally? "unknown" when
   * the read itself failed — the caller then saves as usual, and the unique
   * index on the attempt id is the final guard against a duplicate.
   */
  async saleAttemptExists(clientTxnId: string): Promise<"yes" | "no" | "unknown"> {
    try {
      const res = await supabase
        .from("sales" as never)
        .select("id")
        .eq("client_transaction_id", clientTxnId)
        .limit(1);
      if (res.error) return "unknown";
      return Array.isArray(res.data) && res.data.length > 0 ? "yes" : "no";
    } catch {
      return "unknown";
    }
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
    billNo?: string | null;
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
            bill_no: row.billNo ?? null,
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
