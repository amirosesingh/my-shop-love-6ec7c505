/**
 * Cost maths for a racket intake: labour + string + grip + add-ons, with the
 * tax rule from settings applied the same way the till applies it to a sale.
 */
import { r2, type IntakeCategoryMap, type IntakeCharge, type TaxSettings } from "./pos-types";

export type IntakeTotals = {
  charges: IntakeCharge[];
  subtotal: number;
  tax: number;
  total: number;
  balance: number;
};

/** Stamp the configured category mapping on a charge line. */
export function mapCharge(charge: IntakeCharge, map: IntakeCategoryMap | undefined): IntakeCharge {
  const key =
    charge.kind === "labor"
      ? "labor"
      : charge.kind === "string"
        ? "strings"
        : charge.kind === "grip"
          ? "grips"
          : "accessories";
  const mapped = map?.[key];
  return {
    ...charge,
    category: charge.category ?? mapped?.category,
    subCategory: charge.subCategory ?? mapped?.subCategory,
  };
}

export function intakeTotals(
  charges: IntakeCharge[],
  tax: TaxSettings,
  deposit: number,
  map?: IntakeCategoryMap,
): IntakeTotals {
  const priced = charges
    .filter((c) => c.name.trim() || c.price)
    .map((c) => mapCharge({ ...c, price: r2(Math.max(0, Number(c.price) || 0)) }, map));
  const subtotal = r2(priced.reduce((sum, c) => sum + c.price, 0));
  const rate = tax.enabled ? tax.rate / 100 : 0;
  const taxAmount = !rate
    ? 0
    : tax.mode === "inclusive"
      ? r2(subtotal - subtotal / (1 + rate))
      : r2(subtotal * rate);
  const total = tax.enabled && tax.mode === "exclusive" ? r2(subtotal + taxAmount) : subtotal;
  return {
    charges: priced,
    subtotal,
    tax: taxAmount,
    total,
    balance: r2(Math.max(0, total - Math.max(0, deposit))),
  };
}

/** Quick job tag handed out when nobody is attached to the racket yet. */
export function newJobTag(): string {
  return `TAG-${Math.floor(1000 + Math.random() * 9000)}`;
}