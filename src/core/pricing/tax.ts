import { r2, type TaxSettings } from "@/core/types/pos-types";

export type TaxResult = { tax: number; total: number };

/**
 * The one place tax is derived from a taxable amount.
 *
 * Inclusive prices already carry the tax, so it is pulled back out for
 * reporting and the total stays the taxable amount. Exclusive prices add it
 * on top. Every screen that shows subtotal → tax → total (the cart, booking
 * intake, the receipt preview) goes through here so the three can never round
 * differently.
 */
export function computeTax(net: number, tax: TaxSettings | undefined): TaxResult {
  const base = r2(net);
  const rate = tax?.enabled ? (tax.rate || 0) / 100 : 0;
  if (!tax?.enabled || !rate) return { tax: 0, total: base };
  if (tax.mode === "inclusive") {
    return { tax: r2(base - base / (1 + rate)), total: base };
  }
  const amount = r2(base * rate);
  return { tax: amount, total: r2(base + amount) };
}
