-- 1. Suppliers: staff-only
REVOKE ALL ON public.suppliers FROM anon;
DROP POLICY IF EXISTS "suppliers_read" ON public.suppliers;
DROP POLICY IF EXISTS "suppliers_write" ON public.suppliers;
CREATE POLICY "Staff can read suppliers" ON public.suppliers
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff can manage suppliers" ON public.suppliers
  FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppliers TO authenticated;
GRANT ALL ON public.suppliers TO service_role;

-- 2. Prevent account takeover through the auth sync trigger
CREATE OR REPLACE FUNCTION public.sync_auth_user_to_public()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_code text := coalesce(nullif(trim(new.raw_user_meta_data ->> 'user_id'), ''),
                          split_part(new.email, '@', 1));
  v_name text := coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), v_code);
  v_store text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'store_id', '')), '');
  v_existing public.app_users%rowtype;
BEGIN
  SELECT * INTO v_existing FROM public.app_users WHERE user_id = v_code;

  IF FOUND THEN
    -- Never let a new signup hijack a row already linked to another auth account,
    -- and never link a row whose email does not match the signup email.
    IF (v_existing.auth_user_id IS NOT NULL AND v_existing.auth_user_id <> new.id)
       OR lower(coalesce(v_existing.email, '')) <> lower(new.email) THEN
      RETURN new;
    END IF;

    UPDATE public.app_users
       SET full_name    = v_name,
           store_id     = coalesce(v_store, store_id),
           auth_user_id = new.id,
           updated_at   = now()
     WHERE id = v_existing.id;
    RETURN new;
  END IF;

  INSERT INTO public.app_users (user_id, full_name, role, store_id, email, auth_user_id)
  VALUES (v_code, v_name, 'staff'::app_role, v_store, lower(new.email), new.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN new;
END $function$;

-- 3. Voucher redemption requires staff
CREATE OR REPLACE FUNCTION public.voucher_redeem(_token text, _sale_id text DEFAULT NULL::text, _store_id text DEFAULT NULL::text, _staff text DEFAULT NULL::text)
 RETURNS issued_vouchers
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _v public.issued_vouchers;
  _c public.coupon_campaigns;
  _deadline timestamptz;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Only staff can redeem a voucher';
  END IF;

  SELECT * INTO _v FROM public.issued_vouchers WHERE token_slug = _token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'VOUCHER_NOT_FOUND'; END IF;
  IF _v.status = 'REDEEMED' THEN RAISE EXCEPTION 'VOUCHER_ALREADY_REDEEMED'; END IF;

  SELECT * INTO _c FROM public.coupon_campaigns WHERE id = _v.campaign_id;

  IF _v.status = 'DISABLED' THEN
    PERFORM public.coupon_log('BLOCKED', _c, _token, _v.member_id, NULL, _store_id, NULL, _staff,
      NULL, _sale_id, 'Disabled voucher presented');
    RAISE EXCEPTION 'VOUCHER_DISABLED';
  END IF;

  _deadline := coalesce(_v.expires_at, _c.expires_at);
  IF _deadline IS NOT NULL AND now() > _deadline THEN
    UPDATE public.issued_vouchers SET status = 'EXPIRED' WHERE id = _v.id;
    PERFORM public.coupon_log('BLOCKED', _c, _token, _v.member_id, NULL, _store_id, NULL, _staff,
      NULL, _sale_id, 'Expired voucher presented');
    RAISE EXCEPTION 'VOUCHER_EXPIRED';
  END IF;

  UPDATE public.issued_vouchers
     SET status = 'REDEEMED', redeemed_at = now(), redeemed_by = _staff,
         redeemed_sale_id = _sale_id, store_id = _store_id
   WHERE id = _v.id
  RETURNING * INTO _v;

  PERFORM public.coupon_log('REDEEMED', _c, _token, _v.member_id, NULL, _store_id, NULL, _staff,
    NULL, _sale_id);
  RETURN _v;
END $function$;

-- 4. Remove anonymous/undue EXECUTE on privileged SECURITY DEFINER routines.
REVOKE ALL ON FUNCTION public.sync_auth_user_to_public() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.coupon_log(text, coupon_campaigns, text, uuid, text, text, text, text, text, text, text) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.coupon_issue_manual(text, text, text, timestamptz, text, text, text, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.current_app_user() FROM anon;
REVOKE EXECUTE ON FUNCTION public.delete_cashier(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.delete_terminal_user(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_app_supervisor() FROM anon;
REVOKE EXECUTE ON FUNCTION public.list_app_users() FROM anon;
REVOKE EXECUTE ON FUNCTION public.list_cashiers() FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_app_user_permissions(text, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_app_user_profile(text, text, app_role, text, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_cashier_permissions(uuid, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_terminal_active(text, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.stock_transfer_receive(uuid, text, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.upsert_cashier(uuid, text, text, text, text, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.upsert_terminal_user(text, text, app_role, text, text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.voucher_redeem(text, text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.voucher_set_status(text, text, text, text, text, text) FROM anon;
