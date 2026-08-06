# Database hardening, isolation and performance pass

## What I checked first

- Every RLS policy in the database today calls `is_staff(auth.uid())` / `is_app_supervisor()` directly (unwrapped), so Postgres re-evaluates identity per row.
- There is **no** `tenant_id` column anywhere. Isolation today is role-based only: any signed-in staff row can read every branch's data. Branch/cluster identity exists as `store_id` on tables and `group_id` on `stores`, plus `app_users.store_id`.
- Index coverage is thin: no index on `sales.store_id`, `sales.shift_id`, `held_orders.store_id`, `bookings.store_id/member_id`, `sale_items.product_id`, `drawer_events.*`, `settings_scoped` beyond its PK, `shift_sessions.staff_id`, `products.category`, and none of the `stores.group_id` / cluster joins.
- Most `SECURITY DEFINER` functions already set a search path, but several use `public, extensions` without `pg_temp`; the plain-`public` ones are also missing `pg_temp`.

## What gets built

### 1. Tenant boundary (the real gap)

Add a `public.user_scope()` helper (STABLE SECURITY DEFINER) that returns the caller's `store_id` and cluster from `app_users` + `user_roles`, plus `is_global` for admin/manager. Then rewrite the branch-scoped tables' policies so a cashier only sees their own branch:

- Scoped: `sales`, `sale_items` (via parent), `shifts`, `shift_sessions`, `held_orders`, `drawer_events`, `bookings`, `booking_payments`, `stock_adjustments`, `settings_scoped` (BRANCH rows), `whatsapp_queue`.
- Shared/global stays readable by all staff: `products`, `members`, `membership_tiers`, `promotions`, `pos_settings`, `product_categories`, `uom_units`, `suppliers`, `stores`.
- Writes bind `store_id` in `WITH CHECK` to the caller's scope, so a client cannot post rows under another branch's ID.
- Admin/manager keep full cross-branch access (dashboards, analytics, transfers).

### 2. Auth-subquery wrapping

Every policy is rewritten as `(SELECT public.is_staff((SELECT auth.uid())))` style scalar subqueries so identity is evaluated once per statement instead of once per row.

### 3. Search-path and input hardening

- Re-declare every `SECURITY DEFINER` function with `SET search_path = public, pg_temp` (or `public, extensions, pg_temp` where `crypt`/`gen_salt` are used).
- Add explicit bounds/null guards in the writable RPCs (`pos_rules_save`, `settings_upsert`, `settings_sync_batch`, `upsert_terminal_user`, `upsert_cashier`, `voucher_*`, `coupon_*`): reject empty/oversized text, clamp numeric ranges (percent 0–100, days 0–3650, timeouts 10–3600), validate scope/status enums.
- Replace raw exception text that could echo internals with fixed error codes; server functions map codes to friendly messages so no Postgres detail reaches the browser.

### 4. Indexes

- FK / guard-column B-Tree: `sales(store_id)`, `sales(shift_id)`, `sale_items(product_id)`, `bookings(store_id)`, `bookings(member_id)`, `booking_payments(booking_id)`, `held_orders(store_id)`, `drawer_events(store_id)`, `shift_sessions(staff_id)`, `stock_adjustments(store_id, product_id)`, `stores(group_id)`, `user_roles(user_id)`, `app_users(store_id)`, `issued_vouchers(campaign_id)`, `purchase_orders(supplier_id)`.
- Composite for the hot pairs: `sales(store_id, created_at DESC)`, `sales(shift_id, created_at)`, `audit_logs(target_module, created_at DESC)`, `settings_scoped(scope, scope_id, key)`, `stock_transfers(to_store_id, status)`, `bookings(store_id, job_status, created_at DESC)`.
- Partial: `settings_scoped(scope, scope_id) WHERE is_overridden`, `shifts(store_id) WHERE closed_at IS NULL`, `issued_vouchers(member_id) WHERE status = 'ISSUED'`, `coupon_campaigns(slug) WHERE is_active`, `terminal_tokens(location_id) WHERE status = 'active'`.

### 5. Fetching in the app

- Cursor pagination for the high-volume lists — audit logs, coupon events, sales/receipt history, item sales report, stock adjustments — keyed on `(created_at, id)` with a "Load more" cursor instead of `range()` offsets.
- Replace `select('*')` with explicit column lists on those same read paths so payloads shrink.

### 6. Partitioning — staged, not in this pass

`audit_logs`, `coupon_events` and `sales`/`sale_items` cannot be converted in place; partitioning means creating a partitioned twin, copying rows, and swapping under a lock. I'll prepare the migration script for `audit_logs` and `coupon_events` (monthly range on `created_at`, plus a helper to create future partitions) and run it only after you confirm a maintenance window. `sales` stays unpartitioned for now — current row counts don't justify the risk, and the new composite indexes cover the query shapes.

## Technical notes

- All of this lands as one Supabase migration plus a mirrored feature file under `supabase/sql/` (`15_security_and_performance.sql`) so the external/Windows backend script stays in sync.
- Policies are dropped and recreated per table; grants are re-asserted for `authenticated` / `service_role`.
- Frontend changes are limited to query files (`src/lib/pos-db.ts`, audit/report loaders) plus "Load more" controls on the affected report pages.
- Risk to watch: tightening branch isolation can hide rows from a cashier whose `app_users.store_id` is blank. The migration backfills blank branch assignments to the terminal's store where one can be inferred, and treats a blank scope as "no branch rows" only for non-supervisor roles, so admins never lose visibility.
