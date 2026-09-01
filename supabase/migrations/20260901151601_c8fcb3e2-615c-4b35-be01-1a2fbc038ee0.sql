CREATE OR REPLACE FUNCTION public.stock_transfer_dispatch(p_transfer_id uuid, p_dispatched_by text DEFAULT NULL::text, p_lines jsonb DEFAULT NULL::jsonb)
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
      FROM public.products WHERE id = it.product_id;

    UPDATE public.products
       SET stock_by_store = jsonb_set(
             COALESCE(stock_by_store, '{}'::jsonb), ARRAY[t.from_store_id],
             to_jsonb(GREATEST(
               COALESCE((stock_by_store ->> t.from_store_id)::int, 0) - v_qty, 0)), true),
           stock_quantity = GREATEST(stock_quantity - v_qty, 0)
     WHERE id = it.product_id;

    INSERT INTO public.item_activity_logs
      (product_id, product_name, store_id, activity_type, reference,
       quantity_delta, stock_before, stock_after, unit_cost, staff_name, note)
    SELECT it.product_id, p.name, t.from_store_id, 'transfer_out', t.ref,
           -v_qty, COALESCE(v_before, 0), GREATEST(COALESCE(v_before, 0) - v_qty, 0),
           COALESCE(p.cost_price, 0), COALESCE(p_dispatched_by, ''), ''
      FROM public.products p WHERE p.id = it.product_id;
  END LOOP;

  UPDATE public.stock_transfers
     SET status = 'dispatched',
         dispatched_by = COALESCE(p_dispatched_by, dispatched_by),
         dispatched_at = now()
   WHERE id = t.id;
END $function$;

CREATE OR REPLACE FUNCTION public.stock_transfer_receive(p_transfer_id uuid, p_received_by text DEFAULT NULL::text, p_deduct_source boolean DEFAULT false, p_lines jsonb DEFAULT NULL::jsonb)
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
      SELECT COALESCE((stock_by_store ->> t.from_store_id)::int, 0) INTO v_before
        FROM public.products WHERE id = it.product_id;

      UPDATE public.products
         SET stock_by_store = jsonb_set(
               COALESCE(stock_by_store, '{}'::jsonb), ARRAY[t.from_store_id],
               to_jsonb(GREATEST(
                 COALESCE((stock_by_store ->> t.from_store_id)::int, 0) - v_qty, 0)), true),
             stock_quantity = GREATEST(stock_quantity - v_qty, 0)
       WHERE id = it.product_id;

      INSERT INTO public.item_activity_logs
        (product_id, product_name, store_id, activity_type, reference,
         quantity_delta, stock_before, stock_after, unit_cost, staff_name, note)
      VALUES (it.product_id, v_src.name, t.from_store_id, 'transfer_out', t.ref,
              -v_qty, COALESCE(v_before, 0), GREATEST(COALESCE(v_before, 0) - v_qty, 0),
              COALESCE(v_src.cost_price, 0), COALESCE(p_received_by, ''), '');
    END IF;

    SELECT COALESCE((stock_by_store ->> t.to_store_id)::int, 0) INTO v_before
      FROM public.products WHERE id = v_target;

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
           COALESCE(p.cost_price, 0), COALESCE(p_received_by, ''), ''
      FROM public.products p WHERE p.id = v_target;
  END LOOP;

  UPDATE public.stock_transfers
     SET status = 'received', received_at = now(),
         received_by = COALESCE(p_received_by, received_by)
   WHERE id = t.id;
END $function$;