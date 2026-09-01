-- 1. Payment settlement status ------------------------------------------------
ALTER TABLE public.booking_payments
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'settled',
  ADD COLUMN IF NOT EXISTS client_payment_id text,
  ADD COLUMN IF NOT EXISTS reference text,
  ADD COLUMN IF NOT EXISTS reversed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reversed_by text;

DO $$ BEGIN
  ALTER TABLE public.booking_payments
    ADD CONSTRAINT booking_payments_status_chk CHECK (status IN ('settled','reversed','void'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS booking_payments_client_id_uidx
  ON public.booking_payments (booking_id, client_payment_id)
  WHERE client_payment_id IS NOT NULL;

-- 2. Cancellation record --------------------------------------------------------
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS cancel_reason text,
  ADD COLUMN IF NOT EXISTS cancelled_by text,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_terminal text;

-- 3. Authoritative balance ------------------------------------------------------
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
         round(coalesce((SELECT sum(p.amount) FROM public.booking_payments p
                          WHERE p.booking_id = b.id AND p.status = 'settled'), 0), 2),
         round(greatest(0, coalesce(b.total, 0)
               - coalesce((SELECT sum(p.amount) FROM public.booking_payments p
                            WHERE p.booking_id = b.id AND p.status = 'settled'), 0)), 2),
         (coalesce(b.total, 0)
           - coalesce((SELECT sum(p.amount) FROM public.booking_payments p
                        WHERE p.booking_id = b.id AND p.status = 'settled'), 0)) <= 0.005,
         b.status,
         b.job_status
  FROM public.bookings b
  WHERE b.id = _booking_id;
$$;

REVOKE ALL ON FUNCTION public.booking_balance_state(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.booking_balance_state(uuid) TO authenticated, service_role;

-- 4. Guard: never collected while money is owed ---------------------------------
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

  SELECT round(coalesce(NEW.total, 0)
         - coalesce((SELECT sum(p.amount) FROM public.booking_payments p
                      WHERE p.booking_id = NEW.id AND p.status = 'settled'), 0), 2)
    INTO owed;

  IF owed > 0.005 THEN
    RAISE EXCEPTION 'BOOKING_BALANCE_DUE: % still outstanding on this booking', owed;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS bookings_block_unpaid_collection ON public.bookings;
CREATE TRIGGER bookings_block_unpaid_collection
  BEFORE INSERT OR UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.bookings_block_unpaid_collection();

-- 5. Collect payment ------------------------------------------------------------
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
  duplicate boolean
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
BEGIN
  IF (SELECT auth.uid()) IS NOT NULL AND NOT public.has_perm('can_collect_booking') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED_COLLECT_BOOKING';
  END IF;

  SELECT * INTO b FROM public.bookings WHERE id = _booking_id FOR UPDATE;
  IF b.id IS NULL THEN RAISE EXCEPTION 'BOOKING_NOT_FOUND'; END IF;
  IF b.status = 'cancelled' THEN RAISE EXCEPTION 'BOOKING_CANCELLED'; END IF;

  SELECT coalesce(sum(p.amount), 0) INTO paid_now
    FROM public.booking_payments p
   WHERE p.booking_id = b.id AND p.status = 'settled';
  owed := round(coalesce(b.total, 0) - paid_now, 2);

  IF _client_payment_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.booking_payments
     WHERE booking_id = b.id AND client_payment_id = _client_payment_id
  ) THEN
    dup := true;
  ELSIF coalesce(_amount, 0) > 0 THEN
    IF round(_amount, 2) > owed + 0.005 THEN
      RAISE EXCEPTION 'BOOKING_OVERPAYMENT: only % is outstanding', greatest(owed, 0);
    END IF;
    INSERT INTO public.booking_payments
      (id, booking_id, amount, method, cashier, paid_at, status, reference, client_payment_id)
    VALUES
      (gen_random_uuid(), b.id, round(_amount, 2), coalesce(_method, 'cash'),
       coalesce(_cashier, b.cashier), now(), 'settled', _reference, _client_payment_id);
  END IF;

  SELECT coalesce(sum(p.amount), 0) INTO paid_now
    FROM public.booking_payments p
   WHERE p.booking_id = b.id AND p.status = 'settled';
  owed := round(coalesce(b.total, 0) - paid_now, 2);

  PERFORM set_config('pos.booking_collect', 'on', true);
  UPDATE public.bookings
     SET paid = round(paid_now, 2),
         status = CASE WHEN _complete AND owed <= 0.005 THEN 'collected' ELSE status END,
         job_status = CASE
           WHEN _complete AND owed <= 0.005 AND job_status IS NOT NULL THEN 'collected'
           ELSE job_status END,
         job_status_at = CASE
           WHEN _complete AND owed <= 0.005 AND job_status IS NOT NULL THEN now()
           ELSE job_status_at END,
         job_status_by = CASE
           WHEN _complete AND owed <= 0.005 AND job_status IS NOT NULL
             THEN coalesce(_cashier, job_status_by) ELSE job_status_by END,
         closed_at = CASE WHEN _complete AND owed <= 0.005 THEN now() ELSE closed_at END
   WHERE id = b.id
   RETURNING * INTO b;
  PERFORM set_config('pos.booking_collect', 'off', true);

  RETURN QUERY SELECT round(coalesce(b.total, 0), 2), round(paid_now, 2),
                      round(greatest(owed, 0), 2), owed <= 0.005,
                      b.status, b.job_status, dup;
END $$;

REVOKE ALL ON FUNCTION public.booking_collect(uuid, numeric, text, text, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.booking_collect(uuid, numeric, text, text, text, text, boolean) TO authenticated, service_role;

-- 6. Cancel with a mandatory reason ---------------------------------------------
CREATE OR REPLACE FUNCTION public.booking_cancel(
  _booking_id uuid,
  _reason text,
  _cancelled_by text DEFAULT NULL,
  _terminal text DEFAULT NULL
)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  b public.bookings%ROWTYPE;
  clean text := btrim(coalesce(_reason, ''));
BEGIN
  IF (SELECT auth.uid()) IS NOT NULL AND NOT public.has_perm('can_cancel_booking') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED_CANCEL_BOOKING';
  END IF;
  IF length(clean) < 3 THEN
    RAISE EXCEPTION 'CANCEL_REASON_REQUIRED';
  END IF;

  SELECT * INTO b FROM public.bookings WHERE id = _booking_id FOR UPDATE;
  IF b.id IS NULL THEN RAISE EXCEPTION 'BOOKING_NOT_FOUND'; END IF;
  IF b.status = 'collected' THEN RAISE EXCEPTION 'BOOKING_ALREADY_COLLECTED'; END IF;

  UPDATE public.bookings
     SET status = 'cancelled',
         closed_at = coalesce(closed_at, now()),
         -- the first reason recorded is never overwritten
         cancel_reason = coalesce(cancel_reason, clean),
         cancelled_by = coalesce(cancelled_by, _cancelled_by),
         cancelled_at = coalesce(cancelled_at, now()),
         cancelled_terminal = coalesce(cancelled_terminal, _terminal)
   WHERE id = b.id
   RETURNING * INTO b;

  RETURN b;
END $$;

REVOKE ALL ON FUNCTION public.booking_cancel(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.booking_cancel(uuid, text, text, text) TO authenticated, service_role;