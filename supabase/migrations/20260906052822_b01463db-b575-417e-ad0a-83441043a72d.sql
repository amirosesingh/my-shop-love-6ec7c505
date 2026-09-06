CREATE OR REPLACE FUNCTION public.shift_cash_count_submit(
  p_shift uuid, p_cash numeric, p_card numeric DEFAULT NULL,
  p_digital numeric DEFAULT NULL, p_client_key text DEFAULT NULL, p_terminal text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.shifts%ROWTYPE; v_me record; v_count uuid; v_res record;
BEGIN
  IF NOT (public.has_perm('can_shift_cash_count') OR public.has_perm('can_close_shift')) THEN
    RAISE EXCEPTION 'You do not have permission to submit a cash count.';
  END IF;
  IF p_cash IS NULL OR p_cash < 0 THEN RAISE EXCEPTION 'Enter the cash counted in the drawer.'; END IF;
  IF p_card IS NOT NULL AND p_card < 0 THEN RAISE EXCEPTION 'The card total counted cannot be negative.'; END IF;
  IF p_digital IS NOT NULL AND p_digital < 0 THEN RAISE EXCEPTION 'The digital total counted cannot be negative.'; END IF;

  SELECT * INTO v FROM public.shifts WHERE id = p_shift FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'That shift no longer exists.'; END IF;
  IF NOT public.store_visible(v.store_id) THEN RAISE EXCEPTION 'That shift belongs to another branch.'; END IF;
  IF v.state = 'ACTIVE' THEN RAISE EXCEPTION 'Start the closing process before counting the drawer.'; END IF;
  IF v.state NOT IN ('CLOSING_STARTED','CASH_COUNT_REQUIRED') THEN
    RETURN v.state;
  END IF;

  SELECT * INTO v_me FROM public.current_app_user();
  PERFORM set_config('pos.shift_fn', 'on', true);
  INSERT INTO public.shift_cash_counts
    (shift_id, store_id, terminal_id, kind, counted_cash, counted_card, counted_digital,
     reason, counted_by_name, counted_by_staff_id, counted_by_user_id, client_key)
  VALUES (p_shift, v.store_id, coalesce(p_terminal, v.terminal_id), 'ORIGINAL',
          round(p_cash, 2), round(p_card, 2), round(p_digital, 2), v.close_reason,
          coalesce(v_me.full_name, v.opened_by_name), v_me.user_id, auth.uid(), p_client_key)
  ON CONFLICT (shift_id) WHERE kind = 'ORIGINAL' DO NOTHING
  RETURNING id INTO v_count;

  UPDATE public.shifts SET state = 'CASH_COUNT_SUBMITTED', updated_at = now() WHERE id = p_shift;
  PERFORM set_config('pos.shift_fn', '', true);

  IF v_count IS NULL THEN
    SELECT id INTO v_count FROM public.shift_cash_counts
      WHERE shift_id = p_shift AND kind = 'ORIGINAL' LIMIT 1;
  END IF;

  PERFORM public.shift_log_event(p_shift, 'cash_count_submitted', 'CASH_COUNT_REQUIRED',
    'CASH_COUNT_SUBMITTED', jsonb_build_object('count_id', v_count), p_terminal);

  SELECT * INTO v_res FROM public.shift_reconcile_now(p_shift, v_count, round(p_cash,2), round(p_card,2), round(p_digital,2));
  RETURN v_res.state;
END $$;
GRANT EXECUTE ON FUNCTION public.shift_cash_count_submit(uuid, numeric, numeric, numeric, text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.shift_recount_submit(
  p_shift uuid, p_cash numeric, p_reason text,
  p_card numeric DEFAULT NULL, p_digital numeric DEFAULT NULL, p_terminal text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.shifts%ROWTYPE; v_me record; v_count uuid; v_res record; v_reason text := btrim(coalesce(p_reason,''));
BEGIN
  IF NOT public.has_perm('can_shift_cash_recount') THEN
    RAISE EXCEPTION 'You do not have permission to recount a drawer.';
  END IF;
  IF v_reason = '' THEN RAISE EXCEPTION 'A reason for the recount is required.'; END IF;
  IF p_cash IS NULL OR p_cash < 0 THEN RAISE EXCEPTION 'Enter the recounted cash amount.'; END IF;
  IF p_card IS NOT NULL AND p_card < 0 THEN RAISE EXCEPTION 'The card total counted cannot be negative.'; END IF;
  IF p_digital IS NOT NULL AND p_digital < 0 THEN RAISE EXCEPTION 'The digital total counted cannot be negative.'; END IF;

  SELECT * INTO v FROM public.shifts WHERE id = p_shift FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'That shift no longer exists.'; END IF;
  IF NOT public.store_visible(v.store_id) THEN RAISE EXCEPTION 'That shift belongs to another branch.'; END IF;
  IF v.state NOT IN ('VARIANCE_REVIEW_REQUIRED','RECONCILIATION','CLOSED') THEN
    RAISE EXCEPTION 'This shift has not been counted yet.';
  END IF;

  SELECT * INTO v_me FROM public.current_app_user();
  PERFORM set_config('pos.shift_fn', 'on', true);
  INSERT INTO public.shift_cash_counts
    (shift_id, store_id, terminal_id, kind, counted_cash, counted_card, counted_digital,
     reason, counted_by_name, counted_by_staff_id, counted_by_user_id)
  VALUES (p_shift, v.store_id, coalesce(p_terminal, v.terminal_id), 'RECOUNT',
          round(p_cash,2), round(p_card,2), round(p_digital,2), v_reason,
          v_me.full_name, v_me.user_id, auth.uid())
  RETURNING id INTO v_count;
  PERFORM set_config('pos.shift_fn', '', true);

  PERFORM public.shift_log_event(p_shift, 'recount_submitted', v.state, v.state,
    jsonb_build_object('reason', v_reason, 'count_id', v_count), p_terminal);

  SELECT * INTO v_res FROM public.shift_reconcile_now(p_shift, v_count, round(p_cash,2), round(p_card,2), round(p_digital,2));
  RETURN v_res.state;
END $$;
GRANT EXECUTE ON FUNCTION public.shift_recount_submit(uuid, numeric, text, numeric, numeric, text) TO authenticated, service_role;