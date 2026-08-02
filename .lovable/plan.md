# Offline database review (Microsoft SQL Server) + gap fixes

## What already exists

The Windows desktop shell already runs a real Microsoft SQL Server database on the
till. Nothing needs to be introduced — it needs completing.

- `electron/db/pool.cjs` — `mssql` connection pool, Windows integrated auth
  (`msnodesqlv8`) or SQL login, and it runs the schema on every start.
- `electron/db/schema.sql` — 15 local tables, all idempotent:
  sync_state, products, membership_tiers, members, sales, sale_items,
  purchase_orders, purchase_order_items, promotions, shifts, bookings,
  booking_payments, transfers, audit_logs, pos_settings, plus the
  `BranchSales` / `BranchSaleItems` views and `branch_id` columns.
- Every table carries the sync block (`is_synced`, `sync_status`, `created_at`,
  `updated_at`), a `(is_synced, created_at)` index, and a touch trigger that
  re-queues any edited row.
- `electron/db/repo.cjs` — parameterised T-SQL only, `createSale` commits the
  bill + lines + stock in one transaction.
- `electron/sync/worker.cjs` — push pending rows oldest-first, pull catalogue
  only; the renderer reaches it through `window.pos` / `window.electronAPI`.
- Settings -> Sync & backup already has server, database, port, auth mode,
  Test connection, Save & connect, Pull, Backup (`BACKUP DATABASE ... TO DISK`).

## Gaps found against the cloud schema

1. `dbo.sales` is missing five columns the cloud has: `payments` (the split
   cash/card/wallet tenders), `coupon_code`, `coupon_discount`,
   `coupon_promo_id`, `coupon_scope`. A split-tender or coupon bill made
   offline loses that detail on push.
2. No `dbo.drawer_events` table — no-sale drawer opens exist in the cloud but
   are not recorded locally.
3. The activity journal and the sync outbox still live in browser
   localStorage, not in SQL Server, so clearing app data loses queued work.

## Changes to make

- Extend `electron/db/schema.sql` with idempotent `ALTER TABLE` blocks adding
  the five sales columns, and a new `dbo.drawer_events` table with the standard
  sync block, index and trigger.
- Add `drawer_events` to the push table order in `electron/sync/worker.cjs`
  and to the allow-list in `electron/db/repo.cjs`; map the new sale columns in
  `createSale` and `toCloudRow`.
- Add `dbo.activity_journal` and `dbo.outbox` tables so journal entries and
  queued operations survive on disk, and mirror writes there from
  `src/lib/activity-journal.ts` / `src/lib/sync-outbox.ts` when the bridge is
  present (localStorage stays as the browser fallback).
- Update `docs/windows-sql-server.md` with the final table list.

No UI or business-logic changes; existing databases upgrade in place because
every statement is guarded.
