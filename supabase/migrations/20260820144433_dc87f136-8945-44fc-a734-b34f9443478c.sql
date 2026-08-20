-- POS rules, manager override and held-order backend.
-- Reuses app_users (bcrypt PIN), audit_logs, held_orders and the existing
-- supervisor/visibility helpers. Only the per-branch rules store is new.

CREATE TABLE IF NOT EXISTS public.pos_store_settings (
  store_id text PRIMARY KEY,
  block_shift_close_on_hold boolean,
  require_daily_sales_for_shift_close boolean,
  require_counted_cash_on_close boolean,
  require_opening_float_count boolean,
  enable_blind_cash_count boolean,
  max_drawer_cash_limit numeric,
  require_reason_for_payout boolean,
  allow_multiple_shifts_per_terminal boolean,
  enable_cashier_x_report boolean,
  show_opening_float_at_close boolean,
  show_expected_totals_at_close boolean,
  show_live_variance_at_close boolean,
  show_itemized_tender_breakdown boolean,
  require_manager_pin_on_variance boolean,
  variance_pin_threshold numeric,
  max_cashier_discount_percent numeric,
  max_cart_discount_amount numeric,
  allow_discount_stacking boolean,
  require_reason_for_price_override boolean,
  prevent_below_cost_sale boolean,
  allow_tax_exemption boolean,
  prevent_negative_stock_sale boolean,
  require_receipt_for_refund boolean,
  require_manager_pin_for_refund boolean,
  max_refund_days_limit numeric,
  track_item_voids boolean,
  auto_lock_timeout_seconds numeric,
  require_manager_pin_for_cash_drawer_open boolean,
  enable_manager_pin_audit_log boolean,
  require_pin_void_cart boolean,
  require_pin_void_line boolean,
  require_pin_reduce_qty boolean,
  require_pin_manual_discount boolean,
  require_pin_price_override boolean,
  require_pin_stock_adjustment boolean,
  require_pin_shift_close boolean,
  require_pin_edit_tenders boolean,
  require_pin_terminal_reset boolean,
  row_version integer NOT NULL DEFAULT 1,
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.pos_store_settings TO authenticated;
GRANT ALL ON public.pos_store_settings TO service_role;

ALTER TABLE public.pos_store_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff read rules for visible branches" ON public.pos_store_settings;
CREATE POLICY "Staff read rules for visible branches"
  ON public.pos_store_settings FOR SELECT TO authenticated
  USING (public.store_visible(store_id));

DROP POLICY IF EXISTS "Supervisors write rules" ON public.pos_store_settings;
CREATE POLICY "Supervisors write rules"
  ON public.pos_store_settings FOR INSERT TO authenticated
  WITH CHECK (public.is_supervisor_now());

DROP POLICY IF EXISTS "Supervisors update rules" ON public.pos_store_settings;
CREATE POLICY "Supervisors update rules"
  ON public.pos_store_settings FOR UPDATE TO authenticated
  USING (public.is_supervisor_now())
  WITH CHECK (public.is_supervisor_now());

-- The shipped defaults, kept in one place so every routine agrees.
CREATE OR REPLACE FUNCTION public.pos_rules_defaults()
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT '{
    "block_shift_close_on_hold": true,
    "require_daily_sales_for_shift_close": true,
    "require_counted_cash_on_close": true,
    "require_opening_float_count": true,
    "enable_blind_cash_count": true,
    "max_drawer_cash_limit": 1000,
    "require_reason_for_payout": true,
    "allow_multiple_shifts_per_terminal": false,
    "enable_cashier_x_report": false,
    "show_opening_float_at_close": true,
    "show_expected_totals_at_close": false,
    "show_live_variance_at_close": false,
    "show_itemized_tender_breakdown": true,
    "require_manager_pin_on_variance": true,
    "variance_pin_threshold": 10,
    "max_cashier_discount_percent": 10,
    "max_cart_discount_amount": 100,
    "allow_discount_stacking": false,
    "require_reason_for_price_override": true,
    "prevent_below_cost_sale": true,
    "allow_tax_exemption": false,
    "prevent_negative_stock_sale": false,
    "require_receipt_for_refund": true,
    "require_manager_pin_for_refund": true,
    "max_refund_days_limit": 30,
    "track_item_voids": true,
    "auto_lock_timeout_seconds": 90,
    "require_manager_pin_for_cash_drawer_open": true,
    "enable_manager_pin_audit_log": true,
    "require_pin_void_cart": true,
    "require_pin_void_line": false,
    "require_pin_reduce_qty": false,
    "require_pin_manual_discount": true,
    "require_pin_price_override": true,
    "require_pin_stock_adjustment": true,
    "require_pin_shift_close": false,
    "require_pin_edit_tenders": false,
    "require_pin_terminal_reset": true
  }'::jsonb;
$$;

-- One row's set rules, with the bookkeeping columns removed.
CREATE OR REPLACE FUNCTION public.pos_rules_row(_store_id text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
  SELECT COALESCE(
    (SELECT jsonb_strip_nulls(to_jsonb(s))
            - 'store_id' - 'row_version' - 'updated_by' - 'updated_at'
       FROM public.pos_store_settings s
      WHERE s.store_id = COALESCE(btrim(_store_id), '')),
    '{}'::jsonb);
$$;

-- Effective rules: defaults, then the global row, then the branch row.
CREATE OR REPLACE FUNCTION public.pos_rules_get(_store_id text DEFAULT '')
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
  SELECT public.pos_rules_defaults()
         || public.pos_rules_row('')
         || CASE WHEN COALESCE(btrim(_store_id), '') = ''
                 THEN '{}'::jsonb ELSE public.pos_rules_row(_store_id) END;
$$;

-- Supervisor-only write. Unknown keys are ignored; a stale expected version
-- is refused so two supervisors cannot silently overwrite each other.
CREATE OR REPLACE FUNCTION public.pos_rules_save(
  _store_id text,
  _patch jsonb,
  _expected_version integer DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  sid text := COALESCE(btrim(_store_id), '');
  known jsonb := public.pos_rules_defaults();
  clean jsonb := '{}'::jsonb;
  k text;
  current_version integer;
  sets text;
BEGIN
  IF NOT public.is_supervisor_now() THEN
    RAISE EXCEPTION 'NOT_AUTHORISED: supervisors only' USING ERRCODE = '42501';
  END IF;

  FOR k IN SELECT jsonb_object_keys(COALESCE(_patch, '{}'::jsonb)) LOOP
    IF known ? k AND jsonb_typeof(_patch -> k) IN ('boolean', 'number') THEN
      clean := clean || jsonb_build_object(k, _patch -> k);
    END IF;
  END LOOP;

  IF clean = '{}'::jsonb THEN
    RAISE EXCEPTION 'NO_VALID_RULES: nothing recognised in the change' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.pos_store_settings(store_id) VALUES (sid)
    ON CONFLICT (store_id) DO NOTHING;

  SELECT row_version INTO current_version
    FROM public.pos_store_settings WHERE store_id = sid FOR UPDATE;

  IF _expected_version IS NOT NULL AND _expected_version <> current_version THEN
    RAISE EXCEPTION 'STALE_RULES: these rules were changed elsewhere (version %, expected %)',
      current_version, _expected_version USING ERRCODE = '40001';
  END IF;

  SELECT string_agg(format('%I = ($1 ->> %L)::%s', key, key,
           CASE WHEN jsonb_typeof(known -> key) = 'boolean' THEN 'boolean' ELSE 'numeric' END), ', ')
    INTO sets
    FROM jsonb_object_keys(clean) AS key;

  EXECUTE format(
    'UPDATE public.pos_store_settings SET %s, row_version = row_version + 1,
        updated_by = $2, updated_at = now() WHERE store_id = $3', sets)
    USING clean, COALESCE(auth.uid()::text, 'service'), sid;

  RETURN public.pos_rules_get(sid);
END $$;

-- Override audit. Reuses audit_logs; raises so a lost record is never silent.
CREATE OR REPLACE FUNCTION public.log_manager_override(
  _action text,
  _rule_key text DEFAULT NULL,
  _requested_by text DEFAULT NULL,
  _approved_by text DEFAULT NULL,
  _approved_role text DEFAULT NULL,
  _store_id text DEFAULT NULL,
  _terminal_id text DEFAULT NULL,
  _detail text DEFAULT NULL,
  _outcome text DEFAULT 'approved'
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE new_id uuid;
BEGIN
  IF COALESCE(btrim(_action), '') = '' THEN
    RAISE EXCEPTION 'ACTION_REQUIRED: an override needs an action' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.audit_logs(
    action_category, action_name, target_module, user_id, user_name, action, entity, details)
  VALUES (
    'override',
    btrim(_action),
    'pos',
    _approved_by,
    _approved_by,
    btrim(_action),
    COALESCE(_rule_key, btrim(_action)),
    jsonb_strip_nulls(jsonb_build_object(
      'rule_key', _rule_key,
      'requested_by', _requested_by,
      'approved_by', _approved_by,
      'approved_role', _approved_role,
      'store_id', _store_id,
      'terminal_id', _terminal_id,
      'outcome', COALESCE(NULLIF(btrim(_outcome), ''), 'approved'),
      'detail', left(COALESCE(_detail, ''), 400))))
  RETURNING id INTO new_id;
  RETURN new_id;
END $$;

-- Manager PIN check. Comparison stays in the database; the PIN is never
-- returned, logged or stored. Nothing comes back on any failure.
CREATE OR REPLACE FUNCTION public.verify_manager_pin(
  p_user_id text,
  p_pin text,
  p_action text DEFAULT NULL,
  p_rule_key text DEFAULT NULL,
  p_requested_by text DEFAULT NULL,
  p_store_id text DEFAULT NULL,
  p_terminal_id text DEFAULT NULL,
  p_detail text DEFAULT NULL
)
RETURNS TABLE(user_id text, full_name text, role app_role)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp', 'extensions' AS $$
DECLARE u public.app_users%rowtype;
BEGIN
  SELECT * INTO u FROM public.app_users a
   WHERE lower(a.user_id) = lower(btrim(p_user_id)) AND a.is_active;
  IF NOT FOUND THEN RETURN; END IF;

  IF NOT (u.role IN ('admin', 'manager')
          OR COALESCE((u.permissions ->> 'can_access_pos_settings')::boolean, false)
          OR COALESCE((u.permissions ->> 'can_manage_staff')::boolean, false)) THEN
    RETURN;
  END IF;

  IF u.pin_hash = '' OR u.pin_hash <> extensions.crypt(p_pin::text, u.pin_hash::text) THEN
    RETURN;
  END IF;

  IF COALESCE(btrim(p_action), '') <> '' THEN
    PERFORM public.log_manager_override(
      p_action, p_rule_key, p_requested_by, u.user_id::text, u.role::text,
      p_store_id, p_terminal_id, p_detail, 'approved');
  END IF;

  RETURN QUERY SELECT u.user_id::text, u.full_name::text, u.role;
END $$;

-- Open held tickets for a branch, within the caller's visible scope.
CREATE OR REPLACE FUNCTION public.held_orders_open_count(_store_id text DEFAULT '')
RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE sid text := COALESCE(btrim(_store_id), '');
BEGIN
  IF sid <> '' AND NOT public.store_visible(sid) THEN
    RAISE EXCEPTION 'NOT_AUTHORISED: this branch is not visible to you' USING ERRCODE = '42501';
  END IF;
  RETURN (
    SELECT count(*)::integer FROM public.held_orders h
     WHERE h.cancelled_from IS NULL
       AND (sid = '' OR COALESCE(h.store_id, '') = sid)
       AND (sid <> '' OR public.store_visible(COALESCE(h.store_id, '')))
  );
END $$;

-- Elevated routines are never reachable by a visitor.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('pos_rules_get', 'pos_rules_save', 'pos_rules_row',
                         'pos_rules_defaults', 'verify_manager_pin',
                         'log_manager_override', 'held_orders_open_count')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
  END LOOP;
END $$;

-- The global row must exist so branch rules always have a base to layer over.
INSERT INTO public.pos_store_settings(store_id) VALUES ('')
  ON CONFLICT (store_id) DO NOTHING;