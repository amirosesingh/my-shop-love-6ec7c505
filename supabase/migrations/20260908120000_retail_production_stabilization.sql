-- Retail production stabilization: forward-only and safe for the existing database.
-- Canonical definitions intentionally appear after every historical migration.
BEGIN;

CREATE OR REPLACE FUNCTION public.pos_rules_get(_store_id text DEFAULT '')
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
  SELECT public.pos_rules_defaults()
         || public.pos_rules_row('')
         || CASE WHEN COALESCE(btrim(_store_id), '') = ''
                 THEN '{}'::jsonb ELSE public.pos_rules_row(_store_id) END;
$$;

CREATE OR REPLACE FUNCTION public.pos_rules_snapshot(_store_id text DEFAULT '')
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
  WITH requested AS (
    SELECT COALESCE(btrim(_store_id), '') AS store_id
  ), metadata AS (
    SELECT s.store_id, s.row_version, s.updated_at, s.updated_by
      FROM public.pos_store_settings s, requested r
     WHERE s.store_id = r.store_id
  )
  SELECT jsonb_build_object(
    'rules', public.pos_rules_get(r.store_id),
    'store_id', r.store_id,
    'row_version', COALESCE(m.row_version, 1),
    'updated_at', m.updated_at,
    'updated_by', m.updated_by
  )
    FROM requested r LEFT JOIN metadata m ON m.store_id = r.store_id
   WHERE auth.role() = 'service_role' OR r.store_id = '' OR public.store_visible(r.store_id);
$$;

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

CREATE OR REPLACE FUNCTION public.shift_expected_totals(p_shift uuid)
RETURNS TABLE (expected_cash numeric, expected_card numeric, expected_digital numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_float numeric := 0;
BEGIN
  SELECT coalesce(opening_float, 0) INTO v_float FROM public.shifts WHERE id = p_shift;
  RETURN QUERY
  WITH paid AS (
    SELECT
      CASE WHEN jsonb_typeof(s.payments) = 'array'
        THEN coalesce((SELECT sum((p ->> 'amount')::numeric) FROM jsonb_array_elements(s.payments) p
                        WHERE lower(coalesce(p ->> 'method','')) = 'cash'), 0)
        WHEN lower(coalesce(s.payment_type,'')) = 'cash' THEN coalesce(s.total_amount, 0) ELSE 0 END AS cash,
      CASE WHEN jsonb_typeof(s.payments) = 'array'
        THEN coalesce((SELECT sum((p ->> 'amount')::numeric) FROM jsonb_array_elements(s.payments) p
                        WHERE lower(coalesce(p ->> 'method','')) = 'card'), 0)
        WHEN lower(coalesce(s.payment_type,'')) = 'card' THEN coalesce(s.total_amount, 0) ELSE 0 END AS card,
      CASE WHEN jsonb_typeof(s.payments) = 'array'
        THEN coalesce((SELECT sum((p ->> 'amount')::numeric) FROM jsonb_array_elements(s.payments) p
                        WHERE lower(coalesce(p ->> 'method','')) IN ('wallet','transfer','qr','online','ewallet')), 0)
        WHEN lower(coalesce(s.payment_type,'')) IN ('wallet','transfer','qr','online','ewallet')
          THEN coalesce(s.total_amount, 0) ELSE 0 END AS digital
    FROM public.sales s
    WHERE s.shift_id = p_shift::text AND coalesce(s.is_refunded, false) = false
  )
  SELECT v_float + coalesce(sum(cash), 0), coalesce(sum(card), 0), coalesce(sum(digital), 0) FROM paid;
END $$;

CREATE OR REPLACE FUNCTION public.shift_log_event(
  p_shift uuid, p_event text, p_from text, p_to text, p_detail jsonb, p_terminal text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_store text; v_me record;
BEGIN
  SELECT store_id INTO v_store FROM public.shifts WHERE id = p_shift;
  SELECT * INTO v_me FROM public.current_app_user();
  PERFORM set_config('pos.shift_fn', 'on', true);
  INSERT INTO public.shift_close_events
    (shift_id, store_id, terminal_id, event, from_state, to_state, detail,
     actor_name, actor_staff_id, actor_user_id)
  VALUES (p_shift, coalesce(v_store,''), p_terminal, p_event, p_from, p_to,
          coalesce(p_detail,'{}'::jsonb), v_me.full_name, v_me.user_id, auth.uid());
  PERFORM set_config('pos.shift_fn', '', true);
END $$;

CREATE OR REPLACE FUNCTION public.shift_close_start(p_shift uuid, p_reason text, p_terminal text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v public.shifts%ROWTYPE; v_me record; v_reason text := btrim(coalesce(p_reason,''));
BEGIN
  IF NOT public.has_perm('can_close_shift') THEN
    RAISE EXCEPTION 'You do not have permission to close a shift.';
  END IF;
  IF v_reason = '' THEN RAISE EXCEPTION 'A reason for closing this shift is required.'; END IF;

  SELECT * INTO v FROM public.shifts WHERE id = p_shift FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'That shift no longer exists.'; END IF;
  IF NOT public.store_visible(v.store_id) THEN RAISE EXCEPTION 'That shift belongs to another branch.'; END IF;

  IF v.state <> 'ACTIVE' THEN
    -- Already closing: never go backwards, just report where it is.
    RETURN v.state;
  END IF;

  SELECT * INTO v_me FROM public.current_app_user();
  PERFORM set_config('pos.shift_fn', 'on', true);
  UPDATE public.shifts
     SET state = 'CASH_COUNT_REQUIRED',
         close_reason = v_reason,
         closing_started_at = now(),
         closing_started_by = coalesce(v_me.full_name, v.opened_by_name),
         updated_at = now()
   WHERE id = p_shift;
  PERFORM set_config('pos.shift_fn', '', true);

  PERFORM public.shift_log_event(p_shift, 'closing_started', 'ACTIVE', 'CASH_COUNT_REQUIRED',
                                 jsonb_build_object('reason', v_reason), p_terminal);
  RETURN 'CASH_COUNT_REQUIRED';
END $$;

CREATE OR REPLACE FUNCTION public.shift_reconcile_now(
  p_shift uuid, p_count_id uuid, p_cash numeric, p_card numeric, p_digital numeric)
RETURNS TABLE (state text, variance_status text) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v public.shifts%ROWTYPE; e record; v_rec uuid;
  v_var_cash numeric; v_var_card numeric; v_var_digital numeric; v_total numeric;
  v_status text; v_threshold numeric := 0; v_state text;
  v_store_name text; v_cashier text; v_terminal text; v_msg text;
BEGIN
  SELECT * INTO v FROM public.shifts WHERE id = p_shift;
  SELECT * INTO e FROM public.shift_expected_totals(p_shift);

  v_var_cash    := round(p_cash - e.expected_cash, 2);
  v_var_card    := CASE WHEN p_card IS NULL THEN NULL ELSE round(p_card - e.expected_card, 2) END;
  v_var_digital := CASE WHEN p_digital IS NULL THEN NULL ELSE round(p_digital - e.expected_digital, 2) END;
  v_total       := round(v_var_cash + coalesce(v_var_card,0) + coalesce(v_var_digital,0), 2);

  SELECT coalesce(abs((r ->> 'variance_pin_threshold')::numeric), 0) INTO v_threshold
    FROM public.pos_rules_get() AS r;
  IF v_threshold IS NULL THEN v_threshold := 0; END IF;

  v_status := CASE WHEN abs(v_total) <= 0.005 THEN 'NO_VARIANCE'
                   WHEN v_total > 0 THEN 'OVER' ELSE 'SHORT' END;

  -- The counted amount is final. A difference is recorded and reported, never
  -- a reason to keep the shift open.
  v_state := 'CLOSED';

  PERFORM set_config('pos.shift_fn', 'on', true);
  INSERT INTO public.shift_reconciliations
    (shift_id, store_id, count_id, expected_cash, expected_card, expected_digital,
     counted_cash, counted_card, counted_digital,
     variance_cash, variance_card, variance_digital, variance_total, variance_status)
  VALUES (p_shift, v.store_id, p_count_id, e.expected_cash, e.expected_card, e.expected_digital,
          p_cash, p_card, p_digital, v_var_cash, v_var_card, v_var_digital, v_total, v_status)
  RETURNING id INTO v_rec;

  UPDATE public.shifts
     SET state = v_state,
         status = 'CLOSED',
         closed_at = coalesce(closed_at, now()),
         final_counted_cash = p_cash,
         counted_cash = p_cash,
         closing_float = p_cash,
         counted_card = p_card,
         counted_digital = p_digital,
         variance_status = v_status,
         updated_at = now()
   WHERE id = p_shift;

  IF v_status <> 'NO_VARIANCE' THEN
    SELECT coalesce(nullif(btrim(name), ''), v.store_id) INTO v_store_name
      FROM public.stores WHERE id = v.store_id;
    v_store_name := coalesce(v_store_name, v.store_id, '');
    SELECT coalesce(nullif(btrim(counted_by_name), ''), v.opened_by_name, '')
      INTO v_cashier
      FROM public.shift_cash_counts WHERE id = p_count_id;
    v_cashier := coalesce(v_cashier, v.opened_by_name, '');
    v_terminal := coalesce(v.terminal_id, '');

    INSERT INTO public.shift_variance_alerts
      (shift_id, store_id, reconciliation_id, variance_total, variance_status, severity, message)
    VALUES (p_shift, v.store_id, v_rec, v_total, v_status,
            CASE WHEN abs(v_total) > v_threshold THEN 'critical' ELSE 'warning' END,
            format('Shift at %s closed %s by %s. Cashier %s, terminal %s. Expected %s, counted %s.',
                   v_store_name, lower(v_status), abs(v_total), v_cashier, v_terminal,
                   to_char(e.expected_cash, 'FM999999990.00'), to_char(p_cash, 'FM999999990.00')))
    ON CONFLICT (reconciliation_id) DO NOTHING;

    v_msg := format(
      E'Cashier: %s\nBranch: %s\nTerminal: %s\n\nExpected cash: %s\nCounted cash: %s\nVariance: %s\n\nType: Cash %s\nShift: %s',
      v_cashier, v_store_name, v_terminal,
      to_char(e.expected_cash, 'FM999999990.00'),
      to_char(p_cash, 'FM999999990.00'),
      CASE WHEN v_total > 0 THEN '+' ELSE '-' END || to_char(abs(v_total), 'FM999999990.00'),
      CASE WHEN v_total > 0 THEN 'Overage' ELSE 'Shortage' END,
      p_shift::text);

    -- The shared notification feed: one row per shift, so a replay of the
    -- close after an outage can never raise a second alert.
    INSERT INTO public.activity_events
      (event_type, severity, title, message, actor_name, terminal_id, store_id,
       branch_id, entity_type, entity_id, amount, meta, client_event_id, created_at)
    VALUES ('shift_cash_variance',
            CASE WHEN abs(v_total) > v_threshold THEN 'critical' ELSE 'warning' END,
            'Shift cash variance detected', v_msg, nullif(v_cashier, ''),
            nullif(v_terminal, ''), v.store_id, v.store_id, 'shift', p_shift::text, v_total,
            jsonb_build_object('expected_cash', e.expected_cash, 'counted_cash', p_cash,
                               'variance_total', v_total, 'variance_status', v_status,
                               'reconciliation_id', v_rec),
            'shift:' || p_shift::text || ':cash_variance', now())
    ON CONFLICT (client_event_id) DO NOTHING;
  END IF;
  PERFORM set_config('pos.shift_fn', '', true);

  PERFORM public.shift_log_event(p_shift, 'reconciled', 'CASH_COUNT_SUBMITTED', v_state,
    jsonb_build_object('variance_status', v_status, 'variance_total', v_total), v.terminal_id);


  RETURN QUERY SELECT v_state, v_status;
END $$;

CREATE OR REPLACE FUNCTION public.shift_cash_count_submit(
  p_shift uuid, p_cash numeric, p_card numeric DEFAULT NULL,
  p_digital numeric DEFAULT NULL, p_client_key text DEFAULT NULL, p_terminal text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
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
    RETURN v.state;  -- already counted: never accept a second original count
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
  RETURN v_res.state;  -- state only: never the variance
END $$;

CREATE OR REPLACE FUNCTION public.shift_recount_submit(
  p_shift uuid, p_cash numeric, p_reason text,
  p_card numeric DEFAULT NULL, p_digital numeric DEFAULT NULL, p_terminal text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
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

CREATE OR REPLACE FUNCTION public.shift_variance_approve(p_shift uuid, p_note text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v public.shifts%ROWTYPE;
BEGIN
  IF NOT public.has_perm('can_shift_variance_approve') THEN
    RAISE EXCEPTION 'You do not have permission to approve a shift variance.';
  END IF;
  SELECT * INTO v FROM public.shifts WHERE id = p_shift FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'That shift no longer exists.'; END IF;
  IF v.state = 'CLOSED' THEN RETURN 'CLOSED'; END IF;

  PERFORM set_config('pos.shift_fn', 'on', true);
  UPDATE public.shifts
     SET state = 'CLOSED', status = 'CLOSED', closed_at = coalesce(closed_at, now()), updated_at = now()
   WHERE id = p_shift;
  UPDATE public.shift_variance_alerts
     SET acknowledged_at = now(), acknowledged_by = (SELECT full_name FROM public.current_app_user()),
         updated_at = now()
   WHERE shift_id = p_shift AND acknowledged_at IS NULL;
  PERFORM set_config('pos.shift_fn', '', true);

  PERFORM public.shift_log_event(p_shift, 'variance_approved', v.state, 'CLOSED',
    jsonb_build_object('note', p_note), v.terminal_id);
  RETURN 'CLOSED';
END $$;

CREATE OR REPLACE FUNCTION public.shift_state(p_shift uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT state FROM public.shifts WHERE id = p_shift AND public.store_visible(store_id)
$$;

REVOKE ALL ON FUNCTION public.pos_rules_save(text, jsonb, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_rules_save(text, jsonb, integer) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.pos_rules_snapshot(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_rules_snapshot(text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.shift_reconcile_now(uuid, uuid, numeric, numeric, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.shift_reconcile_now(uuid, uuid, numeric, numeric, numeric) TO service_role;
COMMIT;
