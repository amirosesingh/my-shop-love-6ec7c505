-- Lock every routine in public by default
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

-- Public entry points used by the member / redeem pages and terminal sign-in
GRANT EXECUTE ON FUNCTION public.coupon_claim(text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.member_welcome_claim(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.voucher_by_token(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_cashier_pin(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_terminal_pin(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.terminal_token_status(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.terminal_token_heartbeat(uuid, boolean) TO anon, authenticated;

-- Signed-in staff actions (each routine checks the caller's role internally)
GRANT EXECUTE ON FUNCTION public.current_app_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_app_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_cashiers() TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_cashier(uuid, text, text, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_cashier(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_cashier_permissions(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_terminal_user(text, text, app_role, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_terminal_user(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_terminal_active(text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_app_user_profile(text, text, app_role, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_app_user_permissions(text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.coupon_issue_manual(text, text, text, timestamptz, text, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.voucher_redeem(text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.voucher_set_status(text, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.stock_transfer_receive(uuid, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.terminal_token_claim(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.security_selfcheck() TO authenticated;
GRANT EXECUTE ON FUNCTION public.security_set_finding_status(uuid, text, text) TO authenticated;

-- Service role keeps everything for maintenance jobs
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;