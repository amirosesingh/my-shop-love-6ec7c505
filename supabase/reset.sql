-- ============================================================================
-- Retail online database data reset (Supabase / PostgreSQL)
-- ============================================================================
-- Target: the Supabase project currently open in the SQL editor. No database
-- name is required because the project selects its PostgreSQL database.
-- DESTRUCTIVE: removes business/trading data while preserving authentication,
-- staff access, branches, terminals, payment methods and application settings.
--
-- Run this file from the Supabase SQL editor as a database owner. PostgreSQL
-- applies ALTER TABLE and DELETE transactionally: if any statement fails, the
-- transaction rolls back and row-level security returns to its original state.
-- Take a backup before continuing.
-- ============================================================================

BEGIN;

-- Remember every public table currently protected by RLS. Policies remain in
-- place; RLS is disabled only for this transaction so the reset is not blocked.
CREATE TEMP TABLE retail_reset_rls_tables ON COMMIT DROP AS
SELECT c.oid::regclass AS table_name
FROM pg_class AS c
JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind IN ('r', 'p')
  AND c.relrowsecurity;

DO $reset_disable_rls$
DECLARE target record;
BEGIN
  FOR target IN SELECT table_name FROM retail_reset_rls_tables LOOP
    EXECUTE format('ALTER TABLE %s DISABLE ROW LEVEL SECURITY', target.table_name);
  END LOOP;
END;
$reset_disable_rls$;

-- Children are cleared before parents so this works without dropping schema,
-- constraints, functions, triggers, grants, policies or configuration.
DO $reset_business_data$
DECLARE
  table_name text;
  targets text[] := ARRAY[
    'sale_items', 'payment_transactions', 'booking_payments', 'bookings',
    'sales', 'held_orders', 'drawer_events', 'shift_variance_alerts',
    'shift_reconciliations', 'shift_close_events', 'shift_cash_counts',
    'shifts', 'shift_sessions', 'stock_delta_applied', 'stock_adjustments',
    'stock_count_drafts', 'stock_transfer_items', 'stock_transfers',
    'purchase_order_items', 'purchase_orders', 'coupon_events',
    'issued_vouchers', 'coupon_campaigns', 'member_verifications', 'members',
    'membership_tiers', 'promotions', 'product_barcodes', 'products',
    'product_categories', 'uom_units', 'suppliers', 'item_activity_logs',
    'sku_audit', 'record_edits', 'entity_status_history',
    'authorization_actions', 'authorization_log', 'authorization_requests',
    'activity_events', 'audit_logs', 'system_audit_logs',
    'offline_sync_audit_log', 'security_findings', 'whatsapp_queue',
    'branch_telemetry', 'terminal_commands', 'sync_metadata'
  ];
BEGIN
  FOREACH table_name IN ARRAY targets LOOP
    IF to_regclass(format('public.%I', table_name)) IS NOT NULL THEN
      EXECUTE format('DELETE FROM public.%I', table_name);
    END IF;
  END LOOP;
END;
$reset_business_data$;

-- Restore RLS on exactly the tables that had it enabled before the reset.
DO $reset_enable_rls$
DECLARE target record;
BEGIN
  FOR target IN SELECT table_name FROM retail_reset_rls_tables LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', target.table_name);
  END LOOP;
END;
$reset_enable_rls$;

-- Fail before commit if even one table that was protected at entry has not
-- been protected again. A failure here rolls back the data deletion too.
DO $reset_verify_rls$
DECLARE unprotected text;
BEGIN
  SELECT string_agg(saved.table_name::text, ', ' ORDER BY saved.table_name::text)
  INTO unprotected
  FROM retail_reset_rls_tables AS saved
  JOIN pg_class AS c ON c.oid = saved.table_name::oid
  WHERE NOT c.relrowsecurity;

  IF unprotected IS NOT NULL THEN
    RAISE EXCEPTION 'RLS was not restored for: %', unprotected;
  END IF;
END;
$reset_verify_rls$;

COMMIT;

SELECT 'sales' AS table_name, count(*) AS remaining_rows FROM public.sales
UNION ALL SELECT 'products', count(*) FROM public.products
UNION ALL SELECT 'members', count(*) FROM public.members
UNION ALL SELECT 'shifts', count(*) FROM public.shifts;
