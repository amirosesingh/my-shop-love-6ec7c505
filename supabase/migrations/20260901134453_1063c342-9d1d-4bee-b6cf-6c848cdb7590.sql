-- Approve: record the allowed quantity per line, then move the note on.
CREATE OR REPLACE FUNCTION public.stock_transfer_approve(
  p_transfer_id uuid,
  p_approved_by text DEFAULT NULL,
  p_lines jsonb DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  t public.stock_transfers;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Only staff can approve a transfer';
  END IF;

  SELECT * INTO t FROM public.stock_transfers WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TRANSFER_NOT_FOUND'; END IF;
  IF t.status <> 'awaiting_approval' THEN
    RAISE EXCEPTION 'Transfer % is % and is not waiting for approval', t.ref, t.status;
  END IF;

  -- No list means "everything as asked for".
  UPDATE public.stock_transfer_items i
     SET quantity_approved = COALESCE(
           (SELECT (l ->> 'qty')::int FROM jsonb_array_elements(COALESCE(p_lines, '[]'::jsonb)) l
             WHERE l ->> 'product_id' = i.product_id::text LIMIT 1),
           i.quantity)
   WHERE i.transfer_id = t.id;

  UPDATE public.stock_transfers
     SET status = 'approved', approved_by = COALESCE(p_approved_by, approved_by), approved_at = now()
   WHERE id = t.id;
END $$;

-- Dispatch: the stock physically leaves here, so this is where the sending
-- branch's count drops and the request closes against reality.
CREATE OR REPLACE FUNCTION public.stock_transfer_dispatch(
  p_transfer_id uuid,
  p_dispatched_by text DEFAULT NULL,
  p_lines jsonb DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  t public.stock_transfers;
  it record;
  v_qty integer;
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

    UPDATE public.products
       SET stock_by_store = jsonb_set(
             COALESCE(stock_by_store, '{}'::jsonb), ARRAY[t.from_store_id],
             to_jsonb(GREATEST(
               COALESCE((stock_by_store ->> t.from_store_id)::int, 0) - v_qty, 0)), true),
           stock_quantity = GREATEST(stock_quantity - v_qty, 0)
     WHERE id = it.product_id;
  END LOOP;

  UPDATE public.stock_transfers
     SET status = 'dispatched',
         dispatched_by = COALESCE(p_dispatched_by, dispatched_by),
         dispatched_at = now()
   WHERE id = t.id;
END $$;

-- Receiving books in what was actually sent.
CREATE OR REPLACE FUNCTION public.stock_transfer_receive(
  p_transfer_id uuid,
  p_received_by text DEFAULT NULL,
  p_deduct_source boolean DEFAULT false,
  p_lines jsonb DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  t public.stock_transfers;
  it record;
  v_target uuid;
  v_qty integer;
  v_src public.products;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Only staff can receive a transfer';
  END IF;

  SELECT * INTO t FROM public.stock_transfers WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TRANSFER_NOT_FOUND'; END IF;
  IF t.status = 'received' THEN RAISE EXCEPTION 'TRANSFER_ALREADY_RECEIVED'; END IF;
  IF t.status IN ('rejected', 'cancelled', 'completed') THEN RAISE EXCEPTION 'TRANSFER_CLOSED'; END IF;
  IF t.status <> 'dispatched' THEN
    RAISE EXCEPTION 'Transfer % has not been dispatched yet', t.ref;
  END IF;

  FOR it IN SELECT * FROM public.stock_transfer_items WHERE transfer_id = t.id LOOP
    v_qty := COALESCE(
      (SELECT (l ->> 'qty')::int FROM jsonb_array_elements(COALESCE(p_lines, '[]'::jsonb)) l
        WHERE l ->> 'product_id' = it.product_id::text LIMIT 1),
      NULLIF(it.quantity_received, 0),
      it.quantity_dispatched, it.quantity);
    v_qty := GREATEST(LEAST(v_qty, COALESCE(it.quantity_dispatched, it.quantity)), 0);

    UPDATE public.stock_transfer_items SET quantity_received = v_qty WHERE id = it.id;
    CONTINUE WHEN v_qty <= 0;

    SELECT * INTO v_src FROM public.products WHERE id = it.product_id;
    IF NOT FOUND THEN CONTINUE; END IF;

    v_target := it.product_id;

    -- Across clusters the receiving group keeps its own catalogue entry.
    IF t.transfer_scope = 'INTER_GROUP' AND COALESCE(v_src.barcode, '') <> '' THEN
      SELECT p.id INTO v_target
        FROM public.products p
       WHERE p.barcode = v_src.barcode
         AND COALESCE(p.stock_by_store ? t.to_store_id, false)
       LIMIT 1;
      IF v_target IS NULL THEN v_target := it.product_id; END IF;
    END IF;

    IF p_deduct_source THEN
      UPDATE public.products
         SET stock_by_store = jsonb_set(
               COALESCE(stock_by_store, '{}'::jsonb), ARRAY[t.from_store_id],
               to_jsonb(GREATEST(
                 COALESCE((stock_by_store ->> t.from_store_id)::int, 0) - v_qty, 0)), true),
             stock_quantity = GREATEST(stock_quantity - v_qty, 0)
       WHERE id = it.product_id;
    END IF;

    UPDATE public.products
       SET stock_by_store = jsonb_set(
             COALESCE(stock_by_store, '{}'::jsonb), ARRAY[t.to_store_id],
             to_jsonb(COALESCE((stock_by_store ->> t.to_store_id)::int, 0) + v_qty), true),
           stock_quantity = stock_quantity + v_qty
     WHERE id = v_target;
  END LOOP;

  UPDATE public.stock_transfers
     SET status = 'received', received_at = now(),
         received_by = COALESCE(p_received_by, received_by)
   WHERE id = t.id;
END $$;

REVOKE ALL ON FUNCTION public.stock_transfer_approve(uuid, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.stock_transfer_dispatch(uuid, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.stock_transfer_receive(uuid, text, boolean, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stock_transfer_approve(uuid, text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.stock_transfer_dispatch(uuid, text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.stock_transfer_receive(uuid, text, boolean, jsonb) TO authenticated, service_role;