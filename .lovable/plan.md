# Schema repair, relationship-check fix, and a full-coverage feature scanner

## What I confirmed first

- This POS does **not** talk to the built-in Lovable Cloud database. `src/lib/external-supabase-config.ts` pins it to an external project (`qhrufhtbeguxydenzfey`), with an activated terminal's own tenant able to override that. So the scan findings you pasted describe *that* database, which I cannot inspect or migrate from here — the fix has to ship as SQL you run against it.
- The relationship check is called from `src/lib/db-relations.ts` and already falls back to our own server (`/api/public/health-metadata`) when the database refuses a PIN-signed till. The "not installed" message only appears on Postgres error `42883`, so on your instance the function itself is genuinely absent.
- There is **no local Postgres** in the Electron app: the offline engine is SQLite (`electron/db/sqlite.cjs`) or MS SQL Server (`electron/db/pool.cjs`). A Postgres RPC cannot run there, so the offline path needs a different implementation — see below.
- The scanner in `src/lib/feature-schema.ts` currently declares 5 feature groups. Purchasing, shifts/cash-up, held orders, coupons-as-a-module, and drawer/audit trails are not covered.

## 1. SQL files (the actual schema repair)

Two files, identical body, different purpose.

- `supabase/migrations/20260816140000_complete_pos_schema_and_rpc_fix.sql` — version-controlled, for `supabase db push`.
- `supabase/online_schema_fix_latest.sql` — same statements with a header, for pasting into the SQL editor of the database this POS points at.

Both are fully idempotent (`IF NOT EXISTS`, policy re-creation guarded, `CREATE OR REPLACE`) and contain:

- `payment_transactions` — created with the columns the code actually writes (`source_type`, `sale_id`, `booking_id`, `member_id`, `store_id`, `shift_id`, `terminal_id`, `amount`, `method`, `kind`, `reference`, `cashier_id`, `cashier_name`, `note`, `paid_at`, `row_version`, timestamps) plus the `order_id`, `payment_method`, `status`, `transaction_reference`, `metadata` columns you listed, so both naming styles resolve. Foreign keys to `sales`, `bookings`, `members`.
- `item_activity_logs` — the columns `src/lib/pos-db.ts:636` sends (`product_id`, `product_name`, `sku`, `barcode`, `store_id`, `terminal_id`, `activity_type`, `reference`, `quantity_delta`, `stock_before`, `stock_after`, `unit_cost`, `staff_id`, `staff_name`, `role`, `note`, `created_at`) plus your `item_id`, `sale_id`, `transfer_id`, `quantity`, `notes`, `created_by` aliases. FK to `products`.
- `ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS` for all nine: `charges`, `tag_id`, `intake_note`, `string_origin`, `string_source_product_id`, `grip_product_id`, `technician`, `liability_accepted`, `incident_note`, with the defaults the writer assumes (`charges` `jsonb` default `'[]'`, `liability_accepted` boolean default false).
- `public.operational_relational_health()` as `SECURITY DEFINER`, reading `pg_constraint` / `information_schema` for the operational tables only, counting orphan child rows, returning the same `{ at, tables:[{table, rows, links:[{column, parent_table, orphans}]}] }` shape the frontend already parses.
- Indexes on every new foreign key column, `updated_at` triggers, RLS enabled on both new tables, staff read/write policies matching the existing operational-table pattern, and `GRANT` statements for `authenticated` and `service_role` plus `GRANT EXECUTE` on the function.

## 2. Dual-mode relationship check

- Cloud path stays as-is: Supabase client RPC with the session JWT, falling back to the server relay for PIN-signed tills.
- New offline path: when the app is running in Electron against the local mirror, derive the same report from the local engine's own catalogue (SQLite `pragma foreign_key_list` / MSSQL `sys.foreign_keys`) through a new read-only IPC call, mapped into the identical payload shape. The panel then shows a real answer offline instead of "not installed".
- The "not installed" message gains the exact remedy: which file to run and where.

## 3. Full-coverage feature scanner

Extend the declaration table in `src/lib/feature-schema.ts` so every module is probed, each still declaring the exact columns its real call sends:

| Module | Probed against |
| --- | --- |
| Direct sales & split tenders | `sales`, `sale_items`, `payment_transactions` |
| Inventory & item activity | `products`, `product_barcodes`, `item_activity_logs`, `stock_adjustments` |
| Stock transfers | `stock_transfers`, `stock_transfer_items`, `stock_transfer_receive` |
| Purchasing | `purchase_orders`, `purchase_order_items`, `suppliers` |
| Table & venue bookings | `bookings`, `booking_payments` |
| Racket / service ticket cards | `bookings` job fields |
| Coupons & promotions | `coupon_campaigns`, `issued_vouchers`, `promotions`, `voucher_redeem` |
| Customers & membership | `members`, `membership_tiers` |
| Shifts & cash-up | `shifts`, `shift_sessions`, `drawer_events` |
| Held orders & audit | `held_orders`, `activity_events`, `audit_logs` |

`FeatureSchemaReport.tsx` gets a per-feature badge reading **HEALTHY** or **SCHEMA FIX REQUIRED**, an overall count, and each failing row keeps naming the missing table/column with the plain-English fix. Probes stay harmless: zero-row selects and updates filtered to an id that matches nothing.

## 4. Closing summary

The reply will list both file paths, confirm each table/column/function covered, and give the run steps for the SQL editor.

## Note on scope

Nothing in this plan changes what the till writes — only the database catches up to it, plus scanner coverage. Since the target database is external, I cannot verify the repair from here; after you run the file, one press of "Scan Issues" should return all-green.
