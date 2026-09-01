# Sync coverage matrix — push / pull / restore

Phase 1 discovery. Sources of truth read for this document:
- Desktop (Electron): `electron/db/repo.cjs` → `TABLES`, `CATALOGUE_TABLES`,
  `SCOPED_PULL_TABLES`; `electron/sync/worker.cjs`
- Web / Android: `src/lib/sync-engine.ts` → `PULL_TABLES`
- Write path: `src/lib/db-router.ts` → `commitOps` → `src/lib/sync-outbox.ts`

Legend: **P** = pushed to cloud, **L** = pulled down to the terminal,
**R** = would be restored on a fresh install / wipe.

## Desktop (Electron, local SQL Server mirror)

| Table | Push | Pull | Restore after wipe |
| --- | --- | --- | --- |
| stores, membership_tiers, products, product_barcodes, product_categories, uom_units, promotions, suppliers | P | L (catalogue) | R |
| members | P | L (scoped) | R |
| stock_transfers, stock_transfer_items | P | L (scoped) | R |
| bookings, booking_payments | P | L (scoped) | R |
| pos_settings | P | — | **no** |
| shifts, shift_sessions, drawer_events | P | — | **no** |
| sales, sale_items, payment_transactions | P | — | **no** |
| item_activity_logs | P | — | **no** |
| purchase_orders, purchase_order_items | P | — | **no** |
| stock_adjustments, stock_count_drafts | P | — | **no** |
| held_orders | P | — | **no** |
| audit_logs | P | — | **no** |
| transfers (legacy) | P | — | **no** |

## Web / Android (online-only builds)

`PULL_TABLES` = products, members, membership_tiers, promotions, stores,
suppliers, bookings, stock_transfers, held_orders (9 tables). These builds read
the cloud live, so "restore" is not a concern; the list matters only for the
local read cache.

## Tables written by the app but on NO push list

Written directly to the cloud from `src/lib/*` (no local mirror, no outbox), so
they are unavailable offline and silently skipped by the desktop sync worker:

- `activity_events` (`activity-events.ts`)
- `coupon_campaigns`, `coupon_events`, `issued_vouchers` (`coupons.ts`)
- `member_verifications` (`verification.server.ts`)
- `record_edits`, `authorization_requests`, `authorization_log` (approvals)
- `shift_cash_counts`, `shift_close_events`, `shift_reconciliations`, `shift_variance_alerts`
- `whatsapp_queue`, `branch_telemetry`, `security_findings`
- `terminal_tokens`, `terminal_commands`, `staff_roles`, `app_users`, `user_roles`
- `payment_types`, `settings_scoped`, `pos_store_settings`, `settings_overrides`

## Highest-impact findings

1. **No transactional restore.** Sales, payments, shifts, purchase orders,
   stock movements and audit history are push-only. A wiped or reinstalled
   till comes back with catalogue + members + bookings and **zero trading
   history** — receipts reprint, X/Z reports and stock reconstruction all
   depend on rows the terminal can never pull back.
2. **Shift closing is cloud-only.** `shift_cash_counts` / `shift_close_events`
   have local mirrors but are never pushed by the worker, and
   `shift_reconciliations` / `shift_variance_alerts` have no local table at
   all. An offline close cannot be reconciled later.
3. **Approvals and audit are cloud-direct.** `record_edits`,
   `authorization_*`, `activity_events` bypass the router entirely — offline,
   these actions either fail or leave no trail.
4. **Legacy `transfers` still accepts writes** while `stock_transfers` is the
   live table; two paths can record the same movement.
5. **Branch attribution loss.** `sales.branch_id` / `sale_items.branch_id` /
   `activity_events.branch_id` exist locally only and are dropped on push.

## Current data state (cloud, at audit time)

`products` 15, `members` 3, `audit_logs` 3; `sales`, `sale_items`,
`payment_transactions`, `shifts`, `bookings`, `purchase_orders`,
`stock_adjustments`, `item_activity_logs`, `held_orders` are all empty — the
central database holds no trading history yet, so the gaps above can be closed
before real data is at risk.
