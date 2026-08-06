-- ============================================================
-- 13_pos_rules.sql — database-backed POS operational rules,
-- manager override audit trail and the helper routines the app
-- uses to enforce them server-side.
-- Safe to run repeatedly: nothing is dropped destructively.
-- Requires: 00_extensions_and_enums.sql, 02_staff_and_access.sql
-- ============================================================

-- ---------- rules table ----------
CREATE TABLE IF NOT EXISTS public.pos_store_settings (
  store_id text NOT NULL DEFAULT '',           -- '' = global default row
  -- A · shift & cash
  block_shift_close_on_hold boolean NOT NULL DEFAULT true,
  require_daily_sales_for_shift_close boolean NOT NULL DEFAULT true,
  require_opening_float_count boolean NOT NULL DEFAULT true,
  enable_blind_cash_count boolean NOT NULL DEFAULT true,
  max_drawer_cash_limit numeric NOT NULL DEFAULT 1000,
  require_reason_for_payout boolean NOT NULL DEFAULT true,
  allow_multiple_shifts_per_terminal boolean NOT NULL DEFAULT false,
  -- B · discounts, pricing, overrides
  max_cashier_discount_percent numeric NOT NULL DEFAULT 10,
  max_cart_discount_amount numeric NOT NULL DEFAULT 100,
  allow_discount_stacking boolean NOT NULL DEFAULT false,
  require_reason_for_price_override boolean NOT NULL DEFAULT true,
  prevent_below_cost_sale boolean NOT NULL DEFAULT true,
  allow_tax_exemption boolean NOT NULL DEFAULT false,
  -- C · inventory, orders, refunds
  prevent_negative_stock_sale boolean NOT NULL DEFAULT false,
  require_receipt_for_refund boolean NOT NULL DEFAULT true,
  require_manager_pin_for_refund boolean NOT NULL DEFAULT true,
  max_refund_days_limit integer NOT NULL DEFAULT 30,
  track_item_voids boolean NOT NULL DEFAULT true,
  -- D · terminal security
  auto_lock_timeout_seconds integer NOT NULL DEFAULT 90,
  require_manager_pin_for_cash_drawer_open boolean NOT NULL DEFAULT true,
  enable_manager_pin_audit_log boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id)
);

DROP TRIGGER IF EXISTS pos_store_settings_touch ON public.pos_store_settings;
CREATE TRIGGER pos_store_settings_touch BEFORE UPDATE ON public.pos_store_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.pos_store_settings (store_id) VALUES ('')
ON CONFLICT (store_id) DO NOTHING;

GRANT SELECT ON public.pos_store_settings TO authenticated;
GRANT ALL ON public.pos_store_settings TO service_role;
ALTER TABLE public.pos_store_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff read pos rules" ON public.pos_store_settings;
CREATE POLICY "Staff read pos rules" ON public.pos_store_settings
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

-- ---------- manager override audit ----------
CREATE TABLE IF NOT EXISTS public.manager_override_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  action text NOT NULL,
  rule_key text,
  requested_by text,
  approved_by text,
  approved_role text,
  store_id text,
  terminal_id text,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

GRANT SELECT ON public.manager_override_events TO authenticated;
GRANT ALL ON public.manager_override_events TO service_role;
ALTER TABLE public.manager_override_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff read override log" ON public.manager_override_events;
CREATE POLICY "Staff read override log" ON public.manager_override_events
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
-- writes only happen through the security-definer routine below.

-- ---------- read the effective rule set ----------
DROP FUNCTION IF EXISTS public.pos_rules_get(text);
CREATE OR REPLACE FUNCTION public.pos_rules_get(_store_id text DEFAULT '')
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT coalesce(g.row, '{}'::jsonb) || coalesce(s.row, '{}'::jsonb)
  FROM (SELECT to_jsonb(p) - 'store_id' - 'created_at' - 'updated_at' AS row
          FROM public.pos_store_settings p WHERE p.store_id = '') g
  FULL JOIN (SELECT to_jsonb(p) - 'store_id' - 'created_at' - 'updated_at' AS row
          FROM public.pos_store_settings p
         WHERE coalesce(_store_id, '') <> '' AND p.store_id = coalesce(_store_id, '')) s
    ON true
$function$;

GRANT EXECUTE ON FUNCTION public.pos_rules_get(text) TO anon, authenticated, service_role;

-- ---------- supervisor-only write ----------
DROP FUNCTION IF EXISTS public.pos_rules_save(text, jsonb);
CREATE OR REPLACE FUNCTION public.pos_rules_save(_store_id text, _patch jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_store text := coalesce(_store_id, '');
  v_row public.pos_store_settings;
BEGIN
  IF NOT public.is_app_supervisor() THEN
    RAISE EXCEPTION 'Only supervisors can change POS rules';
  END IF;

  INSERT INTO public.pos_store_settings (store_id) VALUES (v_store)
  ON CONFLICT (store_id) DO NOTHING;

  SELECT * INTO v_row FROM public.pos_store_settings WHERE store_id = v_store;

  UPDATE public.pos_store_settings p
     SET (block_shift_close_on_hold, require_daily_sales_for_shift_close,
          require_opening_float_count, enable_blind_cash_count, max_drawer_cash_limit,
          require_reason_for_payout, allow_multiple_shifts_per_terminal,
          max_cashier_discount_percent, max_cart_discount_amount, allow_discount_stacking,
          require_reason_for_price_override, prevent_below_cost_sale, allow_tax_exemption,
          prevent_negative_stock_sale, require_receipt_for_refund,
          require_manager_pin_for_refund, max_refund_days_limit, track_item_voids,
          auto_lock_timeout_seconds, require_manager_pin_for_cash_drawer_open,
          enable_manager_pin_audit_log)
       = (
          coalesce((_patch->>'block_shift_close_on_hold')::boolean, p.block_shift_close_on_hold),
          coalesce((_patch->>'require_daily_sales_for_shift_close')::boolean, p.require_daily_sales_for_shift_close),
          coalesce((_patch->>'require_opening_float_count')::boolean, p.require_opening_float_count),
          coalesce((_patch->>'enable_blind_cash_count')::boolean, p.enable_blind_cash_count),
          coalesce((_patch->>'max_drawer_cash_limit')::numeric, p.max_drawer_cash_limit),
          coalesce((_patch->>'require_reason_for_payout')::boolean, p.require_reason_for_payout),
          coalesce((_patch->>'allow_multiple_shifts_per_terminal')::boolean, p.allow_multiple_shifts_per_terminal),
          coalesce((_patch->>'max_cashier_discount_percent')::numeric, p.max_cashier_discount_percent),
          coalesce((_patch->>'max_cart_discount_amount')::numeric, p.max_cart_discount_amount),
          coalesce((_patch->>'allow_discount_stacking')::boolean, p.allow_discount_stacking),
          coalesce((_patch->>'require_reason_for_price_override')::boolean, p.require_reason_for_price_override),
          coalesce((_patch->>'prevent_below_cost_sale')::boolean, p.prevent_below_cost_sale),
          coalesce((_patch->>'allow_tax_exemption')::boolean, p.allow_tax_exemption),
          coalesce((_patch->>'prevent_negative_stock_sale')::boolean, p.prevent_negative_stock_sale),
          coalesce((_patch->>'require_receipt_for_refund')::boolean, p.require_receipt_for_refund),
          coalesce((_patch->>'require_manager_pin_for_refund')::boolean, p.require_manager_pin_for_refund),
          coalesce((_patch->>'max_refund_days_limit')::integer, p.max_refund_days_limit),
          coalesce((_patch->>'track_item_voids')::boolean, p.track_item_voids),
          coalesce((_patch->>'auto_lock_timeout_seconds')::integer, p.auto_lock_timeout_seconds),
          coalesce((_patch->>'require_manager_pin_for_cash_drawer_open')::boolean, p.require_manager_pin_for_cash_drawer_open),
          coalesce((_patch->>'enable_manager_pin_audit_log')::boolean, p.enable_manager_pin_audit_log)
         )
   WHERE p.store_id = v_store;

  RETURN public.pos_rules_get(v_store);
END $function$;

GRANT EXECUTE ON FUNCTION public.pos_rules_save(text, jsonb) TO authenticated, service_role;

-- ---------- manager PIN verification (server-side only) ----------
DROP FUNCTION IF EXISTS public.verify_manager_pin(text, text);
CREATE OR REPLACE FUNCTION public.verify_manager_pin(p_user_id text, p_pin text)
RETURNS TABLE(user_id text, full_name text, role app_role)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE u public.app_users%rowtype;
BEGIN
  SELECT * INTO u FROM public.app_users a
   WHERE lower(a.user_id) = lower(trim(p_user_id)) AND a.is_active;
  IF NOT FOUND THEN RETURN; END IF;
  IF u.role NOT IN ('admin','manager') THEN RETURN; END IF;
  IF coalesce(u.pin_hash,'') = ''
     OR u.pin_hash <> extensions.crypt(p_pin::text, u.pin_hash::text) THEN RETURN; END IF;
  RETURN QUERY SELECT u.user_id::text, u.full_name::text, u.role;
END $function$;

GRANT EXECUTE ON FUNCTION public.verify_manager_pin(text, text) TO anon, authenticated, service_role;

-- ---------- override audit writer ----------
DROP FUNCTION IF EXISTS public.log_manager_override(text, text, text, text, text, text, text, text);
CREATE OR REPLACE FUNCTION public.log_manager_override(
  _action text, _rule_key text, _requested_by text, _approved_by text,
  _approved_role text, _store_id text, _terminal_id text, _detail text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  INSERT INTO public.manager_override_events
    (action, rule_key, requested_by, approved_by, approved_role, store_id, terminal_id, detail)
  VALUES (_action, _rule_key, _requested_by, _approved_by, _approved_role, _store_id, _terminal_id, _detail);
$function$;

GRANT EXECUTE ON FUNCTION public.log_manager_override(text, text, text, text, text, text, text, text)
  TO anon, authenticated, service_role;

-- ---------- held ticket count used by the shift-close gate ----------
DROP FUNCTION IF EXISTS public.held_orders_open_count(text);
CREATE OR REPLACE FUNCTION public.held_orders_open_count(_store_id text DEFAULT '')
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT count(*)::int FROM public.held_orders h
   WHERE coalesce(_store_id, '') = '' OR coalesce(h.store_id, '') = _store_id
$function$;

GRANT EXECUTE ON FUNCTION public.held_orders_open_count(text) TO anon, authenticated, service_role;

-- ---------- verification ----------
SELECT t.name AS table_name,
       CASE WHEN to_regclass('public.' || t.name) IS NULL THEN 'MISSING' ELSE 'OK' END AS status
FROM (VALUES ('pos_store_settings'),('manager_override_events')) AS t(name);