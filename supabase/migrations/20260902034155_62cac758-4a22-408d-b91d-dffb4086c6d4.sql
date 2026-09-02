ALTER TABLE public.stock_transfers
  ADD COLUMN IF NOT EXISTS verified_by text,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS posted_at timestamptz,
  ADD COLUMN IF NOT EXISTS discrepancy_reason text;

ALTER TABLE public.stock_transfer_items
  ADD COLUMN IF NOT EXISTS quantity_verified integer;

-- Line quantity ceilings: verified can never exceed what arrived.
CREATE OR REPLACE FUNCTION public.stock_transfer_items_enforce_quantities()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.quantity < 0
     OR COALESCE(NEW.quantity_approved, 0) < 0
     OR COALESCE(NEW.quantity_dispatched, 0) < 0
     OR COALESCE(NEW.quantity_received, 0) < 0
     OR COALESCE(NEW.quantity_verified, 0) < 0 THEN
    RAISE EXCEPTION 'Transfer quantities cannot be negative' USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.quantity_approved IS NOT NULL AND NEW.quantity_approved > NEW.quantity THEN
    RAISE EXCEPTION 'Cannot approve % of % requested', NEW.quantity_approved, NEW.quantity
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.quantity_dispatched IS NOT NULL
     AND NEW.quantity_dispatched > COALESCE(NEW.quantity_approved, NEW.quantity) THEN
    RAISE EXCEPTION 'Cannot send % when only % were approved',
      NEW.quantity_dispatched, COALESCE(NEW.quantity_approved, NEW.quantity)
      USING ERRCODE = 'check_violation';
  END IF;

  IF COALESCE(NEW.quantity_received, 0) > COALESCE(NEW.quantity_dispatched, NEW.quantity) THEN
    RAISE EXCEPTION 'Cannot receive % when only % were sent',
      NEW.quantity_received, COALESCE(NEW.quantity_dispatched, NEW.quantity)
      USING ERRCODE = 'check_violation';
  END IF;

  IF COALESCE(NEW.quantity_verified, 0) > COALESCE(NEW.quantity_dispatched, NEW.quantity) THEN
    RAISE EXCEPTION 'Cannot verify % when only % were sent',
      NEW.quantity_verified, COALESCE(NEW.quantity_dispatched, NEW.quantity)
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;

-- Lifecycle: arrival and posting are now two different things.
CREATE OR REPLACE FUNCTION public.stock_transfers_enforce_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_needs_approval boolean;
  v_may_approve boolean := public.is_supervisor_now()
    OR public.has_perm('can_approve_transfer')
    OR public.has_perm('can_receive_transfer');
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_needs_approval := public.stock_transfer_approval_required(NEW.from_store_id);

    IF v_needs_approval THEN
      NEW.status := 'awaiting_approval';
    ELSIF NEW.status IS NULL OR NEW.status NOT IN ('awaiting_approval', 'approved') THEN
      NEW.status := 'approved';
    END IF;

    IF NEW.status = 'approved' AND NOT v_needs_approval THEN
      NEW.approved_by := COALESCE(NEW.approved_by, NEW.created_by);
      NEW.approved_at := COALESCE(NEW.approved_at, now());
    ELSE
      NEW.approved_by := NULL;
      NEW.approved_at := NULL;
    END IF;

    NEW.dispatched_by := NULL;
    NEW.dispatched_at := NULL;
    NEW.received_by := NULL;
    NEW.received_at := NULL;
    NEW.verified_by := NULL;
    NEW.verified_at := NULL;
    NEW.posted_at := NULL;
    NEW.closed_at := NULL;
    NEW.fulfilment := NULL;
    RETURN NEW;
  END IF;

  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  IF OLD.status IN ('rejected', 'cancelled', 'completed', 'completed_with_discrepancy') THEN
    RAISE EXCEPTION 'Transfer % is closed (%) and cannot change', OLD.ref, OLD.status
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT (
    (OLD.status = 'awaiting_approval' AND NEW.status IN ('approved', 'rejected', 'cancelled'))
    OR (OLD.status = 'approved' AND NEW.status IN ('dispatched', 'rejected', 'cancelled'))
    OR (OLD.status = 'dispatched' AND NEW.status = 'received')
    OR (OLD.status = 'received' AND NEW.status IN ('verified', 'completed', 'completed_with_discrepancy'))
    OR (OLD.status = 'verified' AND NEW.status IN ('completed', 'completed_with_discrepancy'))
  ) THEN
    RAISE EXCEPTION 'Transfer % cannot go from % to %', OLD.ref, OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status IN ('approved', 'rejected') AND NOT v_may_approve THEN
    RAISE EXCEPTION 'You are not allowed to approve or reject transfers'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.status = 'approved' THEN
    NEW.approved_at := COALESCE(NEW.approved_at, now());
  END IF;

  IF NEW.status = 'rejected' AND COALESCE(btrim(NEW.rejected_reason), '') = '' THEN
    RAISE EXCEPTION 'A rejection needs a reason' USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status = 'cancelled' AND COALESCE(btrim(NEW.cancelled_reason), '') = '' THEN
    RAISE EXCEPTION 'A cancellation needs a reason' USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status = 'completed_with_discrepancy'
     AND COALESCE(btrim(NEW.discrepancy_reason), '') = '' THEN
    RAISE EXCEPTION 'A discrepancy needs a reason' USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status = 'dispatched' THEN
    NEW.dispatched_at := COALESCE(NEW.dispatched_at, now());
    NEW.closed_at := COALESCE(NEW.closed_at, now());
    NEW.fulfilment := (
      SELECT CASE
        WHEN COALESCE(SUM(COALESCE(i.quantity_dispatched, 0)), 0) = 0 THEN 'none'
        WHEN COALESCE(SUM(COALESCE(i.quantity_dispatched, 0)), 0)
             >= COALESCE(SUM(i.quantity), 0) THEN 'full'
        ELSE 'partial'
      END
      FROM public.stock_transfer_items i WHERE i.transfer_id = NEW.id
    );
  END IF;

  IF NEW.status = 'received' THEN
    NEW.received_at := COALESCE(NEW.received_at, now());
  END IF;

  IF NEW.status IN ('verified', 'completed', 'completed_with_discrepancy') THEN
    NEW.received_at := COALESCE(NEW.received_at, now());
    NEW.verified_at := COALESCE(NEW.verified_at, now());
  END IF;

  RETURN NEW;
END;
$function$;

-- Receiving now only records arrival; no stock moves here.
CREATE OR REPLACE FUNCTION public.stock_transfer_receive(
  p_transfer_id uuid,
  p_received_by text DEFAULT NULL::text,
  p_deduct_source boolean DEFAULT false,
  p_lines jsonb DEFAULT NULL::jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  t public.stock_transfers;
  it record;
  v_qty integer;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Only staff can receive a transfer';
  END IF;

  SELECT * INTO t FROM public.stock_transfers WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TRANSFER_NOT_FOUND'; END IF;
  IF t.status = 'received' THEN RAISE EXCEPTION 'TRANSFER_ALREADY_RECEIVED'; END IF;
  IF t.status IN ('rejected', 'cancelled', 'verified', 'completed', 'completed_with_discrepancy') THEN
    RAISE EXCEPTION 'TRANSFER_CLOSED';
  END IF;
  IF t.status <> 'dispatched' THEN
    RAISE EXCEPTION 'Transfer % has not been dispatched yet', t.ref;
  END IF;

  FOR it IN SELECT * FROM public.stock_transfer_items WHERE transfer_id = t.id LOOP
    v_qty := COALESCE(
      (SELECT (l ->> 'qty')::int FROM jsonb_array_elements(COALESCE(p_lines, '[]'::jsonb)) l
        WHERE l ->> 'product_id' = it.product_id::text LIMIT 1),
      it.quantity_dispatched, it.quantity);
    v_qty := GREATEST(LEAST(v_qty, COALESCE(it.quantity_dispatched, it.quantity)), 0);
    UPDATE public.stock_transfer_items SET quantity_received = v_qty WHERE id = it.id;
  END LOOP;

  UPDATE public.stock_transfers
     SET status = 'received', received_at = now(),
         received_by = COALESCE(p_received_by, received_by)
   WHERE id = t.id;
END $function$;

-- Verification posts the physically counted quantity, exactly once.
CREATE OR REPLACE FUNCTION public.stock_transfer_verify(
  p_transfer_id uuid,
  p_verified_by text DEFAULT NULL::text,
  p_lines jsonb DEFAULT NULL::jsonb,
  p_reason text DEFAULT NULL::text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  t public.stock_transfers;
  it record;
  v_target uuid;
  v_qty integer;
  v_src public.products;
  v_before integer;
  v_short boolean := false;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Only staff can verify a transfer';
  END IF;

  SELECT * INTO t FROM public.stock_transfers WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TRANSFER_NOT_FOUND'; END IF;
  IF t.posted_at IS NOT NULL
     OR t.status IN ('verified', 'completed', 'completed_with_discrepancy') THEN
    RAISE EXCEPTION 'TRANSFER_ALREADY_POSTED';
  END IF;
  IF t.status IN ('rejected', 'cancelled') THEN RAISE EXCEPTION 'TRANSFER_CLOSED'; END IF;
  IF t.status <> 'received' THEN
    RAISE EXCEPTION 'Transfer % has not arrived yet', t.ref;
  END IF;

  FOR it IN SELECT * FROM public.stock_transfer_items WHERE transfer_id = t.id LOOP
    v_qty := COALESCE(
      (SELECT (l ->> 'qty')::int FROM jsonb_array_elements(COALESCE(p_lines, '[]'::jsonb)) l
        WHERE l ->> 'product_id' = it.product_id::text LIMIT 1),
      it.quantity_received, it.quantity_dispatched, it.quantity);
    v_qty := GREATEST(LEAST(v_qty, COALESCE(it.quantity_dispatched, it.quantity)), 0);

    IF v_qty < COALESCE(it.quantity_dispatched, it.quantity) THEN v_short := true; END IF;

    UPDATE public.stock_transfer_items
       SET quantity_verified = v_qty, quantity_received = v_qty
     WHERE id = it.id;

    CONTINUE WHEN v_qty <= 0;

    SELECT * INTO v_src FROM public.products WHERE id = it.product_id;
    IF NOT FOUND THEN CONTINUE; END IF;

    v_target := it.product_id;

    IF t.transfer_scope = 'INTER_GROUP' AND COALESCE(v_src.barcode, '') <> '' THEN
      SELECT p.id INTO v_target
        FROM public.products p
       WHERE p.barcode = v_src.barcode
         AND COALESCE(p.stock_by_store ? t.to_store_id, false)
       LIMIT 1;
      IF v_target IS NULL THEN v_target := it.product_id; END IF;
    END IF;

    SELECT COALESCE((stock_by_store ->> t.to_store_id)::int, 0) INTO v_before
      FROM public.products WHERE id = v_target FOR UPDATE;

    UPDATE public.products
       SET stock_by_store = jsonb_set(
             COALESCE(stock_by_store, '{}'::jsonb), ARRAY[t.to_store_id],
             to_jsonb(COALESCE((stock_by_store ->> t.to_store_id)::int, 0) + v_qty), true),
           stock_quantity = stock_quantity + v_qty
     WHERE id = v_target;

    INSERT INTO public.item_activity_logs
      (product_id, product_name, store_id, activity_type, reference,
       quantity_delta, stock_before, stock_after, unit_cost, staff_name, note)
    SELECT v_target, p.name, t.to_store_id, 'transfer_in', t.ref,
           v_qty, COALESCE(v_before, 0), COALESCE(v_before, 0) + v_qty,
           COALESCE(p.cost_price, 0), COALESCE(p_verified_by, ''), ''
      FROM public.products p WHERE p.id = v_target;
  END LOOP;

  IF v_short AND COALESCE(btrim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'A discrepancy needs a reason' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.stock_transfers
     SET status = CASE WHEN v_short THEN 'completed_with_discrepancy' ELSE 'completed' END,
         verified_by = COALESCE(p_verified_by, verified_by),
         verified_at = now(),
         posted_at = now(),
         discrepancy_reason = CASE WHEN v_short THEN p_reason ELSE discrepancy_reason END
   WHERE id = t.id;
END $function$;

GRANT EXECUTE ON FUNCTION public.stock_transfer_verify(uuid, text, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.stock_transfer_verify(uuid, text, jsonb, text) TO service_role;

-- Dispatch refuses to move stock the sending branch does not have.
CREATE OR REPLACE FUNCTION public.stock_transfer_dispatch(
  p_transfer_id uuid,
  p_dispatched_by text DEFAULT NULL::text,
  p_lines jsonb DEFAULT NULL::jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  t public.stock_transfers;
  it record;
  v_qty integer;
  v_before integer;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Only staff can dispatch a transfer';
  END IF;

  SELECT * INTO t FROM public.stock_transfers WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TRANSFER_NOT_FOUND'; END IF;
  IF t.status <> 'approved' THEN
    RAISE EXCEPTION 'Transfer % is % and cannot be dispatched', t.ref, t.status;
  END IF;

  FOR it IN SELECT * FROM public.stock_transfer_items WHERE transfer_id = t.id LOOP
    v_qty := COALESCE(
      (SELECT (l ->> 'qty')::int FROM jsonb_array_elements(COALESCE(p_lines, '[]'::jsonb)) l
        WHERE l ->> 'product_id' = it.product_id::text LIMIT 1),
      it.quantity_approved, it.quantity);
    v_qty := GREATEST(LEAST(v_qty, COALESCE(it.quantity_approved, it.quantity)), 0);

    UPDATE public.stock_transfer_items SET quantity_dispatched = v_qty WHERE id = it.id;

    CONTINUE WHEN v_qty <= 0;

    SELECT COALESCE((stock_by_store ->> t.from_store_id)::int, 0) INTO v_before
      FROM public.products WHERE id = it.product_id FOR UPDATE;

    IF COALESCE(v_before, 0) < v_qty THEN
      RAISE EXCEPTION 'Short by % of % at the sending branch',
        v_qty - COALESCE(v_before, 0),
        COALESCE((SELECT name FROM public.products WHERE id = it.product_id), 'item')
        USING ERRCODE = 'check_violation';
    END IF;

    UPDATE public.products
       SET stock_by_store = jsonb_set(
             COALESCE(stock_by_store, '{}'::jsonb), ARRAY[t.from_store_id],
             to_jsonb(COALESCE((stock_by_store ->> t.from_store_id)::int, 0) - v_qty), true),
           stock_quantity = GREATEST(stock_quantity - v_qty, 0)
     WHERE id = it.product_id;

    INSERT INTO public.item_activity_logs
      (product_id, product_name, store_id, activity_type, reference,
       quantity_delta, stock_before, stock_after, unit_cost, staff_name, note)
    SELECT it.product_id, p.name, t.from_store_id, 'transfer_out', t.ref,
           -v_qty, COALESCE(v_before, 0), COALESCE(v_before, 0) - v_qty,
           COALESCE(p.cost_price, 0), COALESCE(p_dispatched_by, ''), ''
      FROM public.products p WHERE p.id = it.product_id;
  END LOOP;

  UPDATE public.stock_transfers
     SET status = 'dispatched',
         dispatched_by = COALESCE(p_dispatched_by, dispatched_by),
         dispatched_at = now()
   WHERE id = t.id;
END $function$;

-- Historical rows: already received means already posted.
UPDATE public.stock_transfer_items i
   SET quantity_verified = COALESCE(i.quantity_received, i.quantity_dispatched, i.quantity)
  FROM public.stock_transfers t
 WHERE t.id = i.transfer_id
   AND t.status = 'received'
   AND i.quantity_verified IS NULL;

UPDATE public.stock_transfers
   SET status = 'completed',
       verified_by = COALESCE(verified_by, received_by),
       verified_at = COALESCE(verified_at, received_at),
       posted_at = COALESCE(posted_at, received_at, now())
 WHERE status = 'received';