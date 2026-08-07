# Fix "permission denied for function is_staff_now"

## What is happening

Every signed-in read/write in the app goes through access rules that call small helper checks in the database (`is_staff_now`, `is_supervisor_now`, `store_visible`, `has_perm`, and friends). A recent security-hardening pass revoked the right to run those helpers from ordinary signed-in users — only the database owner and the internal service role kept it.

Confirmed by inspecting the database: on `is_staff_now`, `is_supervisor_now`, `is_staff`, `is_app_supervisor`, `has_role`, `has_perm`, `store_visible`, `user_store_id`, `user_cluster_id` and `campaign_is_live`, the execute right is granted only to `postgres` and `service_role`. Access rules on products, sales, sale items, members, bookings, held orders, drawer events, promotions, purchase orders, coupons, settings and audit logs all call those helpers, and rule expressions run as the calling user — so the first query fails with "permission denied for function is_staff_now" instead of returning rows.

## The fix

One database migration that restores execute rights to signed-in users for the helper checks the access rules depend on:

- Grant execute to `authenticated` (keeping `service_role`) on: `is_staff_now`, `is_supervisor_now`, `is_staff`, `is_app_supervisor`, `has_role`, `has_perm`, `store_visible`, `user_store_id`, `user_cluster_id`, `campaign_is_live`.
- Also grant `campaign_is_live` to `anon`, since the public coupon pages read live campaigns without signing in.

These are read-only true/false checks about the caller's own identity, so exposing them to signed-in users is safe — they reveal nothing beyond what the caller already knows about themselves. The genuinely privileged routines (manual voucher issuing, staff/cashier management, terminal management, security finding management) stay restricted exactly as they are now, and each still re-checks the caller's role internally.

## Verification after the migration

1. Re-read the grant list to confirm `authenticated` appears on each helper.
2. Run the database linter and security self-check to confirm no new warnings — in particular no "privileged routine callable by visitors" flag (only `campaign_is_live` gains visitor access; it is a stateless read of a campaign's live window).
3. Sign in in the preview and load Register / Inventory / Members to confirm data loads instead of the permission error.

## Technical notes

- No policy definitions change; only `GRANT EXECUTE` statements.
- `supabase/sql/15_security_and_performance.sql` already contains the intended grants for `is_staff_now` / `is_supervisor_now`; a later hardening script revoked them. The repo SQL files will be updated so a re-run does not reintroduce the regression.