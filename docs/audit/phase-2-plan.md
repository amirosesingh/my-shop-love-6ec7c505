# Phase 2 — prioritised remediation plan (proposal, not yet implemented)

Derived from `feature-inventory.md`, `schema-comparison.md`,
`sync-coverage.md`. Ordered by data-loss risk. Nothing here has been built.

## P0 — Transactional restore (fixes the largest gap)

Add a *restore pull* distinct from the ongoing catalogue pull: store-scoped,
date-windowed, insert-if-absent, never overwriting a locally unsynced row.

Tables, in dependency order: `shifts` → `shift_sessions` → `sales` →
`sale_items` → `payment_transactions` → `drawer_events` → `held_orders` →
`purchase_orders` → `purchase_order_items` → `stock_adjustments` →
`stock_count_drafts` → `item_activity_logs` → `audit_logs`.

Rules: run once on first start after a fresh install (and on demand from the
Sync Hub); pull only rows for the terminal's store; treat `id` as the conflict
key; never let a restored row re-enter the outbox.

## P1 — Shift closing completeness

- Add local mirrors for `shift_reconciliations` and `shift_variance_alerts`.
- Add `shift_cash_counts` / `shift_close_events` to the desktop push list.
- Decide the offline-close contract: queue the count locally and let the cloud
  RPC recompute variance on reconnect.

## P2 — Governance data through the router

Move `activity_events`, `record_edits`, `authorization_*`,
`member_verifications` from cloud-direct writes onto `dbRouter.write`, so the
actions work offline and leave an on-terminal trail.

## P3 — Schema alignment

- Add cloud columns for the local-only business fields worth keeping:
  `sales.branch_id`, `sale_items.branch_id`, `activity_events.branch_id`,
  `bookings.booking_ref`, `stores.receipt_prefix`.
- Add local mirrors for `booking_payments.reversed_at/reversed_by`,
  `shift_cash_counts.counted_by_user_id`, `shift_close_events.actor_user_id`.
- Retire the legacy `transfers` table from `repo.cjs` `TABLES` once no build
  writes to it.

## P4 — Settings recovery

Pull `pos_settings` (and the cloud-only settings tables) on restore so a
rebuilt terminal returns with its configuration rather than defaults.

## P5 — Registry as source of truth

Extend `src/lib/feature-schema.ts` additively with `syncDirection`,
`securityClass` and `restoreRequired` per feature, then generate the coverage
matrix from it so this audit cannot drift again.
