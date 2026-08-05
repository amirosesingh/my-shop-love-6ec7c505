CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ------------------------------------------------------------- campaigns ---
CREATE TABLE IF NOT EXISTS public.coupon_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  discount_type text NOT NULL DEFAULT 'PERCENTAGE'
    CHECK (discount_type IN ('PERCENTAGE', 'FIXED_AMOUNT')),
  discount_value numeric NOT NULL DEFAULT 0,
  scope text NOT NULL DEFAULT 'BILL' CHECK (scope IN ('BILL', 'CATEGORY', 'PRODUCT')),
  scope_value text,
  max_claims integer,
  max_per_member integer DEFAULT 1,
  claims_count integer NOT NULL DEFAULT 0,
  starts_at timestamptz,
  expires_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  is_welcome boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.coupon_campaigns TO authenticated;
GRANT SELECT ON public.coupon_campaigns TO anon;
GRANT ALL ON public.coupon_campaigns TO service_role;
ALTER TABLE public.coupon_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "campaigns readable" ON public.coupon_campaigns;
CREATE POLICY "campaigns readable" ON public.coupon_campaigns
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "campaigns managed by staff" ON public.coupon_campaigns;
CREATE POLICY "campaigns managed by staff" ON public.coupon_campaigns
  FOR ALL TO authenticated USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

DROP TRIGGER IF EXISTS coupon_campaigns_set_updated_at ON public.coupon_campaigns;
CREATE TRIGGER coupon_campaigns_set_updated_at BEFORE UPDATE ON public.coupon_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- -------------------------------------------------------------- vouchers ---
CREATE TABLE IF NOT EXISTS public.issued_vouchers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_slug text NOT NULL UNIQUE,
  campaign_id uuid NOT NULL REFERENCES public.coupon_campaigns(id) ON DELETE CASCADE,
  member_id uuid REFERENCES public.members(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'ISSUED'
    CHECK (status IN ('ISSUED', 'REDEEMED', 'EXPIRED', 'DISABLED')),
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  issued_by text,
  issued_source text NOT NULL DEFAULT 'PUBLIC',
  redeemed_at timestamptz,
  redeemed_by text,
  redeemed_sale_id text,
  disabled_at timestamptz,
  disabled_by text,
  disable_reason text,
  store_id text
);

CREATE INDEX IF NOT EXISTS issued_vouchers_member_idx ON public.issued_vouchers (member_id);
CREATE INDEX IF NOT EXISTS issued_vouchers_campaign_member_idx
  ON public.issued_vouchers (campaign_id, member_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.issued_vouchers TO authenticated;
GRANT ALL ON public.issued_vouchers TO service_role;
REVOKE ALL ON public.issued_vouchers FROM anon;
ALTER TABLE public.issued_vouchers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vouchers readable" ON public.issued_vouchers;
DROP POLICY IF EXISTS "vouchers readable by staff" ON public.issued_vouchers;
CREATE POLICY "vouchers readable by staff" ON public.issued_vouchers
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS "vouchers managed by staff" ON public.issued_vouchers;
CREATE POLICY "vouchers managed by staff" ON public.issued_vouchers
  FOR ALL TO authenticated USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

-- ---------------------------------------------------------- audit trail ----
CREATE TABLE IF NOT EXISTS public.coupon_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL CHECK (event_type IN
    ('CLAIMED', 'ISSUED_MANUAL', 'REDEEMED', 'BLOCKED', 'DISABLED', 'REENABLED')),
  campaign_id uuid REFERENCES public.coupon_campaigns(id) ON DELETE CASCADE,
  campaign_name text,
  voucher_token text,
  member_id uuid REFERENCES public.members(id) ON DELETE SET NULL,
  member_phone text,
  store_id text,
  terminal_id text,
  staff_name text,
  staff_role text,
  sale_id text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS coupon_events_campaign_idx ON public.coupon_events (campaign_id);
CREATE INDEX IF NOT EXISTS coupon_events_created_idx ON public.coupon_events (created_at DESC);

GRANT SELECT ON public.coupon_events TO authenticated;
GRANT ALL ON public.coupon_events TO service_role;
REVOKE ALL ON public.coupon_events FROM anon;
ALTER TABLE public.coupon_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "coupon events readable by staff" ON public.coupon_events;
CREATE POLICY "coupon events readable by staff" ON public.coupon_events
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS "coupon events append only" ON public.coupon_events;

CREATE OR REPLACE FUNCTION public.coupon_events_readonly()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'coupon_events is append-only'; END; $$;

DROP TRIGGER IF EXISTS coupon_events_no_change ON public.coupon_events;
CREATE TRIGGER coupon_events_no_change BEFORE UPDATE OR DELETE ON public.coupon_events
  FOR EACH ROW EXECUTE FUNCTION public.coupon_events_readonly();

-- ----------------------------------------------------------- helpers -------
CREATE OR REPLACE FUNCTION public.normalize_phone(_phone text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT regexp_replace(coalesce(_phone, ''), '[^0-9]', '', 'g')
$$;

CREATE OR REPLACE FUNCTION public.voucher_token()
RETURNS text LANGUAGE sql VOLATILE SET search_path = public, extensions AS $$
  SELECT 'vch_' || substr(encode(extensions.gen_random_bytes(8), 'hex'), 1, 10)
$$;

CREATE OR REPLACE FUNCTION public.campaign_is_live(_c public.coupon_campaigns)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT _c.is_active
    AND (_c.starts_at IS NULL OR now() >= _c.starts_at)
    AND (_c.expires_at IS NULL OR now() <= _c.expires_at)
    AND (_c.max_claims IS NULL OR _c.claims_count < _c.max_claims)
$$;

CREATE OR REPLACE FUNCTION public.coupon_log(
  _type text, _campaign public.coupon_campaigns, _token text DEFAULT NULL,
  _member uuid DEFAULT NULL, _phone text DEFAULT NULL, _store text DEFAULT NULL,
  _terminal text DEFAULT NULL, _staff text DEFAULT NULL, _role text DEFAULT NULL,
  _sale text DEFAULT NULL, _note text DEFAULT NULL)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.coupon_events (
    event_type, campaign_id, campaign_name, voucher_token, member_id, member_phone,
    store_id, terminal_id, staff_name, staff_role, sale_id, note
  ) VALUES (
    _type, _campaign.id, _campaign.name, _token, _member, _phone,
    _store, _terminal, _staff, _role, _sale, _note
  );
$$;

CREATE OR REPLACE FUNCTION public.member_join(
  _phone text, _full_name text, _email text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _digits text := public.normalize_phone(_phone);
  _id uuid;
  _code text;
BEGIN
  IF length(_digits) < 6 THEN RAISE EXCEPTION 'A valid mobile number is required'; END IF;

  SELECT id INTO _id FROM public.members
   WHERE public.normalize_phone(phone) = _digits LIMIT 1;

  IF _id IS NOT NULL THEN
    IF coalesce(_email, '') <> '' THEN
      UPDATE public.members SET email = _email WHERE id = _id AND coalesce(email, '') = '';
    END IF;
    RETURN _id;
  END IF;

  IF coalesce(trim(_full_name), '') = '' THEN RAISE EXCEPTION 'NEW_MEMBER_NAME_REQUIRED'; END IF;

  _code := 'M' || to_char(now(), 'YYMMDD') || substr(replace(gen_random_uuid()::text, '-', ''), 1, 4);

  INSERT INTO public.members (member_code, full_name, phone, email, loyalty_points, total_spent)
  VALUES (_code, trim(_full_name), _phone, nullif(_email, ''), 0, 0)
  RETURNING id INTO _id;

  RETURN _id;
END $$;

-- ------------------------------------------------------------- claiming ----
CREATE OR REPLACE FUNCTION public.coupon_claim(
  _slug text, _phone text, _full_name text DEFAULT NULL, _email text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _c public.coupon_campaigns;
  _member uuid;
  _token text;
  _held integer;
BEGIN
  SELECT * INTO _c FROM public.coupon_campaigns WHERE slug = _slug FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CAMPAIGN_NOT_FOUND'; END IF;
  IF NOT _c.is_active THEN RAISE EXCEPTION 'CAMPAIGN_INACTIVE'; END IF;
  IF _c.starts_at IS NOT NULL AND now() < _c.starts_at THEN RAISE EXCEPTION 'CAMPAIGN_NOT_STARTED'; END IF;
  IF _c.expires_at IS NOT NULL AND now() > _c.expires_at THEN RAISE EXCEPTION 'CAMPAIGN_EXPIRED'; END IF;

  _member := public.member_join(_phone, _full_name, _email);

  SELECT count(*) INTO _held FROM public.issued_vouchers
   WHERE campaign_id = _c.id AND member_id = _member;

  SELECT token_slug INTO _token FROM public.issued_vouchers
   WHERE campaign_id = _c.id AND member_id = _member AND status = 'ISSUED'
   ORDER BY issued_at DESC LIMIT 1;
  IF _token IS NOT NULL THEN RETURN _token; END IF;

  IF _c.max_per_member IS NOT NULL AND _held >= _c.max_per_member THEN
    PERFORM public.coupon_log('BLOCKED', _c, NULL, _member, _phone, NULL, NULL, NULL, NULL, NULL,
      'Per-member limit reached');
    RAISE EXCEPTION 'MEMBER_LIMIT_REACHED';
  END IF;

  IF _c.max_claims IS NOT NULL AND _c.claims_count >= _c.max_claims THEN
    PERFORM public.coupon_log('BLOCKED', _c, NULL, _member, _phone, NULL, NULL, NULL, NULL, NULL,
      'Campaign fully claimed');
    RAISE EXCEPTION 'CAMPAIGN_FULLY_CLAIMED';
  END IF;

  _token := public.voucher_token();
  INSERT INTO public.issued_vouchers (token_slug, campaign_id, member_id, issued_source)
  VALUES (_token, _c.id, _member, 'PUBLIC');

  UPDATE public.coupon_campaigns SET claims_count = claims_count + 1 WHERE id = _c.id;

  PERFORM public.coupon_log('CLAIMED', _c, _token, _member, _phone);
  RETURN _token;
END $$;

CREATE OR REPLACE FUNCTION public.coupon_issue_manual(
  _slug text, _phone text, _full_name text DEFAULT NULL,
  _expires_at timestamptz DEFAULT NULL, _staff text DEFAULT NULL,
  _role text DEFAULT NULL, _store text DEFAULT NULL,
  _ignore_limit boolean DEFAULT false)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _c public.coupon_campaigns;
  _member uuid;
  _token text;
  _held integer;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Only staff can issue vouchers';
  END IF;

  SELECT * INTO _c FROM public.coupon_campaigns WHERE slug = _slug FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CAMPAIGN_NOT_FOUND'; END IF;

  _member := public.member_join(_phone, _full_name, NULL);

  SELECT count(*) INTO _held FROM public.issued_vouchers
   WHERE campaign_id = _c.id AND member_id = _member;

  IF NOT _ignore_limit AND _c.max_per_member IS NOT NULL AND _held >= _c.max_per_member THEN
    PERFORM public.coupon_log('BLOCKED', _c, NULL, _member, _phone, _store, NULL, _staff, _role, NULL,
      'Manual issue blocked by per-member limit');
    RAISE EXCEPTION 'MEMBER_LIMIT_REACHED';
  END IF;

  _token := public.voucher_token();
  INSERT INTO public.issued_vouchers
    (token_slug, campaign_id, member_id, expires_at, issued_by, issued_source)
  VALUES (_token, _c.id, _member, _expires_at, _staff, 'MANUAL');

  UPDATE public.coupon_campaigns SET claims_count = claims_count + 1 WHERE id = _c.id;

  PERFORM public.coupon_log('ISSUED_MANUAL', _c, _token, _member, _phone, _store, NULL, _staff, _role,
    NULL, CASE WHEN _expires_at IS NULL THEN NULL ELSE 'Custom expiry' END);

  RETURN _token;
END $$;

CREATE OR REPLACE FUNCTION public.member_welcome_claim(
  _phone text, _full_name text, _email text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _slug text;
  _auto boolean;
BEGIN
  PERFORM public.member_join(_phone, _full_name, _email);

  SELECT coalesce((integration_settings->>'autoIssueWelcome')::boolean, false)
    INTO _auto FROM public.pos_settings WHERE id = 1;

  IF coalesce(_auto, false) IS NOT TRUE THEN RETURN NULL; END IF;

  SELECT slug INTO _slug FROM public.coupon_campaigns c
   WHERE c.is_welcome AND public.campaign_is_live(c)
   ORDER BY c.created_at DESC LIMIT 1;

  IF _slug IS NULL THEN RETURN NULL; END IF;
  RETURN public.coupon_claim(_slug, _phone, _full_name, _email);
END $$;

-- ----------------------------------------------------------- redemption ----
DROP FUNCTION IF EXISTS public.voucher_redeem(text, text, text, text);
CREATE FUNCTION public.voucher_redeem(
  _token text, _sale_id text DEFAULT NULL,
  _store_id text DEFAULT NULL, _staff text DEFAULT NULL)
RETURNS public.issued_vouchers
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _v public.issued_vouchers;
  _c public.coupon_campaigns;
  _deadline timestamptz;
BEGIN
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
END $$;

DROP FUNCTION IF EXISTS public.voucher_set_status(text, text, text, text, text, text);
CREATE FUNCTION public.voucher_set_status(
  _token text, _status text, _reason text DEFAULT NULL, _staff text DEFAULT NULL,
  _role text DEFAULT NULL, _store text DEFAULT NULL)
RETURNS public.issued_vouchers
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _v public.issued_vouchers;
  _c public.coupon_campaigns;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Only staff can change a voucher status';
  END IF;
  IF _status NOT IN ('ISSUED', 'DISABLED') THEN RAISE EXCEPTION 'VOUCHER_STATUS_INVALID'; END IF;

  SELECT * INTO _v FROM public.issued_vouchers WHERE token_slug = _token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'VOUCHER_NOT_FOUND'; END IF;
  IF _v.status = 'REDEEMED' THEN RAISE EXCEPTION 'VOUCHER_ALREADY_REDEEMED'; END IF;

  SELECT * INTO _c FROM public.coupon_campaigns WHERE id = _v.campaign_id;

  UPDATE public.issued_vouchers
     SET status = _status,
         disabled_at = CASE WHEN _status = 'DISABLED' THEN now() ELSE NULL END,
         disabled_by = CASE WHEN _status = 'DISABLED' THEN _staff ELSE NULL END,
         disable_reason = CASE WHEN _status = 'DISABLED' THEN _reason ELSE NULL END
   WHERE id = _v.id
  RETURNING * INTO _v;

  PERFORM public.coupon_log(
    CASE WHEN _status = 'DISABLED' THEN 'DISABLED' ELSE 'REENABLED' END,
    _c, _token, _v.member_id, NULL, _store, NULL, _staff, _role, NULL,
    coalesce(_reason, CASE WHEN _status = 'DISABLED' THEN 'Disabled from backoffice'
                           ELSE 'Re-enabled from backoffice' END));
  RETURN _v;
END $$;

-- ----------------------------------------------------------- privileges ----
REVOKE ALL ON FUNCTION public.coupon_log(text, public.coupon_campaigns, text, uuid, text, text, text, text, text, text, text) FROM public;
REVOKE ALL ON FUNCTION public.member_join(text, text, text) FROM public;
REVOKE ALL ON FUNCTION public.coupon_claim(text, text, text, text) FROM public;
REVOKE ALL ON FUNCTION public.member_welcome_claim(text, text, text) FROM public;
REVOKE ALL ON FUNCTION public.coupon_issue_manual(text, text, text, timestamptz, text, text, text, boolean) FROM public;
REVOKE ALL ON FUNCTION public.voucher_redeem(text, text, text, text) FROM public;
REVOKE ALL ON FUNCTION public.voucher_set_status(text, text, text, text, text, text) FROM public;

GRANT EXECUTE ON FUNCTION public.member_join(text, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.coupon_claim(text, text, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.member_welcome_claim(text, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.coupon_issue_manual(text, text, text, timestamptz, text, text, text, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.voucher_redeem(text, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.voucher_set_status(text, text, text, text, text, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';