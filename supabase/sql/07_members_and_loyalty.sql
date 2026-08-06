-- ============================================================
-- 07_members_and_loyalty.sql — Membership, tiers and promotions
-- Lucky Charms POS. Safe to run repeatedly: nothing is dropped.
-- Requires: 00_extensions_and_enums.sql, then 02_staff_and_access.sql
-- (row level security policies below call is_staff() / is_app_supervisor()).
-- ============================================================

-- ---------- tables, columns and indexes ----------
CREATE TABLE IF NOT EXISTS public.members (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  member_code text NOT NULL,
  full_name text NOT NULL,
  phone text NOT NULL,
  email text,
  address text,
  date_of_birth date,
  tier_id uuid,
  loyalty_points numeric DEFAULT 0 NOT NULL,
  total_spent numeric DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

ALTER TABLE public.members ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();

ALTER TABLE public.members ADD COLUMN IF NOT EXISTS member_code text;

ALTER TABLE public.members ADD COLUMN IF NOT EXISTS full_name text;

ALTER TABLE public.members ADD COLUMN IF NOT EXISTS phone text;

ALTER TABLE public.members ADD COLUMN IF NOT EXISTS email text;

ALTER TABLE public.members ADD COLUMN IF NOT EXISTS address text;

ALTER TABLE public.members ADD COLUMN IF NOT EXISTS date_of_birth date;

ALTER TABLE public.members ADD COLUMN IF NOT EXISTS tier_id uuid;

ALTER TABLE public.members ADD COLUMN IF NOT EXISTS loyalty_points numeric DEFAULT 0;

ALTER TABLE public.members ADD COLUMN IF NOT EXISTS total_spent numeric DEFAULT 0;

ALTER TABLE public.members ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();

DO $$ BEGIN ALTER TABLE public.members ADD CONSTRAINT members_phone_key UNIQUE (phone); EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.members ADD CONSTRAINT members_member_code_key UNIQUE (member_code); EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.members ADD CONSTRAINT members_tier_id_fkey FOREIGN KEY (tier_id) REFERENCES membership_tiers(id) ON DELETE SET NULL; EXCEPTION WHEN others THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS members_member_code_key ON public.members USING btree (member_code);

CREATE UNIQUE INDEX IF NOT EXISTS members_pkey ON public.members USING btree (id);

CREATE UNIQUE INDEX IF NOT EXISTS members_phone_key ON public.members USING btree (phone);

CREATE TABLE IF NOT EXISTS public.membership_tiers (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  discount_percentage numeric DEFAULT 0 NOT NULL,
  points_multiplier numeric DEFAULT 1.0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

ALTER TABLE public.membership_tiers ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();

ALTER TABLE public.membership_tiers ADD COLUMN IF NOT EXISTS name text;

ALTER TABLE public.membership_tiers ADD COLUMN IF NOT EXISTS discount_percentage numeric DEFAULT 0;

ALTER TABLE public.membership_tiers ADD COLUMN IF NOT EXISTS points_multiplier numeric DEFAULT 1.0;

ALTER TABLE public.membership_tiers ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();

DO $$ BEGIN ALTER TABLE public.membership_tiers ADD CONSTRAINT membership_tiers_name_key UNIQUE (name); EXCEPTION WHEN others THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS membership_tiers_name_key ON public.membership_tiers USING btree (name);

CREATE UNIQUE INDEX IF NOT EXISTS membership_tiers_pkey ON public.membership_tiers USING btree (id);

CREATE TABLE IF NOT EXISTS public.promotions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  title text NOT NULL,
  promo_type text NOT NULL,
  min_spend numeric DEFAULT 0 NOT NULL,
  discount_percent numeric DEFAULT 0 NOT NULL,
  discount_amount numeric DEFAULT 0 NOT NULL,
  foc_product_id uuid,
  points_per_dollar numeric DEFAULT 1 NOT NULL,
  tier_rates jsonb,
  is_active boolean DEFAULT true NOT NULL,
  start_date date,
  end_date date,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();

ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS title text;

ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS promo_type text;

ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS min_spend numeric DEFAULT 0;

ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS discount_percent numeric DEFAULT 0;

ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS discount_amount numeric DEFAULT 0;

ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS foc_product_id uuid;

ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS points_per_dollar numeric DEFAULT 1;

ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS tier_rates jsonb;

ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS start_date date;

ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS end_date date;

ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();

DO $$ BEGIN ALTER TABLE public.promotions ADD CONSTRAINT promotions_foc_product_id_fkey FOREIGN KEY (foc_product_id) REFERENCES products(id) ON DELETE SET NULL; EXCEPTION WHEN others THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS promotions_pkey ON public.promotions USING btree (id);

-- ---------- functions ----------
-- ── Safe re-run guard ─────────────────────────────────────────────────────
-- Postgres refuses CREATE OR REPLACE when a function's return type changed.
-- Drop any stale overload of the routines defined below first. Each drop is
-- attempted on its own, so a routine still referenced by a policy or trigger
-- is simply left in place instead of aborting the whole file.
DO $guard$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace
       AND p.proname = ANY (ARRAY[
      'member_join',
      'member_welcome_claim',
      'normalize_phone'
       ])
  LOOP
    BEGIN
      EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
END $guard$;

CREATE OR REPLACE FUNCTION public.member_join(_phone text, _full_name text, _email text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
END $function$;

CREATE OR REPLACE FUNCTION public.member_welcome_claim(_phone text, _full_name text, _email text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
END $function$;

CREATE OR REPLACE FUNCTION public.normalize_phone(_phone text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT regexp_replace(coalesce(_phone, ''), '[^0-9]', '', 'g')
$function$;

-- ---------- grants (Data API access) ----------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.members TO authenticated;
GRANT ALL ON public.members TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.membership_tiers TO authenticated;
GRANT ALL ON public.membership_tiers TO service_role;
GRANT SELECT ON public.membership_tiers TO anon;  -- public claim / storefront pages
GRANT SELECT, INSERT, UPDATE, DELETE ON public.promotions TO authenticated;
GRANT ALL ON public.promotions TO service_role;
GRANT SELECT ON public.promotions TO anon;  -- public claim / storefront pages

-- ---------- row level security ----------
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.membership_tiers ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;

-- ---------- policies ----------
DROP POLICY IF EXISTS "Staff can delete" ON public.members;

CREATE POLICY "Staff can delete" ON public.members FOR DELETE TO authenticated USING (is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff can insert" ON public.members;

CREATE POLICY "Staff can insert" ON public.members FOR INSERT TO authenticated WITH CHECK (is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff can read members" ON public.members;

CREATE POLICY "Staff can read members" ON public.members FOR SELECT TO authenticated USING (is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff can update" ON public.members;

CREATE POLICY "Staff can update" ON public.members FOR UPDATE TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff can delete" ON public.membership_tiers;

CREATE POLICY "Staff can delete" ON public.membership_tiers FOR DELETE TO authenticated USING (is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff can insert" ON public.membership_tiers;

CREATE POLICY "Staff can insert" ON public.membership_tiers FOR INSERT TO authenticated WITH CHECK (is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff can read membership tiers" ON public.membership_tiers;

CREATE POLICY "Staff can read membership tiers" ON public.membership_tiers FOR SELECT TO authenticated USING (is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff can update" ON public.membership_tiers;

CREATE POLICY "Staff can update" ON public.membership_tiers FOR UPDATE TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff can delete" ON public.promotions;

CREATE POLICY "Staff can delete" ON public.promotions FOR DELETE TO authenticated USING (is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff can insert" ON public.promotions;

CREATE POLICY "Staff can insert" ON public.promotions FOR INSERT TO authenticated WITH CHECK (is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff can read promotions" ON public.promotions;

CREATE POLICY "Staff can read promotions" ON public.promotions FOR SELECT TO authenticated USING (is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff can update" ON public.promotions;

CREATE POLICY "Staff can update" ON public.promotions FOR UPDATE TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));

-- ---------- verification ----------
SELECT t.name AS table_name,
       CASE WHEN to_regclass('public.' || t.name) IS NULL THEN 'MISSING' ELSE 'OK' END AS status
FROM (VALUES ('members'),('membership_tiers'),('promotions')) AS t(name);
