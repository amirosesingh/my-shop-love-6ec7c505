CREATE OR REPLACE FUNCTION public.security_selfcheck()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _found jsonb := '[]'::jsonb;
  r record;
BEGIN
  IF (SELECT auth.uid()) IS NOT NULL
     AND NOT public.has_role((SELECT auth.uid()), 'admin') THEN
    RAISE EXCEPTION 'Only admins can run the security self-check';
  END IF;

  FOR r IN
    SELECT c.relname AS name
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity
  LOOP
    _found := _found || jsonb_build_object(
      'id', 'rls_disabled:' || r.name, 'severity', 'critical',
      'title', 'Table "' || r.name || '" has no row protection',
      'detail', 'Row level security is switched off, so the data API exposes every row of this table.');
  END LOOP;

  FOR r IN
    SELECT c.relname AS name
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
      AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid)
      AND (has_table_privilege('anon', c.oid, 'SELECT')
        OR has_table_privilege('authenticated', c.oid, 'SELECT'))
  LOOP
    _found := _found || jsonb_build_object(
      'id', 'rls_no_policy:' || r.name, 'severity', 'high',
      'title', 'Table "' || r.name || '" is reachable but has no access rules',
      'detail', 'Row protection is on with no policies, so every read of this table fails or leaks depending on grants.');
  END LOOP;

  FOR r IN
    SELECT p.proname AS name
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
      AND has_function_privilege('anon', p.oid, 'execute')
      AND p.proname NOT IN ('coupon_claim', 'member_welcome_claim', 'voucher_by_token',
                            'verify_cashier_pin', 'verify_terminal_pin',
                            'terminal_token_heartbeat', 'security_report_findings')
  LOOP
    _found := _found || jsonb_build_object(
      'id', 'anon_definer:' || r.name, 'severity', 'high',
      'title', 'Privileged routine "' || r.name || '" is callable by visitors',
      'detail', 'This routine runs with elevated rights and is no longer restricted to signed-in staff.');
  END LOOP;

  FOR r IN
    SELECT p.proname AS name
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
      AND coalesce(array_to_string(p.proconfig, ','), '') NOT LIKE '%search_path%'
  LOOP
    _found := _found || jsonb_build_object(
      'id', 'unlocked_path:' || r.name, 'severity', 'medium',
      'title', 'Privileged routine "' || r.name || '" has no locked lookup path',
      'detail', 'Without a locked search path this routine can be hijacked by a look-alike object.');
  END LOOP;

  RETURN public.security_report_findings('selfcheck', 'nightly', _found);
END $function$;

REVOKE ALL ON FUNCTION public.security_selfcheck() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.security_selfcheck() TO authenticated;