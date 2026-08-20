/**
 * Dynamic receipt fields.
 *
 * The receipt designer never runs arbitrary queries: it can only insert one of
 * the tokens listed here, and each token is resolved from data the till already
 * holds for the slip being printed. An unknown or unavailable token prints as
 * nothing rather than leaking `{{...}}` onto a customer's receipt.
 */

export type ReceiptFieldToken =
  | "receipt_number"
  | "date"
  | "time"
  | "cashier"
  | "terminal_name"
  | "device_name"
  | "branch_name"
  | "branch_code"
  | "customer_name"
  | "customer_code"
  | "item_count"
  | "subtotal"
  | "discount"
  | "tax"
  | "total"
  | "payment_method"
  | "received"
  | "change"
  | "deposit"
  | "balance"
  | "booking_ref"
  | "collection_date";

export type ReceiptField = {
  token: ReceiptFieldToken;
  label: string;
  group: "Slip" | "People & place" | "Money" | "Booking";
};

/** Everything the designer offers, in the order it is shown. */
export const RECEIPT_FIELDS: ReceiptField[] = [
  { token: "receipt_number", label: "Receipt number", group: "Slip" },
  { token: "date", label: "Date", group: "Slip" },
  { token: "time", label: "Time", group: "Slip" },
  { token: "item_count", label: "Item count", group: "Slip" },
  { token: "cashier", label: "Cashier", group: "People & place" },
  { token: "terminal_name", label: "Terminal name", group: "People & place" },
  { token: "device_name", label: "Device name", group: "People & place" },
  { token: "branch_name", label: "Branch name", group: "People & place" },
  { token: "branch_code", label: "Branch code", group: "People & place" },
  { token: "customer_name", label: "Customer name", group: "People & place" },
  { token: "customer_code", label: "Member code", group: "People & place" },
  { token: "subtotal", label: "Subtotal", group: "Money" },
  { token: "discount", label: "Discount", group: "Money" },
  { token: "tax", label: "Tax", group: "Money" },
  { token: "total", label: "Total", group: "Money" },
  { token: "payment_method", label: "Payment method", group: "Money" },
  { token: "received", label: "Amount received", group: "Money" },
  { token: "change", label: "Change", group: "Money" },
  { token: "booking_ref", label: "Booking reference", group: "Booking" },
  { token: "deposit", label: "Deposit paid", group: "Booking" },
  { token: "balance", label: "Balance due", group: "Booking" },
  { token: "collection_date", label: "Collection date", group: "Booking" },
];

const TOKENS = new Set<string>(RECEIPT_FIELDS.map((f) => f.token));

export type ReceiptTokenContext = Partial<Record<ReceiptFieldToken, string>>;

/** Insert text form of a field, e.g. `{{total}}`. */
export const fieldTag = (token: ReceiptFieldToken) => `{{${token}}}`;

/**
 * Replace approved tokens with their value. Anything that is not on the list —
 * or has no value for this slip — collapses to an empty string so a template
 * can never print a placeholder or expose an unexpected value.
 */
export function renderReceiptText(text: string, ctx: ReceiptTokenContext): string {
  if (!text) return "";
  return text.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_m, raw: string) => {
    const key = raw.toLowerCase();
    if (!TOKENS.has(key)) return "";
    return ctx[key as ReceiptFieldToken] ?? "";
  });
}

/** True when a template line still references a field with no value today. */
export const usesField = (text: string, token: ReceiptFieldToken) =>
  new RegExp(`\\{\\{\\s*${token}\\s*\\}\\}`, "i").test(text ?? "");

/** Representative values used by the designer's preview only. */
export const SAMPLE_RECEIPT_CONTEXT: ReceiptTokenContext = {
  receipt_number: "INV-000148",
  date: "12 Mar 2026",
  time: "14:32",
  cashier: "Amira Yusof",
  terminal_name: "Counter 1",
  device_name: "Main Counter POS 01",
  branch_name: "Riverside Store",
  branch_code: "RVS",
  customer_name: "Sample Customer",
  customer_code: "M-1042",
  item_count: "3",
  subtotal: "28.75",
  discount: "0.00",
  tax: "1.44",
  total: "30.19",
  payment_method: "Cash",
  received: "50.00",
  change: "19.81",
  deposit: "10.00",
  balance: "20.19",
  booking_ref: "BK-0031",
  collection_date: "15 Mar 2026",
};
