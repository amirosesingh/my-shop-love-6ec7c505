/**
 * Cost maths for a racket intake: labour + string + grip + add-ons, with the
 * tax rule from settings applied the same way the till applies it to a sale.
 */
import {
  r2,
  type BookingRules,
  type IntakeCategoryMap,
  type IntakeCharge,
  type TaxSettings,
} from "./pos-types";
import { computeTax } from "@/core/pricing/tax";

export type ComboOutcome = {
  /** charges with the combo applied to the labour line */
  charges: IntakeCharge[];
  /** currency taken off the labour line (0 when no combo applied) */
  saved: number;
  /** human line shown under the charge summary, empty when nothing applied */
  label: string;
};

/**
 * Racket + string bought from stock on the same job earns the configured
 * combo: labour waived, a percentage off, or a flat amount off.
 */
export function applyCombo(charges: IntakeCharge[], rules: BookingRules): ComboOutcome {
  const none: ComboOutcome = { charges, saved: 0, label: "" };
  if (rules.comboRule === "off") return none;
  const fromStock = (kind: IntakeCharge["kind"]) =>
    charges.some((c) => c.kind === kind && !c.customerProvided && c.price > 0);
  if (!fromStock("string")) return none;
  const hasRacket = charges.some(
    (c) => c.kind === "accessory" && !c.customerProvided && /racket/i.test(c.name) && c.price > 0,
  );
  if (!hasRacket) return none;
  const labourIndex = charges.findIndex((c) => c.kind === "labor");
  if (labourIndex < 0) return none;
  const labour = charges[labourIndex]!;
  const cut =
    rules.comboRule === "waive_labour"
      ? labour.price
      : rules.comboRule === "percent"
        ? r2((labour.price * Math.max(0, rules.comboValue)) / 100)
        : r2(Math.max(0, rules.comboValue));
  const saved = r2(Math.min(labour.price, Math.max(0, cut)));
  if (saved <= 0) return none;
  const next = charges.map((c, i) => (i === labourIndex ? { ...c, price: r2(c.price - saved) } : c));
  return {
    charges: next,
    saved,
    label:
      rules.comboRule === "waive_labour"
        ? "Racket + string combo — labour waived"
        : `Racket + string combo — ${saved.toFixed(2)} off labour`,
  };
}

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
  const { tax: taxAmount, total } = computeTax(subtotal, tax);
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