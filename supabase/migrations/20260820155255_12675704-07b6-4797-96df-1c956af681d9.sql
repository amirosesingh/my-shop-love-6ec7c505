-- 1. audit_logs: drop the wide-open duplicates, keep staff-gated rules
DROP POLICY IF EXISTS "audit_logs_staff_read" ON public.audit_logs;
DROP POLICY IF EXISTS "audit_logs_staff_insert" ON public.audit_logs;

-- 2. branch_telemetry: drop wide-open duplicates and scope to the caller's branch
DROP POLICY IF EXISTS "branch_telemetry_staff_read" ON public.branch_telemetry;
DROP POLICY IF EXISTS "branch_telemetry_staff_write" ON public.branch_telemetry;
DROP POLICY IF EXISTS "branch_telemetry_staff_update" ON public.branch_telemetry;
DROP POLICY IF EXISTS "Staff read telemetry" ON public.branch_telemetry;
DROP POLICY IF EXISTS "Staff refresh telemetry" ON public.branch_telemetry;
DROP POLICY IF EXISTS "Staff report telemetry" ON public.branch_telemetry;

CREATE POLICY "Telemetry visible in own branch" ON public.branch_telemetry
  FOR SELECT TO authenticated
  USING (public.user_has_store_access(store_id));

CREATE POLICY "Telemetry reported for own branch" ON public.branch_telemetry
  FOR INSERT TO authenticated
  WITH CHECK (public.user_has_store_access(store_id));

CREATE POLICY "Telemetry refreshed for own branch" ON public.branch_telemetry
  FOR UPDATE TO authenticated
  USING (public.user_has_store_access(store_id))
  WITH CHECK (public.user_has_store_access(store_id));

REVOKE ALL ON public.branch_telemetry FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.branch_telemetry TO authenticated;
GRANT ALL ON public.branch_telemetry TO service_role;

-- 3. payment_types: remove the permissive staff duplicates; keep supervisor-only writes
DROP POLICY IF EXISTS "payment_types_staff_read" ON public.payment_types;
DROP POLICY IF EXISTS "payment_types_staff_write" ON public.payment_types;

-- 4. login-support tables stay unreachable through the data API
REVOKE ALL ON public.pin_attempts FROM anon, authenticated;
REVOKE ALL ON public.cashiers FROM anon, authenticated;
GRANT ALL ON public.pin_attempts TO service_role;
GRANT ALL ON public.cashiers TO service_role;

GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;