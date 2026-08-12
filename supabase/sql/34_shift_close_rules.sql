-- ============================================================
-- 34_shift_close_rules.sql — X-report access control and the
-- shift-close (Z report) screen visibility rules.
-- Safe to run repeatedly.
-- Requires: 13_pos_rules.sql
-- ============================================================

ALTER TABLE public.pos_store_settings
  ADD COLUMN IF NOT EXISTS enable_cashier_x_report boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_opening_float_at_close boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_expected_totals_at_close boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_live_variance_at_close boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_itemized_tender_breakdown boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS require_manager_pin_on_variance boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS variance_pin_threshold numeric NOT NULL DEFAULT 10;

-- Column-by-column form so new rules never break the ordering of the old
-- multi-column assignment.
CREATE OR REPLACE FUNCTION public.pos_rules_save(_store_id text, _patch jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_store text := coalesce(_store_id, '');
BEGIN
  IF NOT public.is_app_supervisor() THEN
    RAISE EXCEPTION 'Only supervisors can change POS rules';
  END IF;

  INSERT INTO public.pos_store_settings (store_id) VALUES (v_store)
  ON CONFLICT (store_id) DO NOTHING;

  UPDATE public.pos_store_settings p
     SET block_shift_close_on_hold = coalesce((_patch->>'block_shift_close_on_hold')::boolean, p.block_shift_close_on_hold),
         require_daily_sales_for_shift_close = coalesce((_patch->>'require_daily_sales_for_shift_close')::boolean, p.require_daily_sales_for_shift_close),
         require_counted_cash_on_close = coalesce((_patch->>'require_counted_cash_on_close')::boolean, p.require_counted_cash_on_close),
         require_opening_float_count = coalesce((_patch->>'require_opening_float_count')::boolean, p.require_opening_float_count),
         enable_blind_cash_count = coalesce((_patch->>'enable_blind_cash_count')::boolean, p.enable_blind_cash_count),
         max_drawer_cash_limit = coalesce((_patch->>'max_drawer_cash_limit')::numeric, p.max_drawer_cash_limit),
         require_reason_for_payout = coalesce((_patch->>'require_reason_for_payout')::boolean, p.require_reason_for_payout),
         allow_multiple_shifts_per_terminal = coalesce((_patch->>'allow_multiple_shifts_per_terminal')::boolean, p.allow_multiple_shifts_per_terminal),
         max_cashier_discount_percent = coalesce((_patch->>'max_cashier_discount_percent')::numeric, p.max_cashier_discount_percent),
         max_cart_discount_amount = coalesce((_patch->>'max_cart_discount_amount')::numeric, p.max_cart_discount_amount),
         allow_discount_stacking = coalesce((_patch->>'allow_discount_stacking')::boolean, p.allow_discount_stacking),
         require_reason_for_price_override = coalesce((_patch->>'require_reason_for_price_override')::boolean, p.require_reason_for_price_override),
         prevent_below_cost_sale = coalesce((_patch->>'prevent_below_cost_sale')::boolean, p.prevent_below_cost_sale),
         allow_tax_exemption = coalesce((_patch->>'allow_tax_exemption')::boolean, p.allow_tax_exemption),
         prevent_negative_stock_sale = coalesce((_patch->>'prevent_negative_stock_sale')::boolean, p.prevent_negative_stock_sale),
         require_receipt_for_refund = coalesce((_patch->>'require_receipt_for_refund')::boolean, p.require_receipt_for_refund),
         require_manager_pin_for_refund = coalesce((_patch->>'require_manager_pin_for_refund')::boolean, p.require_manager_pin_for_refund),
         max_refund_days_limit = coalesce((_patch->>'max_refund_days_limit')::integer, p.max_refund_days_limit),
         track_item_voids = coalesce((_patch->>'track_item_voids')::boolean, p.track_item_voids),
         auto_lock_timeout_seconds = coalesce((_patch->>'auto_lock_timeout_seconds')::integer, p.auto_lock_timeout_seconds),
         require_manager_pin_for_cash_drawer_open = coalesce((_patch->>'require_manager_pin_for_cash_drawer_open')::boolean, p.require_manager_pin_for_cash_drawer_open),
         enable_manager_pin_audit_log = coalesce((_patch->>'enable_manager_pin_audit_log')::boolean, p.enable_manager_pin_audit_log),
         enable_cashier_x_report = coalesce((_patch->>'enable_cashier_x_report')::boolean, p.enable_cashier_x_report),
         show_opening_float_at_close = coalesce((_patch->>'show_opening_float_at_close')::boolean, p.show_opening_float_at_close),
         show_expected_totals_at_close = coalesce((_patch->>'show_expected_totals_at_close')::boolean, p.show_expected_totals_at_close),
         show_live_variance_at_close = coalesce((_patch->>'show_live_variance_at_close')::boolean, p.show_live_variance_at_close),
         show_itemized_tender_breakdown = coalesce((_patch->>'show_itemized_tender_breakdown')::boolean, p.show_itemized_tender_breakdown),
         require_manager_pin_on_variance = coalesce((_patch->>'require_manager_pin_on_variance')::boolean, p.require_manager_pin_on_variance),
         variance_pin_threshold = coalesce((_patch->>'variance_pin_threshold')::numeric, p.variance_pin_threshold)
   WHERE p.store_id = v_store;

  RETURN public.pos_rules_get(v_store);
END $function$;

REVOKE ALL ON FUNCTION public.pos_rules_save(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_rules_save(text, jsonb) TO authenticated, service_role;