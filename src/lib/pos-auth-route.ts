/**
 * Which door a write goes through, and which writes must reach a real database.
 *
 * Two kinds of operator use the same till:
 *  - admins and supervisors sign in with email and password, so they hold a
 *    live session on the central database and write with it directly;
 *  - cashiers and staff sign in with a username and PIN, which is not a cloud
 *    account. Their writes go through the `/api/public/sync` server relay,
 *    which proves the till and commits with the server's own key.
 */
import { cashierTokenSync } from "./pos-credentials";
import { hasStaffSession } from "@/core/api/sync-relay";
import type { SyncOp } from "./sync-outbox";

/**
 * Operational business data. These records are money and stock movements, so
 * they are never parked in browser storage: they must land in the local SQL
 * database or the central database, or the action is refused.
 */
export const OPERATIONAL_TABLES = new Set([
  "sales",
  "sale_items",
  "shifts",
  "shift_sessions",
  "drawer_events",
  "stock_adjustments",
  "stock_count_drafts",
  "booking_payments",
]);

export const isOperationalTable = (table: string): boolean => OPERATIONAL_TABLES.has(table);

/** True when every operation in the batch is operational business data. */
export const isOperationalBatch = (ops: SyncOp[]): boolean =>
  ops.length > 0 && ops.every((op) => isOperationalTable(op.table));

/**
 * A PIN sign-in has no session on the central database, so direct writes would
 * be refused by the row rules. Detected once per call, never cached, because a
 * supervisor can sign in over the top of a cashier at any moment.
 */
export function isPinSession(): boolean {
  if (typeof window === "undefined") return false;
  if (hasStaffSession()) return false;
  return !!cashierTokenSync();
}

/** Should this write be sent straight to the server relay? */
export const preferRelay = (): boolean => isPinSession();
