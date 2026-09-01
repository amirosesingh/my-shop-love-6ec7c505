# Phase 2 — Close the recovery gap (P0 + P1)

The audit found the biggest risk: a wiped or reinstalled till comes back with
catalogue, members and bookings, but **no trading history** — sales, payments,
shifts, purchasing, stock movements and audit rows are pushed to the cloud and
never pulled back. Shift closing is also cloud-only, so an offline close cannot
be reconciled later.

This phase fixes those two things. Nothing else from the audit is touched yet.

## Part 1 — Transactional restore

A new **restore pull**, separate from the ongoing catalogue pull:

- Runs once automatically on first start after a fresh install, and on demand
  from a "Restore history from cloud" action in the Sync Hub.
- Pulls only rows belonging to this terminal's store, within a configurable
  date window (default: last 90 days, with "all history" option).
- Inserts rows that are missing locally; never overwrites a local row that
  still has unsynced changes, and never re-queues restored rows for upload.
- Shows progress per table and a clear summary of what came back.

Tables restored, in dependency order:
shifts → shift_sessions → sales → sale_items → payment_transactions →
drawer_events → held_orders → purchase_orders → purchase_order_items →
stock_adjustments → stock_count_drafts → item_activity_logs → audit_logs.

Result: receipt reprint, X/Z reports, item history and all reports work again
after a rebuild.

## Part 2 — Shift closing completeness

- Add local tables for `shift_reconciliations` and `shift_variance_alerts`
  so variance state exists on the terminal.
- Add `shift_cash_counts` and `shift_close_events` to the desktop upload list
  so an offline blind count reaches the cloud.
- Offline close contract: the count is stored locally and marked pending; on
  reconnect the cloud routine recomputes the variance and the till updates to
  the authoritative result. The close is not silently finalised offline.

## Technical notes

- Restore lives beside the existing pull in `electron/sync/worker.cjs` with a
  new `RESTORE_TABLES` spec in `electron/db/repo.cjs` (store-scoped, parent-key
  aware for child tables such as `sale_items` and `purchase_order_items`).
- Conflict key is `id`; restored rows are written with `is_synced = 1` and
  `sync_status = 'synced'` so they cannot bounce back into the outbox.
- A `restore_state` marker in local `sync_state` records the last completed
  restore so it does not repeat on every launch.
- New local tables follow the existing guarded `if not exists` style in
  `database/schema.sql` and are added to `src/lib/central-schema.ts` for drift
  detection; local sync bookkeeping columns are mirrored as on other tables.
- Web/Android builds are online-only and unaffected by the restore path.

## Not in this phase

Governance writes through the router (activity/approvals/verifications),
branch-attribution columns, retiring legacy `transfers`, settings restore, and
the feature-registry metadata — these stay queued as P2–P5.
