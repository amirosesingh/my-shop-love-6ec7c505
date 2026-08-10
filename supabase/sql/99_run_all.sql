-- ============================================================
-- 99_run_all.sql — fresh install / full refresh, in dependency order
-- ============================================================
-- Using psql (recommended):
--     cd supabase/sql && psql "$DATABASE_URL" -f 99_run_all.sql
--
-- Using the SQL editor (no \i support): open each file below in this
-- exact order and run it. Every file is idempotent, so re-running is safe.
-- ============================================================

\i 00_extensions_and_enums.sql
\i 02_staff_and_access.sql
\i 01_stores_and_terminals.sql
\i 03_catalog.sql
\i 04_register_sales.sql
\i 05_shifts.sql
\i 06_inventory_ops.sql
\i 07_members_and_loyalty.sql
\i 08_coupons_and_vouchers.sql
\i 09_bookings.sql
\i 10_settings_and_integrations.sql
\i 11_audit_and_logs.sql
\i 12_analytics_views.sql
\i 13_pos_rules.sql
\i 14_settings_scopes.sql
\i 15_security_and_performance.sql
\i 16_security_alerts.sql
\i 17_public_flags_and_grants.sql
\i 18_shift_notifications.sql
\i 19_rules_grants.sql
\i 20_staff_roles_backfill.sql
\i 21_backfill_branch_ids.sql
\i 22_roles_and_pin_gates.sql
\i 23_unified_staff_accounts.sql
\i 24_staff_management.sql
