-- 1. Refund metadata on booking payments ---------------------------------------
ALTER TABLE public.booking_payments
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'payment',
  ADD COLUMN IF NOT EXISTS refund_reason text,
  ADD COLUMN IF NOT EXISTS refunds_payment_id uuid,
  ADD COLUMN IF NOT EXISTS change_given numeric NOT NULL DEFAULT 0;

DO $$ BEGIN
  ALTER TABLE public.booking_payments
    ADD CONSTRAINT booking_payments_kind_chk CHECK (kind IN ('payment','refund'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS cancel_money_action text;

DO $$ BEGIN
  ALTER TABLE public.bookings
    ADD CONSTRAINT bookings_cancel_money_action_chk
    CHECK (cancel_money_action IS NULL OR cancel_money_action IN ('refunded','retained','none'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Balance is net of refunds --------------------------------------------------
CREATE OR REPLACE FUNCTION public.booking_net_paid(_booking_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT round(coalesce(sum(p.amount), 0), 2)
    FROM public.booking_payments p
   WHERE p.booking_id = _booking_id AND p.status = 'settled';
$$;

REVOKE ALL ON FUNCTION public.booking_net_paid(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.booking_net_paid(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.booking_balance_state(_booking_id uuid)
RETURNS TABLE (
  booking_id uuid,
  total numeric,
  settled_paid numeric,
  outstanding numeric,
  fully_paid boolean,
  status text,
  job_status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT b.id,
         round(coalesce(b.total, 0), 2),
         public.booking_net_paid(b.id),
         round(greatest(0, coalesce(b.total, 0) - public.booking_net_paid(b.id)), 2),
         (coalesce(b.total, 0) - public.booking_net_paid(b.id)) <= 0.005,
         b.status,
         b.job_status
  FROM public.bookings b
  WHERE b.id = _booking_id;
$$;

REVOKE ALL ON FUNCTION public.booking_balance_state(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.booking_balance_state(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.bookings_block_unpaid_collection()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  owed numeric;
BEGIN
  IF current_setting('pos.booking_collect', true) = 'on' THEN
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM 'collected'
     AND coalesce(NEW.job_status, '') IS DISTINCT FROM 'collected' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND OLD.status IS NOT DISTINCT FROM NEW.status
     AND coalesce(OLD.job_status, '') IS NOT DISTINCT FROM coalesce(NEW.job_status, '') THEN
    RETURN NEW;
  END IF;

  owed := round(coalesce(NEW.total, 0) - public.booking_net_paid(NEW.id), 2);

  IF owed > 0.005 THEN
    RAISE EXCEPTION 'BOOKING_BALANCE_DUE: % still outstanding on this booking', owed;
  END IF;
  RETURN NEW;
END $$;

-- 3. Collect: ambiguity fix, net balance, cash change ----------------------------
DROP FUNCTION IF EXISTS public.booking_collect(uuid, numeric, text, text, text, text, boolean);

CREATE OR REPLACE FUNCTION public.booking_collect(
  _booking_id uuid,
  _amount numeric,
  _method text,
  _cashier text DEFAULT NULL,
  _reference text DEFAULT NULL,
  _client_payment_id text DEFAULT NULL,
  _complete boolean DEFAULT true
)
RETURNS TABLE (
  total numeric,
  settled_paid numeric,
  outstanding numeric,
  fully_paid boolean,
  status text,
  job_status text,
  duplicate boolean,
  change_due numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  b public.bookings%ROWTYPE;
  owed numeric;
  paid_now numeric;
  dup boolean := false;
  taken numeric := 0;
  change_out numeric := 0;
  method_in text := lower(coalesce(_method, 'cash'));
BEGIN
  IF (SELECT auth.uid()) IS NOT NULL AND NOT public.has_perm('can_collect_booking') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED_COLLECT_BOOKING';
  END IF;

  SELECT * INTO b FROM public.bookings bk WHERE bk.id = _booking_id FOR UPDATE;
  IF b.id IS NULL THEN RAISE EXCEPTION 'BOOKING_NOT_FOUND'; END IF;
  IF b.status = 'cancelled' THEN RAISE EXCEPTION 'BOOKING_CANCELLED'; END IF;

  paid_now := public.booking_net_paid(b.id);
  owed := round(coalesce(b.total, 0) - paid_now, 2);

  IF _client_payment_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.booking_payments p
     WHERE p.booking_id = b.id AND p.client_payment_id = _client_payment_id
  ) THEN
    dup := true;
  ELSIF coalesce(_amount, 0) > 0 THEN
    taken := round(_amount, 2);
    IF taken > owed + 0.005 THEN
      IF method_in = 'cash' THEN
        -- cash over the counter: keep what is owed, hand the rest back
        change_out := round(taken - greatest(owed, 0), 2);
        taken := round(greatest(owed, 0), 2);
      ELSE
        RAISE EXCEPTION 'BOOKING_OVERPAYMENT: only % is outstanding', greatest(owed, 0);
      END IF;
    END IF;

    IF taken > 0 THEN
      INSERT INTO public.booking_payments
        (id, booking_id, amount, method, cashier, paid_at, status, reference,
         client_payment_id, kind, change_given)
      VALUES
        (gen_random_uuid(), b.id, taken, coalesce(_method, 'cash'),
         coalesce(_cashier, b.cashier), now(), 'settled', _reference,
         _client_payment_id, 'payment', change_out);
    END IF;
  END IF;

  paid_now := public.booking_net_paid(b.id);
  owed := round(coalesce(b.total, 0) - paid_now, 2);

  PERFORM set_config('pos.booking_collect', 'on', true);
  UPDATE public.bookings bk
     SET paid = round(paid_now, 2),
         status = CASE WHEN _complete AND owed <= 0.005 THEN 'collected' ELSE bk.status END,
         job_status = CASE
           WHEN _complete AND owed <= 0.005 AND bk.job_status IS NOT NULL THEN 'collected'
           ELSE bk.job_status END,
         job_status_at = CASE
           WHEN _complete AND owed <= 0.005 AND bk.job_status IS NOT NULL THEN now()
           ELSE bk.job_status_at END,
         job_status_by = CASE
           WHEN _complete AND owed <= 0.005 AND bk.job_status IS NOT NULL
             THEN coalesce(_cashier, bk.job_status_by) ELSE bk.job_status_by END,
         closed_at = CASE WHEN _complete AND owed <= 0.005 THEN now() ELSE bk.closed_at END
   WHERE bk.id = b.id
   RETURNING * INTO b;
  PERFORM set_config('pos.booking_collect', 'off', true);

  RETURN QUERY SELECT round(coalesce(b.total, 0), 2), round(paid_now, 2),
                      round(greatest(owed, 0), 2), owed <= 0.005,
                      b.status, b.job_status, dup, change_out;
END $$;

REVOKE ALL ON FUNCTION public.booking_collect(uuid, numeric, text, text, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.booking_collect(uuid, numeric, text, text, text, text, boolean) TO authenticated, service_role;

-- 4. Refunds --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.booking_refund(
  _booking_id uuid,
  _amount numeric,
  _method text DEFAULT 'cash',
  _reason text DEFAULT NULL,
  _cashier text DEFAULT NULL,
  _client_payment_id text DEFAULT NULL
)
RETURNS TABLE (
  total numeric,
  settled_paid numeric,
  outstanding numeric,
  fully_paid boolean,
  status text,
  job_status text,
  duplicate boolean,
  change_due numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  b public.bookings%ROWTYPE;
  paid_now numeric;
  owed numeric;
  dup boolean := false;
  clean text := btrim(coalesce(_reason, ''));
  give numeric;
BEGIN
  IF (SELECT auth.uid()) IS NOT NULL AND NOT public.has_perm('can_process_refund') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED_REFUND_BOOKING';
  END IF;
  IF length(clean) < 3 THEN
    RAISE EXCEPTION 'REFUND_REASON_REQUIRED';
  END IF;

  SELECT * INTO b FROM public.bookings bk WHERE bk.id = _booking_id FOR UPDATE;
  IF b.id IS NULL THEN RAISE EXCEPTION 'BOOKING_NOT_FOUND'; END IF;

  paid_now := public.booking_net_paid(b.id);

  IF _client_payment_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.booking_payments p
     WHERE p.booking_id = b.id AND p.client_payment_id = _client_payment_id
  ) THEN
    dup := true;
  ELSE
    give := round(coalesce(_amount, 0), 2);
    IF give <= 0 THEN RAISE EXCEPTION 'REFUND_AMOUNT_INVALID'; END IF;
    IF give > paid_now + 0.005 THEN
      RAISE EXCEPTION 'REFUND_EXCEEDS_PAID: only % has been taken', greatest(paid_now, 0);
    END IF;

    INSERT INTO public.booking_payments
      (id, booking_id, amount, method, cashier, paid_at, status, client_payment_id,
       kind, refund_reason)
    VALUES
      (gen_random_uuid(), b.id, -give, coalesce(_method, 'cash'),
       coalesce(_cashier, b.cashier), now(), 'settled', _client_payment_id,
       'refund', clean);
  END IF;

  paid_now := public.booking_net_paid(b.id);
  owed := round(coalesce(b.total, 0) - paid_now, 2);

  PERFORM set_config('pos.booking_collect', 'on', true);
  UPDATE public.bookings bk SET paid = round(paid_now, 2)
   WHERE bk.id = b.id RETURNING * INTO b;
  PERFORM set_config('pos.booking_collect', 'off', true);

  RETURN QUERY SELECT round(coalesce(b.total, 0), 2), round(paid_now, 2),
                      round(greatest(owed, 0), 2), owed <= 0.005,
                      b.status, b.job_status, dup, 0::numeric;
END $$;

REVOKE ALL ON FUNCTION public.booking_refund(uuid, numeric, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.booking_refund(uuid, numeric, text, text, text, text) TO authenticated, service_role;

-- 5. Cancel: record what happened to the money -----------------------------------
DROP FUNCTION IF EXISTS public.booking_cancel(uuid, text, text, text);

CREATE OR REPLACE FUNCTION public.booking_cancel(
  _booking_id uuid,
  _reason text,
  _cancelled_by text DEFAULT NULL,
  _terminal text DEFAULT NULL,
  _money_action text DEFAULT NULL,
  _client_payment_id text DEFAULT NULL
)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  b public.bookings%ROWTYPE;
  clean text := btrim(coalesce(_reason, ''));
  held numeric;
  action text := lower(coalesce(_money_action, ''));
BEGIN
  IF (SELECT auth.uid()) IS NOT NULL AND NOT public.has_perm('can_cancel_booking') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED_CANCEL_BOOKING';
  END IF;
  IF length(clean) < 3 THEN
    RAISE EXCEPTION 'CANCEL_REASON_REQUIRED';
  END IF;

  SELECT * INTO b FROM public.bookings bk WHERE bk.id = _booking_id FOR UPDATE;
  IF b.id IS NULL THEN RAISE EXCEPTION 'BOOKING_NOT_FOUND'; END IF;
  IF b.status = 'collected' THEN RAISE EXCEPTION 'BOOKING_ALREADY_COLLECTED'; END IF;

  held := public.booking_net_paid(b.id);

  IF held > 0.005 THEN
    IF action NOT IN ('refunded', 'retained') THEN
      RAISE EXCEPTION 'CANCEL_MONEY_DECISION_REQUIRED: % is held on this booking', held;
    END IF;
    IF action = 'refunded' THEN
      PERFORM public.booking_refund(
        b.id, held, 'cash', 'Refunded on cancellation: ' || clean,
        _cancelled_by, _client_payment_id);
    END IF;
  ELSE
    action := 'none';
  END IF;

  PERFORM set_config('pos.booking_collect', 'on', true);
  UPDATE public.bookings bk
     SET status = 'cancelled',
         paid = public.booking_net_paid(bk.id),
         closed_at = coalesce(bk.closed_at, now()),
         cancel_reason = coalesce(bk.cancel_reason, clean),
         cancelled_by = coalesce(bk.cancelled_by, _cancelled_by),
         cancelled_at = coalesce(bk.cancelled_at, now()),
         cancelled_terminal = coalesce(bk.cancelled_terminal, _terminal),
         cancel_money_action = coalesce(bk.cancel_money_action, action)
   WHERE bk.id = b.id
   RETURNING * INTO b;
  PERFORM set_config('pos.booking_collect', 'off', true);

  RETURN b;
END $$;

REVOKE ALL ON FUNCTION public.booking_cancel(uuid, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.booking_cancel(uuid, text, text, text, text, text) TO authenticated, service_role;