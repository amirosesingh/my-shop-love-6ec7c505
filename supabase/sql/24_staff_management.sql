-- ============================================================
-- 24_staff_management.sql — safe legacy cashier consolidation.
--
-- This update copies old cashier records into app_users but deliberately
-- keeps public.cashiers and verify_cashier_pin while installed terminals may
-- still call the compatibility login path. It is safe to run repeatedly.
-- Run AFTER 23_unified_staff_accounts.sql.
-- ============================================================

DO $rescue$
DECLARE c record;
BEGIN
  IF to_regclass('public.cashiers') IS NULL THEN RETURN; END IF;
  FOR c IN SELECT * FROM public.cashiers LOOP
    INSERT INTO public.app_users
      (user_id, full_name, email, role, role_slug, store_id, is_active,
       pin_hash, pin_length, permissions)
    VALUES
      (lower(c.username), coalesce(nullif(trim(c.full_name), ''), c.username),
       lower(c.username) || '@pos-internal.local', 'staff'::public.app_role,
       coalesce(nullif(trim(c.role_slug), ''), 'cashier'), c.store_id,
       c.is_active, c.pin_hash, 6, coalesce(c.permissions, '{}'::jsonb))
    ON CONFLICT (user_id) DO UPDATE SET
      pin_hash = CASE WHEN coalesce(public.app_users.pin_hash, '') = ''
                      THEN excluded.pin_hash ELSE public.app_users.pin_hash END,
      role_slug = coalesce(public.app_users.role_slug, excluded.role_slug),
      full_name = coalesce(nullif(public.app_users.full_name, ''), excluded.full_name),
      updated_at = now();
  END LOOP;
END
$rescue$;

-- Keep direct staff tables private. Management goes through guarded routines.
REVOKE ALL ON public.app_users FROM anon, authenticated;
GRANT ALL ON public.app_users TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
GRANT SELECT ON public.staff_roles TO authenticated;
GRANT ALL ON public.staff_roles TO service_role;

ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_roles ENABLE ROW LEVEL SECURITY;

-- PIN lookup is never an anonymous browser capability. Terminal login calls
-- it through the trusted server; signed-in supervisors retain manager-PIN use.
DO $pin_rpc_grants$
BEGIN
  IF to_regprocedure('public.verify_terminal_pin(text,text)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.verify_terminal_pin(text, text) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.verify_terminal_pin(text, text) TO authenticated, service_role;
  END IF;
  IF to_regprocedure('public.verify_cashier_pin(text,text)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.verify_cashier_pin(text, text) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.verify_cashier_pin(text, text) TO service_role;
  END IF;
END
$pin_rpc_grants$;

DO $legacy_cashier_security$
BEGIN
  IF to_regclass('public.cashiers') IS NOT NULL THEN
    REVOKE ALL ON public.cashiers FROM anon, authenticated;
    GRANT ALL ON public.cashiers TO service_role;
    ALTER TABLE public.cashiers ENABLE ROW LEVEL SECURITY;
  END IF;
END
$legacy_cashier_security$;

DROP POLICY IF EXISTS "Users can read their own staff record" ON public.app_users;
CREATE POLICY "Users can read their own staff record" ON public.app_users
  FOR SELECT TO authenticated USING (auth_user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Staff read roles" ON public.staff_roles;
CREATE POLICY "Staff read roles" ON public.staff_roles
  FOR SELECT TO authenticated USING (public.is_staff((SELECT auth.uid())));

DROP POLICY IF EXISTS "Users can read their own roles" ON public.user_roles;
CREATE POLICY "Users can read their own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Admins manage roles" ON public.user_roles;
CREATE POLICY "Admins manage roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'admin'::public.app_role))
  WITH CHECK (public.has_role((SELECT auth.uid()), 'admin'::public.app_role));

DO $legacy_cashier_verification$
DECLARE rows_left bigint := 0;
BEGIN
  IF to_regclass('public.cashiers') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.cashiers c
              WHERE NOT EXISTS (SELECT 1 FROM public.app_users a
                                 WHERE lower(a.user_id) = lower(c.username))'
      INTO rows_left;
  END IF;
  RAISE NOTICE 'legacy cashier compatibility: table=%, login=%, rows_left_to_copy=%',
    to_regclass('public.cashiers') IS NOT NULL,
    to_regprocedure('public.verify_cashier_pin(text,text)') IS NOT NULL,
    rows_left;
END
$legacy_cashier_verification$;

SELECT 'unified staff management ready' AS verification,
       to_regprocedure('public.verify_terminal_pin(text,text)') IS NOT NULL AS login_available;