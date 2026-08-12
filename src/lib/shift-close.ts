/**
 * Shared maths and visibility rules for the shift-close (Z report) screen.
 *
 * Every close dialog — register header and Shifts page — reads this one
 * module so the closing screen behaves identically wherever it is opened.
 * The opening float always comes from the shift record: it is never typed in
 * again at close time.
 */
import type { PosRules } from "./pos-rules";
import type { Sale, Shift } from "./pos-types";

export type TenderTotal = { method: string; label: string; count: number; value: number };

const TENDERS: { method: string; label: string }[] = [
  { method: "cash", label: "Cash" },
  { method: "card", label: "Card" },
  { method: "wallet", label: "Mobile / wallet" },
  { method: "points", label: "Points / vouchers" },
];

/** Sales that belong to this shift and were not refunded. */
export function shiftSalesOf(shift: Shift | null, sales: Sale[]): Sale[] {
  if (!shift) return [];
  return sales.filter((s) => s.shiftId === shift.id && !s.refunded);
}

export function tenderTotals(shift: Shift | null, sales: Sale[]): TenderTotal[] {
  const mine = shiftSalesOf(shift, sales);
  return TENDERS.map((t) => {
    const rows = mine.filter((s) => s.method === t.method);
    return {
      method: t.method,
      label: t.label,
      count: rows.length,
      value: rows.reduce((a, s) => a + s.total, 0),
    };
  });
}

/** Cash the drawer should hold: opening float plus cash taken this shift. */
export function expectedDrawer(shift: Shift | null, sales: Sale[]): number {
  if (!shift) return 0;
  const cash = shiftSalesOf(shift, sales)
    .filter((s) => s.method === "cash")
    .reduce((a, s) => a + s.total, 0);
  return shift.openingFloat + cash;
}

/** Net cash taken, derived from what the cashier counted. */
export function derivedCashSales(counted: number, openingFloat: number): number {
  return counted - openingFloat;
}

export type CloseScreenView = {
  openingFloat: number;
  showFloat: boolean;
  showExpected: boolean;
  showVariance: boolean;
  showTenders: boolean;
  expected: number;
  tenders: TenderTotal[];
};

/**
 * What the closing screen is allowed to show. A blind cash count always wins
 * over the display toggles — the counter must not see the target figure.
 */
export function closeScreenView(
  rules: PosRules,
  shift: Shift | null,
  sales: Sale[],
): CloseScreenView {
  const blind = rules.enable_blind_cash_count;
  return {
    openingFloat: shift?.openingFloat ?? 0,
    showFloat: rules.show_opening_float_at_close,
    showExpected: rules.show_expected_totals_at_close && !blind,
    showVariance: rules.show_live_variance_at_close && !blind,
    showTenders: rules.show_itemized_tender_breakdown && !blind,
    expected: expectedDrawer(shift, sales),
    tenders: tenderTotals(shift, sales),
  };
}

/** True when the shortage/overage is large enough to need a manager. */
export function varianceNeedsPin(rules: PosRules, variance: number): boolean {
  if (!rules.require_manager_pin_on_variance) return false;
  const limit = Math.abs(Number(rules.variance_pin_threshold) || 0);
  return Math.abs(variance) > limit;
}