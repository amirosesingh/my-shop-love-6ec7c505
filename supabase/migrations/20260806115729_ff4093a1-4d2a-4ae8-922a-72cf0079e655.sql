-- Make execute rights explicit on every SECURITY DEFINER routine.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
  END LOOP;
END $$;

-- Pre-auth / storefront entry points: intentionally reachable without a session.
GRANT EXECUTE ON FUNCTION public.coupon_claim(text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.member_welcome_claim(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.voucher_by_token(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_cashier_pin(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_terminal_pin(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.terminal_token_heartbeat(uuid, boolean) TO anon, authenticated;

-- Signed-in only. Each routine performs its own staff/supervisor check.
GRANT EXECUTE ON FUNCTION public.coupon_issue_manual(text, text, text, timestamptz, text, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_app_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_cashier(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_terminal_user(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_app_supervisor() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_app_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_cashiers() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_app_user_permissions(text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_app_user_profile(text, text, app_role, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_cashier_permissions(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_terminal_active(text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.stock_transfer_receive(uuid, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.terminal_token_claim(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.terminal_token_status(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_cashier(uuid, text, text, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_terminal_user(text, text, app_role, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.voucher_redeem(text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.voucher_set_status(text, text, text, text, text, text) TO authenticated;

-- RLS helpers: needed by signed-in policy evaluation only, never by anonymous callers.
GRANT EXECUTE ON FUNCTION public.is_staff_now() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_supervisor_now() TO authenticated;
GRANT EXECUTE ON FUNCTION public.store_visible(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_store_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_cluster_id() TO authenticated;