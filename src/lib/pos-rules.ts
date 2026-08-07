/**
 * Database-backed POS operational rules.
 *
 * These are business security rules, so they are never persisted in
 * localStorage or sessionStorage. The browser only ever holds the copy it
 * fetched from the server for the current session, and every privileged
 * action is re-validated server-side before anything is written.
 */

export type PosRules = {
  /* A · shift & cash */
  block_shift_close_on_hold: boolean;
  require_daily_sales_for_shift_close: boolean;
  require_counted_cash_on_close: boolean;
  require_opening_float_count: boolean;
  enable_blind_cash_count: boolean;
  max_drawer_cash_limit: number;
  require_reason_for_payout: boolean;
  allow_multiple_shifts_per_terminal: boolean;
  /* B · discount, pricing & overrides */
  max_cashier_discount_percent: number;
  max_cart_discount_amount: number;
  allow_discount_stacking: boolean;
  require_reason_for_price_override: boolean;
  prevent_below_cost_sale: boolean;
  allow_tax_exemption: boolean;
  /* C · inventory, orders & refunds */
  prevent_negative_stock_sale: boolean;
  require_receipt_for_refund: boolean;
  require_manager_pin_for_refund: boolean;
  max_refund_days_limit: number;
  track_item_voids: boolean;
  /* D · terminal security */
  auto_lock_timeout_seconds: number;
  require_manager_pin_for_cash_drawer_open: boolean;
  enable_manager_pin_audit_log: boolean;
};

export type PosRuleKey = keyof PosRules;

/** Shipped defaults — also the "most restrictive" set used while loading. */
export const DEFAULT_POS_RULES: PosRules = {
  block_shift_close_on_hold: true,
  require_daily_sales_for_shift_close: true,
  require_counted_cash_on_close: true,
  require_opening_float_count: true,
  enable_blind_cash_count: true,
  max_drawer_cash_limit: 1000,
  require_reason_for_payout: true,
  allow_multiple_shifts_per_terminal: false,
  max_cashier_discount_percent: 10,
  max_cart_discount_amount: 100,
  allow_discount_stacking: false,
  require_reason_for_price_override: true,
  prevent_below_cost_sale: true,
  allow_tax_exemption: false,
  prevent_negative_stock_sale: false,
  require_receipt_for_refund: true,
  require_manager_pin_for_refund: true,
  max_refund_days_limit: 30,
  track_item_voids: true,
  auto_lock_timeout_seconds: 90,
  require_manager_pin_for_cash_drawer_open: true,
  enable_manager_pin_audit_log: true,
};

/** Coerce an untrusted payload (API row) into a complete rule set. */
export function normalizeRules(input: unknown): PosRules {
  const row = (input ?? {}) as Record<string, unknown>;
  const out = { ...DEFAULT_POS_RULES };
  (Object.keys(DEFAULT_POS_RULES) as PosRuleKey[]).forEach((key) => {
    const raw = row[key];
    if (raw === undefined || raw === null) return;
    if (typeof DEFAULT_POS_RULES[key] === "boolean") {
      (out as Record<string, unknown>)[key] = raw === true || raw === "true";
    } else {
      const n = Number(raw);
      if (Number.isFinite(n)) (out as Record<string, unknown>)[key] = n;
    }
  });
  return out;
}

export type RuleField = {
  key: PosRuleKey;
  label: string;
  blurb: string;
  kind: "switch" | "number";
};

export type RuleGroup = { id: string; label: string; blurb: string; fields: RuleField[] };

export const RULE_GROUPS: RuleGroup[] = [
  {
    id: "shift",
    label: "Shift & cash management",
    blurb: "How a till is opened, counted and handed back.",
    fields: [
      { key: "block_shift_close_on_hold", kind: "switch", label: "Block shift close on held bills", blurb: "The shift cannot be closed while tickets are parked." },
      { key: "require_daily_sales_for_shift_close", kind: "switch", label: "Require closing cash count", blurb: "Counted cash must be declared before closing." },
      { key: "require_counted_cash_on_close", kind: "switch", label: "Require counted cash before shift close", blurb: "The drawer amount must be typed in — an empty box blocks the close." },
      { key: "require_opening_float_count", kind: "switch", label: "Require opening float count", blurb: "Cashier confirms the starting drawer balance." },
      { key: "enable_blind_cash_count", kind: "switch", label: "Blind cash count", blurb: "Hide the expected drawer total while counting." },
      { key: "max_drawer_cash_limit", kind: "number", label: "Max cash in drawer", blurb: "Prompts for a safe drop above this amount." },
      { key: "require_reason_for_payout", kind: "switch", label: "Reason for pay-in / pay-out", blurb: "Petty cash movements need a reason code." },
      { key: "allow_multiple_shifts_per_terminal", kind: "switch", label: "Allow multiple shifts per terminal", blurb: "Off means one open shift per till." },
    ],
  },
  {
    id: "discount",
    label: "Discounts, pricing & overrides",
    blurb: "What a cashier may change without a manager.",
    fields: [
      { key: "max_cashier_discount_percent", kind: "number", label: "Max cashier discount (%)", blurb: "Above this a manager PIN is required." },
      { key: "max_cart_discount_amount", kind: "number", label: "Max flat bill discount", blurb: "Above this a manager PIN is required." },
      { key: "allow_discount_stacking", kind: "switch", label: "Allow discount stacking", blurb: "Line discounts together with bill coupons." },
      { key: "require_reason_for_price_override", kind: "switch", label: "Reason for price override", blurb: "Manual price changes need a reason code." },
      { key: "prevent_below_cost_sale", kind: "switch", label: "Prevent below-cost sale", blurb: "Selling under unit cost needs a manager." },
      { key: "allow_tax_exemption", kind: "switch", label: "Allow tax exemption", blurb: "Needs a customer tax ID and manager approval." },
    ],
  },
  {
    id: "inventory",
    label: "Inventory, orders & refunds",
    blurb: "Stock guards and the returns policy.",
    fields: [
      { key: "prevent_negative_stock_sale", kind: "switch", label: "Prevent negative stock sale", blurb: "Block adding an out-of-stock item." },
      { key: "require_receipt_for_refund", kind: "switch", label: "Require receipt for refund", blurb: "The original bill must be looked up." },
      { key: "require_manager_pin_for_refund", kind: "switch", label: "Manager PIN for refunds", blurb: "Every refund needs authorisation." },
      { key: "max_refund_days_limit", kind: "number", label: "Refund window (days)", blurb: "Older purchases cannot be refunded." },
      { key: "track_item_voids", kind: "switch", label: "Track item voids", blurb: "Log line removals; manager PIN after 3." },
    ],
  },
  {
    id: "terminal",
    label: "Terminal security & access",
    blurb: "Locking the screen and guarding the drawer.",
    fields: [
      { key: "auto_lock_timeout_seconds", kind: "number", label: "Auto-lock after (seconds)", blurb: "0 disables the idle lock." },
      { key: "require_manager_pin_for_cash_drawer_open", kind: "switch", label: "Manager PIN for no-sale drawer open", blurb: "Manual drawer opens need approval." },
      { key: "enable_manager_pin_audit_log", kind: "switch", label: "Manager override audit log", blurb: "Record who approved what, and when." },
    ],
  },
];

/** Voided lines above this count in one ticket need a manager. */
export const VOID_PIN_THRESHOLD = 3;