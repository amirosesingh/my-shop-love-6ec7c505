-- Staff records: no direct data-API reach; access flows through the
-- privileged routines and the service role only.
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_users FROM anon, authenticated;
GRANT ALL ON public.app_users TO service_role;

DROP POLICY IF EXISTS "Users can read their own staff record" ON public.app_users;
CREATE POLICY "Users can read their own staff record"
  ON public.app_users FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid());

-- Elevated rules routines are no longer callable by visitors. Guarded so the
-- migration also applies cleanly where a routine is not present.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('pos_rules_get', 'pos_rules_save',
                         'verify_manager_pin', 'held_orders_open_count')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
  END LOOP;
END $$;