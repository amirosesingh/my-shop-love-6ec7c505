-- ===========================================================================
-- Authorisation framework: per-user PINs, configurable sensitive actions,
-- approval requests and one consistent authorisation log.
-- ===========================================================================

-- --------------------------------------------------------------- PIN audit
ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS pin_set_at timestamptz;
ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS pin_updated_by text;

-- ------------------------------------------------------- authorization_actions
CREATE TABLE IF NOT EXISTS public.authorization_actions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  action_key text NOT NULL,
  scope_type text NOT NULL DEFAULT 'global',
  scope_id text NOT NULL DEFAULT '',
  mode text NOT NULL DEFAULT 'none',
  allowed_roles text[] NOT NULL DEFAULT ARRAY['admin','manager']::text[],
  allowed_user_ids text[] NOT NULL DEFAULT ARRAY[]::text[],
  require_reason boolean NOT NULL DEFAULT false,
  threshold numeric,
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS authorization_actions_scope_uidx
  ON public.authorization_actions (action_key, scope_type, scope_id);

GRANT SELECT ON public.authorization_actions TO authenticated;
GRANT ALL ON public.authorization_actions TO service_role;
ALTER TABLE public.authorization_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff read authorisation rules" ON public.authorization_actions;
CREATE POLICY "Staff read authorisation rules"
  ON public.authorization_actions FOR SELECT TO authenticated
  USING (scope_id = '' OR public.store_visible(scope_id));

-- ------------------------------------------------------ authorization_requests
CREATE TABLE IF NOT EXISTS public.authorization_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  action_key text NOT NULL,
  requested_by text NOT NULL,
  requested_by_name text NOT NULL DEFAULT '',
  store_id text NOT NULL DEFAULT '',
  terminal_id text NOT NULL DEFAULT '',
  reason text NOT NULL DEFAULT '',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  decided_by text,
  decided_by_name text,
  decided_at timestamptz,
  decision_note text,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS authorization_requests_status_idx
  ON public.authorization_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS authorization_requests_store_idx
  ON public.authorization_requests (store_id, created_at DESC);

GRANT SELECT ON public.authorization_requests TO authenticated;
GRANT ALL ON public.authorization_requests TO service_role;
ALTER TABLE public.authorization_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff read authorisation requests" ON public.authorization_requests;
CREATE POLICY "Staff read authorisation requests"
  ON public.authorization_requests FOR SELECT TO authenticated
  USING (store_id = '' OR public.store_visible(store_id));

-- ---------------------------------------------------------- authorization_log
CREATE TABLE IF NOT EXISTS public.authorization_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  action_key text NOT NULL,
  mode_used text NOT NULL,
  request_id uuid,
  requested_by text,
  authorized_by text,
  authorizer_role text,
  store_id text NOT NULL DEFAULT '',
  terminal_id text NOT NULL DEFAULT '',
  outcome text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS authorization_log_created_idx
  ON public.authorization_log (created_at DESC);
CREATE INDEX IF NOT EXISTS authorization_log_action_idx
  ON public.authorization_log (action_key, created_at DESC);

GRANT SELECT ON public.authorization_log TO authenticated;
GRANT ALL ON public.authorization_log TO service_role;
ALTER TABLE public.authorization_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff read authorisation log" ON public.authorization_log;
CREATE POLICY "Staff read authorisation log"
  ON public.authorization_log FOR SELECT TO authenticated
  USING (store_id = '' OR public.store_visible(store_id));

-- The log is evidence: it may never be edited or erased from the app.
CREATE OR REPLACE FUNCTION public.authorization_log_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp' AS $$
BEGIN
  RAISE EXCEPTION 'authorization_log is insert-only';
END $$;

DROP TRIGGER IF EXISTS authorization_log_no_change ON public.authorization_log;
CREATE TRIGGER authorization_log_no_change
  BEFORE UPDATE OR DELETE ON public.authorization_log
  FOR EACH ROW EXECUTE FUNCTION public.authorization_log_immutable();

-- --------------------------------------------------------------- timestamps
DROP TRIGGER IF EXISTS authorization_actions_touch ON public.authorization_actions;
CREATE TRIGGER authorization_actions_touch
  BEFORE UPDATE ON public.authorization_actions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS authorization_requests_touch ON public.authorization_requests;
CREATE TRIGGER authorization_requests_touch
  BEFORE UPDATE ON public.authorization_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ------------------------------------------------------------- PIN checking
-- Verifies a PIN against the people a rule allows. The PIN is compared inside
-- the database and never returned; nothing comes back on any failure.
CREATE OR REPLACE FUNCTION public.authorization_verify_pin(
  p_user_id text,
  p_pin text,
  p_allowed_roles text[] DEFAULT ARRAY['admin','manager']::text[],
  p_allowed_users text[] DEFAULT ARRAY[]::text[]
)
RETURNS TABLE(user_id text, full_name text, role app_role)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp', 'extensions' AS $$
DECLARE u public.app_users%rowtype;
BEGIN
  SELECT * INTO u FROM public.app_users a
   WHERE lower(a.user_id) = lower(btrim(p_user_id)) AND a.is_active;
  IF NOT FOUND THEN RETURN; END IF;

  IF NOT (
      u.role::text = ANY (COALESCE(p_allowed_roles, ARRAY[]::text[]))
      OR lower(u.user_id) = ANY (
           SELECT lower(x) FROM unnest(COALESCE(p_allowed_users, ARRAY[]::text[])) AS x)
  ) THEN
    RETURN;
  END IF;

  IF COALESCE(u.pin_hash, '') = ''
     OR u.pin_hash <> extensions.crypt(p_pin::text, u.pin_hash::text) THEN
    RETURN;
  END IF;

  RETURN QUERY SELECT u.user_id::text, u.full_name::text, u.role;
END $$;

-- Lets an administrator's own PIN be set for authorisation use.
CREATE OR REPLACE FUNCTION public.set_authorization_pin(
  p_user_id text,
  p_pin text,
  p_updated_by text DEFAULT NULL
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp', 'extensions' AS $$
BEGIN
  IF p_pin !~ '^[0-9]{4,8}$' THEN
    RAISE EXCEPTION 'A PIN must be 4 to 8 digits';
  END IF;
  UPDATE public.app_users
     SET pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf', 10)),
         pin_length = length(p_pin),
         pin_set_at = now(),
         pin_updated_by = p_updated_by,
         updated_at = now()
   WHERE lower(user_id) = lower(btrim(p_user_id));
  RETURN FOUND;
END $$;

-- Elevated routines are never reachable by a visitor.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('authorization_verify_pin', 'set_authorization_pin')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
  END LOOP;
END $$;

-- ------------------------------------------- starting rules from the old switches
INSERT INTO public.authorization_actions (action_key, scope_type, scope_id, mode, require_reason)
VALUES
  ('refund',                'global', '', 'pin',  true),
  ('void_cart',             'global', '', 'pin',  false),
  ('void_line',             'global', '', 'none', false),
  ('reduce_qty',            'global', '', 'none', false),
  ('manual_discount',       'global', '', 'pin',  false),
  ('discount_over_limit',   'global', '', 'pin',  true),
  ('price_override',        'global', '', 'pin',  true),
  ('below_cost_sale',       'global', '', 'pin',  true),
  ('tax_exemption',         'global', '', 'pin',  true),
  ('no_sale_drawer',        'global', '', 'pin',  true),
  ('stock_adjustment',      'global', '', 'pin',  false),
  ('shift_close',           'global', '', 'none', false),
  ('shift_close_variance',  'global', '', 'pin',  true),
  ('edit_tenders',          'global', '', 'none', false),
  ('terminal_unpair',       'global', '', 'pin',  true),
  ('edit_posted_stock',     'global', '', 'either', true),
  ('edit_posted_purchase',  'global', '', 'either', true),
  ('discard_draft',         'global', '', 'none', true),
  ('delete_product',        'global', '', 'pin',  true),
  ('member_points_adjust',  'global', '', 'pin',  true)
ON CONFLICT (action_key, scope_type, scope_id) DO NOTHING;