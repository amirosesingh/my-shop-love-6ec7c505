/**
 * Canonical data-ownership policy.
 *
 * Operational tables are transaction/business records that must never be
 * written ad-hoc from feature/UI modules. Their mutations go through the
 * durable POS write path (pos-db/commitOps, sync engine, or the server relay).
 *
 * Control-plane tables are centrally authoritative configuration/identity
 * records. They may use their dedicated cloud APIs and are intentionally not
 * queued as offline business transactions.
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

export const CONTROL_PLANE_TABLES = new Set([
  "app_users",
  "staff_roles",
  "terminal_tokens",
  "terminal_commands",
  "nav_pins",
  "public_flags",
  "catalog_meta",
  "store_groups",
  "payment_types",
]);

export const isOperationalTable = (table: string): boolean => OPERATIONAL_TABLES.has(table);
export const isControlPlaneTable = (table: string): boolean => CONTROL_PLANE_TABLES.has(table);
