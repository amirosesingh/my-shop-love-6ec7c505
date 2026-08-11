-- ============================================================
-- 26_staff_upgrade_22_25.sql — consolidated staff upgrade runner
-- ============================================================
-- psql runner for the repaired, ordered staff upgrade files. Each included
-- file is idempotent and supports both legacy databases with `cashiers` and
-- unified databases where that table does not exist.
--
-- Run from this directory:
--   psql "$DATABASE_URL" -f 26_staff_upgrade_22_25.sql
--
-- SQL editors that do not support \i: run files 22, 23, 24 and 25 in this
-- exact order. No legacy cashier table needs to be created.
-- ============================================================

\i 22_roles_and_pin_gates.sql
\i 23_unified_staff_accounts.sql
\i 24_staff_management.sql
\i 25_staff_account_lifecycle.sql
\i 27_staff_credentials_and_ids.sql
\i 28_app_users_id_link.sql

SELECT 'staff upgrade 22-25 complete' AS verification,
       to_regclass('public.app_users') IS NOT NULL AS app_users_ready,
       to_regclass('public.staff_roles') IS NOT NULL AS staff_roles_ready,
       to_regprocedure('public.staff_account_upsert(text,text,text,app_role,text,text,boolean,text,smallint,uuid,jsonb)') IS NOT NULL AS provisioning_ready,
       to_regprocedure('public.verify_terminal_pin(text,text)') IS NOT NULL AS pin_login_ready;\i 29_shift_access_and_rpcs.sql
