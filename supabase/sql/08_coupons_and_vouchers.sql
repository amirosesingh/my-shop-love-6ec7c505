-- ============================================================
-- 08_coupons_and_vouchers.sql — Coupon campaigns, issued vouchers and coupon audit events
-- Lucky Charms POS. Safe to run repeatedly: nothing is dropped.
-- Requires: 00_extensions_and_enums.sql, then 02_staff_and_access.sql
-- (row level security policies below call is_staff() / is_app_supervisor()).
-- ============================================================

-- ---------- tables, columns and indexes ----------
CREATE TABLE IF NOT EXISTS public.coupon_campaigns (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  slug text NOT NULL,
  discount_type text DEFAULT 'PERCENTAGE'::text NOT NULL,
  discount_value numeric DEFAULT 0 NOT NULL,
  scope text DEFAULT 'BILL'::text NOT NULL,
  scope_value text,
  max_claims integer,
  max_per_member integer DEFAULT 1,
  claims_count integer DEFAULT 0 NOT NULL,
  starts_at timestamp with time zone,
  expires_at timestamp with time zone,
  is_active boolean DEFAULT true NOT NULL,
  is_welcome boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

ALTER TABLE public.coupon_campaigns ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();

ALTER TABLE public.coupon_campaigns ADD COLUMN IF NOT EXISTS name text;

ALTER TABLE public.coupon_campaigns ADD COLUMN IF NOT EXISTS slug text;

ALTER TABLE public.coupon_campaigns ADD COLUMN IF NOT EXISTS discount_type text DEFAULT 'PERCENTAGE'::text;

ALTER TABLE public.coupon_campaigns ADD COLUMN IF NOT EXISTS discount_value numeric DEFAULT 0;

ALTER TABLE public.coupon_campaigns ADD COLUMN IF NOT EXISTS scope text DEFAULT 'BILL'::text;

ALTER TABLE public.coupon_campaigns ADD COLUMN IF NOT EXISTS scope_value text;

ALTER TABLE public.coupon_campaigns ADD COLUMN IF NOT EXISTS max_claims integer;

ALTER TABLE public.coupon_campaigns ADD COLUMN IF NOT EXISTS max_per_member integer DEFAULT 1;

ALTER TABLE public.coupon_campaigns ADD COLUMN IF NOT EXISTS claims_count integer DEFAULT 0;

ALTER TABLE public.coupon_campaigns ADD COLUMN IF NOT EXISTS starts_at timestamp with time zone;

ALTER TABLE public.coupon_campaigns ADD COLUMN IF NOT EXISTS expires_at timestamp with time zone;

ALTER TABLE public.coupon_campaigns ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

ALTER TABLE public.coupon_campaigns ADD COLUMN IF NOT EXISTS is_welcome boolean DEFAULT false;

ALTER TABLE public.coupon_campaigns ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();

ALTER TABLE public.coupon_campaigns ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();

DO $$ BEGIN ALTER TABLE public.coupon_campaigns ADD CONSTRAINT coupon_campaigns_slug_key UNIQUE (slug); EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.coupon_campaigns ADD CONSTRAINT coupon_campaigns_discount_type_check CHECK ((discount_type = ANY (ARRAY['PERCENTAGE'::text, 'FIXED_AMOUNT'::text]))); EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.coupon_campaigns ADD CONSTRAINT coupon_campaigns_scope_check CHECK ((scope = ANY (ARRAY['BILL'::text, 'CATEGORY'::text, 'PRODUCT'::text]))); EXCEPTION WHEN others THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS coupon_campaigns_slug_key ON public.coupon_campaigns USING btree (slug);

CREATE UNIQUE INDEX IF NOT EXISTS coupon_campaigns_pkey ON public.coupon_campaigns USING btree (id);

CREATE TABLE IF NOT EXISTS public.coupon_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  event_type text NOT NULL,
  campaign_id uuid,
  campaign_name text,
  voucher_token text,
  member_id uuid,
  member_phone text,
  store_id text,
  terminal_id text,
  staff_name text,
  staff_role text,
  sale_id text,
  note text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

ALTER TABLE public.coupon_events ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();

ALTER TABLE public.coupon_events ADD COLUMN IF NOT EXISTS event_type text;

ALTER TABLE public.coupon_events ADD COLUMN IF NOT EXISTS campaign_id uuid;

ALTER TABLE public.coupon_events ADD COLUMN IF NOT EXISTS campaign_name text;

ALTER TABLE public.coupon_events ADD COLUMN IF NOT EXISTS voucher_token text;

ALTER TABLE public.coupon_events ADD COLUMN IF NOT EXISTS member_id uuid;

ALTER TABLE public.coupon_events ADD COLUMN IF NOT EXISTS member_phone text;

ALTER TABLE public.coupon_events ADD COLUMN IF NOT EXISTS store_id text;

ALTER TABLE public.coupon_events ADD COLUMN IF NOT EXISTS terminal_id text;

ALTER TABLE public.coupon_events ADD COLUMN IF NOT EXISTS staff_name text;

ALTER TABLE public.coupon_events ADD COLUMN IF NOT EXISTS staff_role text;

ALTER TABLE public.coupon_events ADD COLUMN IF NOT EXISTS sale_id text;

ALTER TABLE public.coupon_events ADD COLUMN IF NOT EXISTS note text;

ALTER TABLE public.coupon_events ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();

DO $$ BEGIN ALTER TABLE public.coupon_events ADD CONSTRAINT coupon_events_member_id_fkey FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE SET NULL; EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.coupon_events ADD CONSTRAINT coupon_events_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES coupon_campaigns(id) ON DELETE CASCADE; EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.coupon_events ADD CONSTRAINT coupon_events_event_type_check CHECK ((event_type = ANY (ARRAY['CLAIMED'::text, 'ISSUED_MANUAL'::text, 'REDEEMED'::text, 'BLOCKED'::text, 'DISABLED'::text, 'REENABLED'::text]))); EXCEPTION WHEN others THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS coupon_events_pkey ON public.coupon_events USING btree (id);

CREATE INDEX IF NOT EXISTS coupon_events_created_idx ON public.coupon_events USING btree (created_at DESC);

CREATE INDEX IF NOT EXISTS coupon_events_campaign_idx ON public.coupon_events USING btree (campaign_id);

CREATE TABLE IF NOT EXISTS public.issued_vouchers (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  token_slug text NOT NULL,
  campaign_id uuid NOT NULL,
  member_id uuid,
  status text DEFAULT 'ISSUED'::text NOT NULL,
  issued_at timestamp with time zone DEFAULT now() NOT NULL,
  expires_at timestamp with time zone,
  issued_by text,
  issued_source text DEFAULT 'PUBLIC'::text NOT NULL,
  redeemed_at timestamp with time zone,
  redeemed_by text,
  redeemed_sale_id text,
  disabled_at timestamp with time zone,
  disabled_by text,
  disable_reason text,
  store_id text,
  PRIMARY KEY (id)
);

ALTER TABLE public.issued_vouchers ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();

ALTER TABLE public.issued_vouchers ADD COLUMN IF NOT EXISTS token_slug text;

ALTER TABLE public.issued_vouchers ADD COLUMN IF NOT EXISTS campaign_id uuid;

ALTER TABLE public.issued_vouchers ADD COLUMN IF NOT EXISTS member_id uuid;

ALTER TABLE public.issued_vouchers ADD COLUMN IF NOT EXISTS status text DEFAULT 'ISSUED'::text;

ALTER TABLE public.issued_vouchers ADD COLUMN IF NOT EXISTS issued_at timestamp with time zone DEFAULT now();

ALTER TABLE public.issued_vouchers ADD COLUMN IF NOT EXISTS expires_at timestamp with time zone;

ALTER TABLE public.issued_vouchers ADD COLUMN IF NOT EXISTS issued_by text;

ALTER TABLE public.issued_vouchers ADD COLUMN IF NOT EXISTS issued_source text DEFAULT 'PUBLIC'::text;

ALTER TABLE public.issued_vouchers ADD COLUMN IF NOT EXISTS redeemed_at timestamp with time zone;

ALTER TABLE public.issued_vouchers ADD COLUMN IF NOT EXISTS redeemed_by text;

ALTER TABLE public.issued_vouchers ADD COLUMN IF NOT EXISTS redeemed_sale_id text;

ALTER TABLE public.issued_vouchers ADD COLUMN IF NOT EXISTS disabled_at timestamp with time zone;

ALTER TABLE public.issued_vouchers ADD COLUMN IF NOT EXISTS disabled_by text;

ALTER TABLE public.issued_vouchers ADD COLUMN IF NOT EXISTS disable_reason text;

ALTER TABLE public.issued_vouchers ADD COLUMN IF NOT EXISTS store_id text;

DO $$ BEGIN ALTER TABLE public.issued_vouchers ADD CONSTRAINT issued_vouchers_token_slug_key UNIQUE (token_slug); EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.issued_vouchers ADD CONSTRAINT issued_vouchers_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES coupon_campaigns(id) ON DELETE CASCADE; EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.issued_vouchers ADD CONSTRAINT issued_vouchers_member_id_fkey FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE SET NULL; EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.issued_vouchers ADD CONSTRAINT issued_vouchers_status_check CHECK ((status = ANY (ARRAY['ISSUED'::text, 'REDEEMED'::text, 'EXPIRED'::text, 'DISABLED'::text]))); EXCEPTION WHEN others THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS issued_vouchers_campaign_member_idx ON public.issued_vouchers USING btree (campaign_id, member_id);

CREATE INDEX IF NOT EXISTS issued_vouchers_member_idx ON public.issued_vouchers USING btree (member_id);

CREATE UNIQUE INDEX IF NOT EXISTS issued_vouchers_token_slug_key ON public.issued_vouchers USING btree (token_slug);

CREATE UNIQUE INDEX IF NOT EXISTS issued_vouchers_pkey ON public.issued_vouchers USING btree (id);

-- ---------- functions ----------
CREATE OR REPLACE FUNCTION public.coupon_claim(_slug text, _phone text, _full_name text DEFAULT NULL::text, _email text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
END $function$;

CREATE OR REPLACE FUNCTION public.coupon_events_readonly()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN RAISE EXCEPTION 'coupon_events is append-only'; END; $function$;

CREATE OR REPLACE FUNCTION public.coupon_issue_manual(_slug text, _phone text, _full_name text DEFAULT NULL::text, _expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone, _staff text DEFAULT NULL::text, _role text DEFAULT NULL::text, _store text DEFAULT NULL::text, _ignore_limit boolean DEFAULT false)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
END $function$;

CREATE OR REPLACE FUNCTION public.coupon_log(_type text, _campaign coupon_campaigns, _token text DEFAULT NULL::text, _member uuid DEFAULT NULL::uuid, _phone text DEFAULT NULL::text, _store text DEFAULT NULL::text, _terminal text DEFAULT NULL::text, _staff text DEFAULT NULL::text, _role text DEFAULT NULL::text, _sale text DEFAULT NULL::text, _note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  INSERT INTO public.coupon_events (
    event_type, campaign_id, campaign_name, voucher_token, member_id, member_phone,
    store_id, terminal_id, staff_name, staff_role, sale_id, note
  ) VALUES (
    _type, _campaign.id, _campaign.name, _token, _member, _phone,
    _store, _terminal, _staff, _role, _sale, _note
  );
$function$;

CREATE OR REPLACE FUNCTION public.voucher_by_token(_token text)
 RETURNS TABLE(voucher jsonb, campaign jsonb, member_name text, member_code text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT to_jsonb(v) - 'issued_by' - 'redeemed_by' - 'disabled_by',
         to_jsonb(c),
         coalesce(m.full_name, ''),
         coalesce(m.member_code, '')
  FROM public.issued_vouchers v
  JOIN public.coupon_campaigns c ON c.id = v.campaign_id
  LEFT JOIN public.members m ON m.id = v.member_id
  WHERE v.token_slug = _token
  LIMIT 1
$function$;

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

CREATE OR REPLACE FUNCTION public.voucher_set_status(_token text, _status text, _reason text DEFAULT NULL::text, _staff text DEFAULT NULL::text, _role text DEFAULT NULL::text, _store text DEFAULT NULL::text)
 RETURNS issued_vouchers
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
END $function$;

CREATE OR REPLACE FUNCTION public.voucher_token()
 RETURNS text
 LANGUAGE sql
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT 'vch_' || substr(encode(extensions.gen_random_bytes(8), 'hex'), 1, 10)
$function$;

-- ---------- triggers ----------
DROP TRIGGER IF EXISTS coupon_campaigns_set_updated_at ON public.coupon_campaigns;

CREATE TRIGGER coupon_campaigns_set_updated_at BEFORE UPDATE ON public.coupon_campaigns FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS coupon_events_no_change ON public.coupon_events;

CREATE TRIGGER coupon_events_no_change BEFORE DELETE OR UPDATE ON public.coupon_events FOR EACH ROW EXECUTE FUNCTION coupon_events_readonly();

-- ---------- grants (Data API access) ----------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coupon_campaigns TO authenticated;
GRANT ALL ON public.coupon_campaigns TO service_role;
GRANT SELECT ON public.coupon_campaigns TO anon;  -- public claim / storefront pages
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coupon_events TO authenticated;
GRANT ALL ON public.coupon_events TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.issued_vouchers TO authenticated;
GRANT ALL ON public.issued_vouchers TO service_role;
GRANT SELECT ON public.issued_vouchers TO anon;  -- public claim / storefront pages

-- ---------- row level security ----------
ALTER TABLE public.coupon_campaigns ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.coupon_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.issued_vouchers ENABLE ROW LEVEL SECURITY;

-- ---------- policies ----------
DROP POLICY IF EXISTS "campaigns managed by staff" ON public.coupon_campaigns;

CREATE POLICY "campaigns managed by staff" ON public.coupon_campaigns FOR ALL TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));

DROP POLICY IF EXISTS "campaigns readable" ON public.coupon_campaigns;

CREATE POLICY "campaigns readable" ON public.coupon_campaigns FOR SELECT TO anon,authenticated USING (true);

DROP POLICY IF EXISTS "coupon events readable by staff" ON public.coupon_events;

CREATE POLICY "coupon events readable by staff" ON public.coupon_events FOR SELECT TO authenticated USING (is_staff(auth.uid()));

DROP POLICY IF EXISTS "vouchers managed by staff" ON public.issued_vouchers;

CREATE POLICY "vouchers managed by staff" ON public.issued_vouchers FOR ALL TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));

DROP POLICY IF EXISTS "vouchers readable by staff" ON public.issued_vouchers;

CREATE POLICY "vouchers readable by staff" ON public.issued_vouchers FOR SELECT TO authenticated USING (is_staff(auth.uid()));

-- ---------- other ----------
-- ---------- functions ----------
CREATE OR REPLACE FUNCTION public.campaign_is_live(_c coupon_campaigns)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT _c.is_active
    AND (_c.starts_at IS NULL OR now() >= _c.starts_at)
    AND (_c.expires_at IS NULL OR now() <= _c.expires_at)
    AND (_c.max_claims IS NULL OR _c.claims_count < _c.max_claims)
$function$;

-- ---------- verification ----------
SELECT t.name AS table_name,
       CASE WHEN to_regclass('public.' || t.name) IS NULL THEN 'MISSING' ELSE 'OK' END AS status
FROM (VALUES ('coupon_campaigns'),('coupon_events'),('issued_vouchers')) AS t(name);
