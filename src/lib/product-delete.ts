/**
 * Turns a database refusal into something a shopkeeper can act on.
 *
 * Products that appear on a past bill, purchase order, transfer or stock
 * adjustment cannot be removed — the records that point at them would break.
 * The database says so with a foreign key constraint name; this maps those
 * names to plain language.
 */

export type BlockedDelete = { id: string; name: string; reason: string };

/** Conflict code returned when an item is on a past bill. */
export const PRODUCT_HAS_SALES_HISTORY = "PRODUCT_HAS_SALES_HISTORY";

/** Which records still point at a product, as reported by the database guard. */
export type ProductUsage = {
  sales?: boolean;
  purchases?: boolean;
  transfers?: boolean;
  adjustments?: boolean;
  promotions?: boolean;
};

const USAGE_REASONS: [keyof ProductUsage, string][] = [
  ["sales", "it appears on past sales"],
  ["purchases", "it appears on purchase orders"],
  ["transfers", "it appears on branch transfers"],
  ["adjustments", "it appears in stock adjustments"],
  ["promotions", "a promotion gives it away free"],
];

/**
 * Turns the guard's answer into a refusal, or null when the item is free to go.
 * Sales history is reported with its own code so the screen can offer archiving.
 */
export function usageBlock(usage: ProductUsage): { code: string; reason: string } | null {
  if (usage.sales) return { code: PRODUCT_HAS_SALES_HISTORY, reason: "it appears on past sales" };
  const hit = USAGE_REASONS.find(([k]) => usage[k]);
  return hit ? { code: "PRODUCT_IN_USE", reason: hit[1] } : null;
}

const REASONS: { match: RegExp; reason: string }[] = [
  { match: new RegExp(PRODUCT_HAS_SALES_HISTORY, "i"), reason: "it appears on past sales" },
  { match: /sale_items?_product_id/i, reason: "it appears on past sales" },
  { match: /purchase_order_items?_product_id/i, reason: "it appears on purchase orders" },
  { match: /stock_transfer_items?_product_id/i, reason: "it appears on branch transfers" },
  { match: /stock_adjustments?_product_id/i, reason: "it appears in stock adjustments" },
  { match: /promotions?_foc_product_id/i, reason: "a promotion gives it away free" },
];

/** True when the message is the database protecting linked records. */
export function isLinkedRecordError(message: string): boolean {
  return (
    /foreign key constraint|violates foreign key/i.test(message) ||
    message.includes(PRODUCT_HAS_SALES_HISTORY) ||
    message.includes("PRODUCT_IN_USE")
  );
}

/** True when the refusal is specifically about recorded sales. */
export function isSalesHistoryBlock(message: string): boolean {
  return message.includes(PRODUCT_HAS_SALES_HISTORY) || /sale_items?_product_id/i.test(message);
}

/** Plain-language reason for a failed delete. */
export function describeDeleteBlock(message: string): string {
  if (!isLinkedRecordError(message)) return message;
  const hit = REASONS.find((r) => r.match.test(message));
  return hit ? hit.reason : "other records still point at it";
}