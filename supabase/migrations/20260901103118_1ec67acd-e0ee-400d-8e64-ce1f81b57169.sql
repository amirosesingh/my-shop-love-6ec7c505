-- ============================================================
-- Secure shift closing — Stage 1: authoritative state & audit
-- ============================================================

/* ---------- 1. shifts: closing state ---------- */
ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS state text NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS close_reason text,
  ADD COLUMN IF NOT EXISTS closing_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS closing_started_by text,
  ADD COLUMN IF NOT EXISTS final_counted_cash numeric,
  ADD COLUMN IF NOT EXISTS variance_status text;

DO $$ BEGIN
  ALTER TABLE public.shifts ADD CONSTRAINT shifts_state_chk CHECK (state IN
    ('ACTIVE','CLOSING_STARTED','CASH_COUNT_REQUIRED','CASH_COUNT_SUBMITTED',
     'RECONCILIATION','VARIANCE_REVIEW_REQUIRED','CLOSED'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

UPDATE public.shifts SET state = CASE WHEN status = 'CLOSED' THEN 'CLOSED' ELSE 'ACTIVE' END
 WHERE state IS DISTINCT FROM (CASE WHEN status = 'CLOSED' THEN 'CLOSED' ELSE 'ACTIVE' END);

/* ---------- 2. immutable cash counts ---------- */
CREATE TABLE IF NOT EXISTS public.shift_cash_counts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id uuid NOT NULL REFERENCES public.shifts(id) ON DELETE CASCADE,
  store_id text NOT NULL,
  terminal_id text,
  kind text NOT NULL DEFAULT 'ORIGINAL',
  counted_cash numeric NOT NULL,
  counted_card numeric,
  counted_digital numeric,
  reason text,
  counted_by_name text,
  counted_by_staff_id text,
  counted_by_user_id uuid,
  client_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shift_cash_counts_kind_chk CHECK (kind IN ('ORIGINAL','RECOUNT'))
);
CREATE UNIQUE INDEX IF NOT EXISTS shift_cash_counts_original_uidx
  ON public.shift_cash_counts (shift_id) WHERE kind = 'ORIGINAL';
CREATE UNIQUE INDEX IF NOT EXISTS shift_cash_counts_client_key_uidx
  ON public.shift_cash_counts (client_key) WHERE client_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS shift_cash_counts_shift_idx ON public.shift_cash_counts (shift_id, created_at);

GRANT SELECT ON public.shift_cash_counts TO authenticated;
GRANT ALL ON public.shift_cash_counts TO service_role;
ALTER TABLE public.shift_cash_counts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff read shift cash counts" ON public.shift_cash_counts;
CREATE POLICY "Staff read shift cash counts" ON public.shift_cash_counts
  FOR SELECT TO authenticated
  USING (public.is_staff_now() AND public.store_visible(store_id));

/* ---------- 3. append-only closing audit ---------- */
CREATE TABLE IF NOT EXISTS public.shift_close_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id uuid NOT NULL REFERENCES public.shifts(id) ON DELETE CASCADE,
  store_id text NOT NULL,
  terminal_id text,
  event text NOT NULL,
  from_state text,
  to_state text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_name text,
  actor_staff_id text,
  actor_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS shift_close_events_shift_idx ON public.shift_close_events (shift_id, created_at);

GRANT SELECT ON public.shift_close_events TO authenticated;
GRANT ALL ON public.shift_close_events TO service_role;
ALTER TABLE public.shift_close_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff read shift close events" ON public.shift_close_events;
CREATE POLICY "Staff read shift close events" ON public.shift_close_events
  FOR SELECT TO authenticated
  USING (public.is_staff_now() AND public.store_visible(store_id));

/* ---------- 4. private reconciliation (expected cash / variance) ---------- */
CREATE TABLE IF NOT EXISTS public.shift_reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id uuid NOT NULL REFERENCES public.shifts(id) ON DELETE CASCADE,
  store_id text NOT NULL,
  count_id uuid REFERENCES public.shift_cash_counts(id) ON DELETE SET NULL,
  expected_cash numeric NOT NULL DEFAULT 0,
  expected_card numeric NOT NULL DEFAULT 0,
  expected_digital numeric NOT NULL DEFAULT 0,
  counted_cash numeric,
  counted_card numeric,
  counted_digital numeric,
  variance_cash numeric,
  variance_card numeric,
  variance_digital numeric,
  variance_total numeric,
  variance_status text NOT NULL DEFAULT 'NO_VARIANCE',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS shift_reconciliations_shift_idx ON public.shift_reconciliations (shift_id, created_at);

GRANT SELECT ON public.shift_reconciliations TO authenticated;
GRANT ALL ON public.shift_reconciliations TO service_role;
ALTER TABLE public.shift_reconciliations ENABLE ROW LEVEL SECURITY;

-- Only staff explicitly granted the variance permission may read expected cash.
DROP POLICY IF EXISTS "Variance viewers read reconciliations" ON public.shift_reconciliations;
CREATE POLICY "Variance viewers read reconciliations" ON public.shift_reconciliations
  FOR SELECT TO authenticated
  USING (public.has_perm('can_shift_variance_view') AND public.store_visible(store_id));

/* ---------- 5. variance alerts ---------- */
CREATE TABLE IF NOT EXISTS public.shift_variance_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id uuid NOT NULL REFERENCES public.shifts(id) ON DELETE CASCADE,
  store_id text NOT NULL,
  reconciliation_id uuid REFERENCES public.shift_reconciliations(id) ON DELETE SET NULL,
  variance_total numeric NOT NULL,
  variance_status text NOT NULL,
  severity text NOT NULL DEFAULT 'warning',
  message text NOT NULL,
  delivery_status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  last_attempt_at timestamptz,
  acknowledged_at timestamptz,
  acknowledged_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS shift_variance_alerts_recon_uidx
  ON public.shift_variance_alerts (reconciliation_id) WHERE reconciliation_id IS NOT NULL;

GRANT SELECT, UPDATE ON public.shift_variance_alerts TO authenticated;
GRANT ALL ON public.shift_variance_alerts TO service_role;
ALTER TABLE public.shift_variance_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Variance viewers read alerts" ON public.shift_variance_alerts;
CREATE POLICY "Variance viewers read alerts" ON public.shift_variance_alerts
  FOR SELECT TO authenticated
  USING (public.has_perm('can_shift_variance_view') AND public.store_visible(store_id));

DROP POLICY IF EXISTS "Variance viewers update alert delivery" ON public.shift_variance_alerts;
CREATE POLICY "Variance viewers update alert delivery" ON public.shift_variance_alerts
  FOR UPDATE TO authenticated
  USING (public.has_perm('can_shift_variance_view') AND public.store_visible(store_id))
  WITH CHECK (public.has_perm('can_shift_variance_view') AND public.store_visible(store_id));

/* ---------- 6. immutability ---------- */
CREATE OR REPLACE FUNCTION public.shift_records_immutable()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF coalesce(current_setting('pos.shift_fn', true), '') = 'on' THEN
    RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  RAISE EXCEPTION 'Shift closing records are permanent and cannot be % .', lower(TG_OP);
END $$;

DROP TRIGGER IF EXISTS shift_cash_counts_immutable ON public.shift_cash_counts;
CREATE TRIGGER shift_cash_counts_immutable
  BEFORE UPDATE OR DELETE ON public.shift_cash_counts
  FOR EACH ROW EXECUTE FUNCTION public.shift_records_immutable();

DROP TRIGGER IF EXISTS shift_close_events_immutable ON public.shift_close_events;
CREATE TRIGGER shift_close_events_immutable
  BEFORE UPDATE OR DELETE ON public.shift_close_events
  FOR EACH ROW EXECUTE FUNCTION public.shift_records_immutable();

DROP TRIGGER IF EXISTS shift_reconciliations_immutable ON public.shift_reconciliations;
CREATE TRIGGER shift_reconciliations_immutable
  BEFORE UPDATE OR DELETE ON public.shift_reconciliations
  FOR EACH ROW EXECUTE FUNCTION public.shift_records_immutable();

/* ---------- 7. clients may not touch financial shift columns ---------- */
CREATE OR REPLACE FUNCTION public.shifts_guard_client_writes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF coalesce(current_setting('pos.shift_fn', true), '') = 'on' THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.state              := 'ACTIVE';
    NEW.status             := 'OPEN';
    NEW.closed_at          := NULL;
    NEW.counted_cash       := NULL;
    NEW.counted_card       := NULL;
    NEW.counted_digital    := NULL;
    NEW.final_counted_cash := NULL;
    NEW.expected_cash      := NULL;
    NEW.expected_card      := NULL;
    NEW.expected_digital   := NULL;
    NEW.variance_cash      := NULL;
    NEW.variance_card      := NULL;
    NEW.variance_digital   := NULL;
    NEW.variance_total     := NULL;
    NEW.variance_status    := NULL;
    NEW.close_reason       := NULL;
    NEW.closing_started_at := NULL;
    RETURN NEW;
  END IF;

  -- Updates from a client can only ever touch the housekeeping fields.
  NEW.state              := OLD.state;
  NEW.status             := OLD.status;
  NEW.closed_at          := OLD.closed_at;
  NEW.closed_by_name     := OLD.closed_by_name;
  NEW.closed_by_staff_id := OLD.closed_by_staff_id;
  NEW.closed_by_role     := OLD.closed_by_role;
  NEW.opening_float      := OLD.opening_float;
  NEW.counted_cash       := OLD.counted_cash;
  NEW.counted_card       := OLD.counted_card;
  NEW.counted_digital    := OLD.counted_digital;
  NEW.closing_float      := OLD.closing_float;
  NEW.final_counted_cash := OLD.final_counted_cash;
  NEW.expected_cash      := OLD.expected_cash;
  NEW.expected_card      := OLD.expected_card;
  NEW.expected_digital   := OLD.expected_digital;
  NEW.variance_cash      := OLD.variance_cash;
  NEW.variance_card      := OLD.variance_card;
  NEW.variance_digital   := OLD.variance_digital;
  NEW.variance_total     := OLD.variance_total;
  NEW.variance_status    := OLD.variance_status;
  NEW.close_reason       := OLD.close_reason;
  NEW.closing_started_at := OLD.closing_started_at;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS shifts_guard_client_writes ON public.shifts;
CREATE TRIGGER shifts_guard_client_writes
  BEFORE INSERT OR UPDATE ON public.shifts
  FOR EACH ROW EXECUTE FUNCTION public.shifts_guard_client_writes();

/* ---------- 8. no trading once closing has started ---------- */
CREATE OR REPLACE FUNCTION public.sales_block_closing_shift()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s_state text;
BEGIN
  IF NEW.shift_id IS NULL OR NEW.shift_id = '' THEN RETURN NEW; END IF;
  BEGIN
    SELECT state INTO s_state FROM public.shifts WHERE id = NEW.shift_id::uuid;
  EXCEPTION WHEN others THEN RETURN NEW; END;
  IF s_state IS NOT NULL AND s_state <> 'ACTIVE' THEN
    RAISE EXCEPTION 'This shift is being closed — no further transactions can be recorded against it.';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS sales_block_closing_shift ON public.sales;
CREATE TRIGGER sales_block_closing_shift
  BEFORE INSERT ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.sales_block_closing_shift();

/* ---------- 9. server-side expected cash ---------- */
CREATE OR REPLACE FUNCTION public.shift_expected_totals(p_shift uuid)
RETURNS TABLE (expected_cash numeric, expected_card numeric, expected_digital numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
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

REVOKE ALL ON FUNCTION public.shift_expected_totals(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.shift_expected_totals(uuid) TO service_role;

-- Permission-gated read for managers.
CREATE OR REPLACE FUNCTION public.shift_expected_view(p_shift uuid)
RETURNS TABLE (expected_cash numeric, expected_card numeric, expected_digital numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_perm('can_shift_expected_cash_view') THEN
    RAISE EXCEPTION 'You do not have permission to view expected cash.';
  END IF;
  RETURN QUERY SELECT * FROM public.shift_expected_totals(p_shift);
END $$;
GRANT EXECUTE ON FUNCTION public.shift_expected_view(uuid) TO authenticated, service_role;

/* ---------- 10. workflow routines ---------- */
CREATE OR REPLACE FUNCTION public.shift_log_event(
  p_shift uuid, p_event text, p_from text, p_to text, p_detail jsonb, p_terminal text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
GRANT EXECUTE ON FUNCTION public.shift_log_event(uuid, text, text, text, jsonb, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.shift_close_start(p_shift uuid, p_reason text, p_terminal text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
GRANT EXECUTE ON FUNCTION public.shift_close_start(uuid, text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.shift_reconcile_now(
  p_shift uuid, p_count_id uuid, p_cash numeric, p_card numeric, p_digital numeric)
RETURNS TABLE (state text, variance_status text) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v public.shifts%ROWTYPE; e record; v_rec uuid;
  v_var_cash numeric; v_var_card numeric; v_var_digital numeric; v_total numeric;
  v_status text; v_threshold numeric := 0; v_state text;
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
  v_state  := CASE WHEN v_status = 'NO_VARIANCE' OR abs(v_total) <= v_threshold
                   THEN 'CLOSED' ELSE 'VARIANCE_REVIEW_REQUIRED' END;

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
         status = CASE WHEN v_state = 'CLOSED' THEN 'CLOSED' ELSE status END,
         closed_at = CASE WHEN v_state = 'CLOSED' THEN now() ELSE closed_at END,
         final_counted_cash = p_cash,
         counted_cash = p_cash,
         closing_float = p_cash,
         counted_card = p_card,
         counted_digital = p_digital,
         variance_status = v_status,
         updated_at = now()
   WHERE id = p_shift;

  IF v_status <> 'NO_VARIANCE' THEN
    INSERT INTO public.shift_variance_alerts
      (shift_id, store_id, reconciliation_id, variance_total, variance_status, severity, message)
    VALUES (p_shift, v.store_id, v_rec, v_total, v_status,
            CASE WHEN abs(v_total) > v_threshold THEN 'critical' ELSE 'warning' END,
            format('Shift at %s closed %s by %s.', v.store_id, lower(v_status), abs(v_total)))
    ON CONFLICT (reconciliation_id) DO NOTHING;
  END IF;
  PERFORM set_config('pos.shift_fn', '', true);

  PERFORM public.shift_log_event(p_shift, 'reconciled', 'CASH_COUNT_SUBMITTED', v_state,
    jsonb_build_object('variance_status', v_status), v.terminal_id);

  RETURN QUERY SELECT v_state, v_status;
END $$;
REVOKE ALL ON FUNCTION public.shift_reconcile_now(uuid, uuid, numeric, numeric, numeric) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.shift_reconcile_now(uuid, uuid, numeric, numeric, numeric) TO service_role;

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

  SELECT * INTO v FROM public.shifts WHERE id = p_shift FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'That shift no longer exists.'; END IF;
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

CREATE OR REPLACE FUNCTION public.shift_variance_approve(p_shift uuid, p_note text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
GRANT EXECUTE ON FUNCTION public.shift_variance_approve(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.shift_state(p_shift uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT state FROM public.shifts WHERE id = p_shift
$$;
GRANT EXECUTE ON FUNCTION public.shift_state(uuid) TO authenticated, service_role;