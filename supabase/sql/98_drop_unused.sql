-- ============================================================================
-- 98_drop_unused.sql  —  OPTIONAL AND DESTRUCTIVE. Read before running.
--
-- Removes objects that no part of the application reads or writes any more.
-- Take a backup first: everything below is deleted permanently, together with
-- any rows it still holds.
--
-- Nothing else in the database is unused: every other table is referenced by
-- live application code.
-- ============================================================================

-- 1) Manager override attempts were replaced by the audit trail (`audit_logs`).
DROP TABLE IF EXISTS public.manager_override_events CASCADE;

-- 2) Branch clusters are now a plain `group_id` column on `stores`, so the
--    separate lookup table is no longer read.
DROP TABLE IF EXISTS public.store_groups CASCADE;

-- 3) Per-branch settings rows superseded by the settings hierarchy
--    (`settings_scoped`). Uncomment only after confirming the hierarchy page
--    shows your saved values, because the POS rules reader still falls back to
--    this table on older databases.
-- DROP TABLE IF EXISTS public.pos_store_settings CASCADE;

-- Kept on purpose:
--   v_sale_line_facts  — the two daily sales views are built on top of it.

-- Verification: anything listed below still exists.
SELECT c.relname AS still_present
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('manager_override_events', 'store_groups');