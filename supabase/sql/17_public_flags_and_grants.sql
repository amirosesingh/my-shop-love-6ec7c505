-- ============================================================
-- 17_public_flags_and_grants.sql
--   * switches the public member / redeem subdomains on and off
--   * locks EXECUTE on every privileged routine to a deliberate allow-list
-- Idempotent: safe to re-run.
-- ============================================================

-- ---------- public switches ----------
CREATE TABLE IF NOT EXISTS public.public_flags (
  key text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.public_flags TO anon;
GRANT SELECT, INSERT, UPDATE ON public.public_flags TO authenticated;
GRANT ALL ON public.public_flags TO service_role;

ALTER TABLE public.public_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read public flags" ON public.public_flags;
CREATE POLICY "Anyone can read public flags" ON public.public_flags
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Staff can add public flags" ON public.public_flags;
CREATE POLICY "Staff can add public flags" ON public.public_flags
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_staff_now()));

DROP POLICY IF EXISTS "Staff can change public flags" ON public.public_flags;
CREATE POLICY "Staff can change public flags" ON public.public_flags
  FOR UPDATE TO authenticated USING ((SELECT public.is_staff_now()))
  WITH CHECK ((SELECT public.is_staff_now()));

DROP TRIGGER IF EXISTS public_flags_touch ON public.public_flags;
CREATE TRIGGER public_flags_touch BEFORE UPDATE ON public.public_flags
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.public_flags (key, enabled) VALUES
  ('member_domain_enabled', true),
  ('redeem_domain_enabled', true)
ON CONFLICT (key) DO NOTHING;

-- ---------- routine execution allow-list ----------
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

-- Public entry points (member signup, voucher pages, terminal sign-in)
GRANT EXECUTE ON FUNCTION public.coupon_claim(text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.member_welcome_claim(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.voucher_by_token(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_cashier_pin(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_terminal_pin(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.terminal_token_status(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.terminal_token_heartbeat(uuid, boolean) TO anon, authenticated;

-- Signed-in staff actions (each routine re-checks the caller's role)
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

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;
