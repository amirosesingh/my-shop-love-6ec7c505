/**
 * Cashier risk actions — voids, price overrides and no-sale drawer opens.
 *
 * These three are the classic shrinkage routes, so each one is written twice:
 * to the terminal's local trail (so it still records with no connection) and
 * to the immutable cloud edit history (so it cannot be tidied away later).
 */
import { logger } from "./audit-log";
import { logSystemAction } from "./system-audit";

export type CashierActionType = "item_void" | "price_override" | "no_sale";

export const CASHIER_ACTION_LABELS: Record<CashierActionType, string> = {
  item_void: "Item void",
  price_override: "Price override",
  no_sale: "No-sale drawer open",
};

export type CashierAuditEvent = {
  actionType: CashierActionType;
  /** Item the action was taken on, when there is one. */
  item?: {
    productId?: string | null;
    name?: string | null;
    sku?: string | null;
    qty?: number | null;
  };
  /** Money impact: value voided, or the amount taken off the price. */
  value?: number;
  /** Price before / after, for overrides. */
  from?: number | null;
  to?: number | null;
  storeId?: string | null;
  terminalId?: string | null;
  reason?: string | null;
  /** Manager who authorised the action, when one was needed. */
  approvedBy?: string | null;
};

/** A short line a manager can read at a glance in the trail. */
function describe(e: CashierAuditEvent): string {
  const item = e.item?.name ?? "item";
  if (e.actionType === "item_void") return `Voided ${item}`;
  if (e.actionType === "price_override") return `Price override on ${item}`;
  return "No-sale drawer open";
}

/**
 * Record one cashier risk action. Fire-and-forget: logging must never delay
 * the person at the till.
 */
export function logCashierAction(event: CashierAuditEvent): void {
  const detail = {
    cashierAction: event.actionType,
    actionLabel: CASHIER_ACTION_LABELS[event.actionType],
    productId: event.item?.productId ?? null,
    item: event.item?.name ?? null,
    sku: event.item?.sku ?? null,
    qty: event.item?.qty ?? null,
    value: Number(event.value ?? 0),
    from: event.from ?? null,
    to: event.to ?? null,
    reason: event.reason ?? null,
    approvedBy: event.approvedBy ?? null,
  };
  logger.log(
    event.actionType === "no_sale" ? "drawer" : event.actionType === "item_void" ? "refund" : "discount",
    describe(event),
    "register",
    detail,
  );
  logSystemAction({
    actionType: `CASHIER_${event.actionType.toUpperCase()}`,
    entityAffected: "register",
    entityId: event.item?.productId ?? null,
    newValue: detail,
    storeId: event.storeId ?? null,
    terminalId: event.terminalId ?? null,
    note: describe(event),
  });
}

/** True when a stored trail entry is one of the cashier risk actions. */
export function cashierActionOf(details: Record<string, unknown>): CashierActionType | null {
  const raw = details["cashierAction"];
  return raw === "item_void" || raw === "price_override" || raw === "no_sale" ? raw : null;
}
