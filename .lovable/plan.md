# One offline SQL file and one cloud SQL file, both fresh-install and upgrade safe

## What the scan found

The app reads or writes 52 tables and ~28 database routines. Grouped:

- Locations & terminals: stores, terminal_tokens, terminal_commands, branch_telemetry
- Staff & access: app_users, cashiers, staff_roles, user_roles, pin_attempts, audit_logs, system_audit_logs, security_findings
- Catalog: products, product_barcodes, product_categories, uom_units, suppliers, sku_audit
- Register: sales, sale_items, held_orders, payment_types, payment_transactions, booking_payments, drawer_events
- Shifts: shifts, shift_sessions
- Inventory ops: purchase_orders, purchase_order_items, stock_transfers, stock_transfer_items, stock_adjustments, stock_delta_applied, item_activity_logs
- Members & loyalty: members, membership_tiers, member_verifications
- Coupons: coupon_campaigns, issued_vouchers, coupon_events
- Bookings: bookings
- Settings & sync: pos_settings, secure_settings, settings_locks, settings_overrides, integration_settings, public_flags, sync_metadata, offline_sync_audit_log, whatsapp_queue, activity_events

The current `supabase/schema.sql` covers only the locations slice (62 lines) and carries
no grants or row-level security. The offline files are split across three places
(`database/schema.sql`, `db/offline/pos-offline-sqlserver.sql`,
`electron/db/offline_sqlite_v2.sql`) and lag behind on the newer tables.

## Deliverable 1 — `supabase/schema.sql` (cloud, full)

One re-runnable file that works both on an empty project and on the live database:

1. Extensions, the `app_role` enum, shared trigger helpers (`touch_updated_at`,
   `update_updated_at_column`, `bump_row_version`)
2. All 52 tables with `CREATE TABLE IF NOT EXISTS`, then
   `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` for every column the current app writes,
   so an older database gains the missing columns without losing a row
3. Foreign keys and indexes added only when absent
4. `GRANT` block per table — `authenticated` for operational tables, `service_role`
   everywhere, `anon` SELECT only on the public claim surfaces
   (`coupon_campaigns`, `public_flags`, `stores` name lookup)
5. `ENABLE ROW LEVEL SECURITY` on every public table plus policies:
   staff read/write scoped by branch, admin-only for staff accounts, settings and
   security tables, insert-only for the append-only logs, anon read only where the
   claim pages need it
6. Every routine the app calls (login/PIN, terminal pairing, shifts, stock delta,
   transfer receive, coupon/voucher lifecycle, health and schema inventory) as
   `CREATE OR REPLACE ... SECURITY DEFINER` with a pinned `search_path`
7. A closing verification query listing any table, column, policy or function still
   missing after the run

Nothing drops, truncates or recreates. The same SQL is applied to the Lovable-managed
database as a migration so file and live database stay identical.

## Deliverable 2 — offline schema files

- `db/offline/pos-offline-sqlserver.sql` (T-SQL): same 52 tables, guarded with
  `IF OBJECT_ID(...) IS NULL` / `IF COL_LENGTH(...) IS NULL`, plus the sync columns
  (`is_synced`, `sync_status`, `updated_at`, `row_version`, `client_transaction_id`)
  and the local queue tables (`offline_sync_queue`, `stock_delta_applied`,
  `sync_metadata`).
- `electron/db/offline_sqlite_v2.sql`: the same table set in SQLite form with
  matching column names, so a SQL Server branch and the desktop's own engine stay
  interchangeable; indexes on barcode, sku, member phone, bill number, created_at and
  queue `(status, created_at)`.
- `database/schema.sql` (the master T-SQL file the in-app Schema panel applies) is
  brought in line with the same set.
- `db/offline/README.md` updated with the current table list and the "run it again to
  upgrade" note.

Offline files stay manual-apply only; nothing runs on startup.

## Verification

A short migration summary at the end of the work: which objects each script adds, and
confirmation that no existing row is touched. App version bumped.
