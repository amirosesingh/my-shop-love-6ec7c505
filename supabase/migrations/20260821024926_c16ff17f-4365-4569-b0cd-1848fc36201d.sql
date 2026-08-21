-- 1. member_verifications: the three "staff" policies never checked staff status.
DROP POLICY IF EXISTS member_verifications_staff_read ON public.member_verifications;
DROP POLICY IF EXISTS member_verifications_staff_write ON public.member_verifications;
DROP POLICY IF EXISTS member_verifications_staff_update ON public.member_verifications;

CREATE POLICY member_verifications_staff_read
  ON public.member_verifications FOR SELECT TO authenticated
  USING ((SELECT public.is_staff_now()) AND public.store_visible(store_id));

CREATE POLICY member_verifications_staff_write
  ON public.member_verifications FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_staff_now()) AND public.store_visible(store_id));

CREATE POLICY member_verifications_staff_update
  ON public.member_verifications FOR UPDATE TO authenticated
  USING ((SELECT public.is_staff_now()) AND public.store_visible(store_id))
  WITH CHECK ((SELECT public.is_staff_now()) AND public.store_visible(store_id));

-- 2. product_barcodes writes were open to every signed-in account.
DROP POLICY IF EXISTS product_barcodes_write ON public.product_barcodes;

CREATE POLICY product_barcodes_write
  ON public.product_barcodes FOR ALL TO authenticated
  USING ((SELECT public.is_staff_now()))
  WITH CHECK ((SELECT public.is_staff_now()));

-- 3. Legacy routines nothing calls: take EXECUTE away, keep the routines so an
--    older till build cannot hard-fail on a missing function.
REVOKE EXECUTE ON FUNCTION public.upsert_terminal_user(text, text, app_role, text, text, text, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_terminal_user(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_terminal_active(text, boolean) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_app_user_profile(text, text, app_role, text, boolean) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.staff_account_set_pin(text, text, smallint) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.user_cluster_id() FROM anon, authenticated;