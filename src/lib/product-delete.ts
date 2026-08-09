/**
 * Turns a database refusal into something a shopkeeper can act on.
 *
 * Products that appear on a past bill, purchase order, transfer or stock
 * adjustment cannot be removed — the records that point at them would break.
 * The database says so with a foreign key constraint name; this maps those
 * names to plain language.
 */

export type BlockedDelete = { id: string; name: string; reason: string };

const REASONS: { match: RegExp; reason: string }[] = [
  { match: /sale_items?_product_id/i, reason: "it appears on past sales" },
  { match: /purchase_order_items?_product_id/i, reason: "it appears on purchase orders" },
  { match: /stock_transfer_items?_product_id/i, reason: "it appears on branch transfers" },
  { match: /stock_adjustments?_product_id/i, reason: "it appears in stock adjustments" },
  { match: /promotions?_foc_product_id/i, reason: "a promotion gives it away free" },
];

/** True when the message is the database protecting linked records. */
export function isLinkedRecordError(message: string): boolean {
  return /foreign key constraint|violates foreign key/i.test(message);
}

/** Plain-language reason for a failed delete. */
export function describeDeleteBlock(message: string): string {
  if (!isLinkedRecordError(message)) return message;
  const hit = REASONS.find((r) => r.match.test(message));
  return hit ? hit.reason : "other records still point at it";
}