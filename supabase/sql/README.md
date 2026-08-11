# Database files, split by feature

Every file is idempotent (`if not exists` / `create or replace`, nothing is
dropped) and ends with a verification query that lists its tables as `OK` or
`MISSING`. Run one file when you only need that feature, or `99_run_all.sql`
for a fresh database.

**Order matters.** `00` creates the extensions, the `app_role` enum and the
shared `updated_at` triggers. `02` creates `is_staff()`, `is_app_supervisor()`
and `has_role()`, which nearly every row level security policy in the other
files calls. Run `00` then `02` before anything else.

| File | Feature | Tables |
| --- | --- | --- |
| `00_extensions_and_enums.sql` | Base | pgcrypto, `app_role`, `touch_updated_at`, `update_updated_at_column` |
| `02_staff_and_access.sql` | Staff, roles, PIN sign-in | `app_users`, `cashiers`, `user_roles` |
| `01_stores_and_terminals.sql` | Shops and terminal activation | `stores`, `terminal_tokens` |
| `03_catalog.sql` | Catalogue | `products`, `product_categories`, `uom_units`, `suppliers` |
| `04_register_sales.sql` | Register / POS | `sales`, `sale_items`, `held_orders`, `drawer_events` |
| `05_shifts.sql` | Shifts and sign-ins | `shifts`, `shift_sessions` |
| `06_inventory_ops.sql` | Purchasing, adjustments, transfers | `purchase_orders`, `purchase_order_items`, `stock_adjustments`, `stock_transfers`, `stock_transfer_items` |
| `07_members_and_loyalty.sql` | Membership | `members`, `membership_tiers`, `promotions` |
| `08_coupons_and_vouchers.sql` | Coupons | `coupon_campaigns`, `issued_vouchers`, `coupon_events` |
| `09_bookings.sql` | Bookings and racket jobs | `bookings`, `booking_payments` |
| `10_settings_and_integrations.sql` | Settings and outbox | `pos_settings`, `secure_settings`, `whatsapp_queue` |
| `11_audit_and_logs.sql` | Audit trail | `audit_logs`, `sku_audit` |
| `12_analytics_views.sql` | Reporting views | `v_sale_line_facts`, `v_daily_store_sales`, `v_daily_item_sales` |
| `22_roles_and_pin_gates.sql` | Dynamic staff roles and permission gates | `staff_roles`, role assignment fields |
| `23_unified_staff_accounts.sql` | Unified username/PIN and email/password staff accounts | `app_users` account routines |
| `24_staff_management.sql` | Safe legacy cashier migration | Copies legacy cashiers when present; fresh databases skip it |
| `25_staff_account_lifecycle.sql` | Inactive-first permanent staff deletion | Protected account lifecycle routine |
| `26_staff_upgrade_22_25.sql` | Consolidated staff upgrade runner | Runs files 22–25 in order with psql |

`98_drop_unused.sql` is separate and **destructive**, and every statement in it
is commented out as shipped, so running the file by accident deletes nothing.
Uncomment a single line only after taking a backup. It is never included in
`99_run_all.sql`.

## Staff account upgrade order

For an existing database that already has the base POS schema, run these files
in order: `22_roles_and_pin_gates.sql`, `23_unified_staff_accounts.sql`,
`24_staff_management.sql`, then `25_staff_account_lifecycle.sql`. File 24 keeps
the legacy cashier table and login routine so older installed terminals remain
compatible. These files are also safe when the legacy `cashiers` table does
not exist; `app_users` remains the canonical staff source. Account rows are deleted only when an administrator explicitly
uses Delete permanently after first deactivating that account.

## Nothing is deleted by a deploy

Every file listed above is additive: `create table if not exists`,
`add column if not exists`, `create or replace`. Function and policy drops do
appear — replacing a routine or an access rule requires them — but they change
definitions only and never touch rows. No table is dropped by any file in the
run-all path.

The application deletes rows only when a person asks for it, one record at a
time: removing a held order, cancelling a transfer line, deleting a coupon
campaign or category, removing a booking line, revoking a terminal token, and
clearing a synced entry from the local outbox. None of these run at start-up,
on deploy, or on a timer.

> The **Live Business Board** (`/analytics`) reads only these three views. If it
> reports that it cannot read your figures, run `12_analytics_views.sql` (and
> `04_register_sales.sql` for the underlying grants) on your database, then sign
> in again so the request carries a staff session.

## Security

Each file enables row level security on its tables, recreates its policies and
grants Data API access:

- `authenticated` gets select / insert / update / delete where a policy allows it.
- `service_role` gets full access for server-side jobs.
- `anon` gets read-only access **only** on the public storefront tables
  (`stores`, `products`, `membership_tiers`, `promotions`, `coupon_campaigns`,
  `issued_vouchers`) used by the public claim and voucher pages.

Grants alone are not access: the policies still decide row visibility, and most
of them require `is_staff(auth.uid())` or `is_app_supervisor()`.
