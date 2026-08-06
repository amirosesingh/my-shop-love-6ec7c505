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
