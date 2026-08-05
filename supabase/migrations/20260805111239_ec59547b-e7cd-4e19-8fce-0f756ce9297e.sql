CREATE OR REPLACE FUNCTION public.stock_transfer_receive(
  p_transfer_id uuid,
  p_received_by text DEFAULT NULL,
  p_deduct_source boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
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
  IF t.status IN ('rejected', 'cancelled') THEN RAISE EXCEPTION 'TRANSFER_CLOSED'; END IF;

  FOR it IN SELECT * FROM public.stock_transfer_items WHERE transfer_id = t.id LOOP
    v_qty := CASE WHEN it.quantity_received > 0 THEN it.quantity_received ELSE it.quantity END;
    CONTINUE WHEN v_qty <= 0;

    SELECT * INTO v_src FROM public.products WHERE id = it.product_id;
    IF NOT FOUND THEN CONTINUE; END IF;

    v_target := it.product_id;

    -- Across clusters the receiving group keeps its own catalogue entry.
    IF t.transfer_scope = 'INTER_GROUP' AND coalesce(v_src.barcode, '') <> '' THEN
      SELECT p.id INTO v_target
        FROM public.products p
       WHERE p.barcode = v_src.barcode
         AND coalesce(p.stock_by_store ? t.to_store_id, false)
       LIMIT 1;
      IF v_target IS NULL THEN v_target := it.product_id; END IF;
    END IF;

    IF p_deduct_source THEN
      UPDATE public.products
         SET stock_by_store = jsonb_set(
               coalesce(stock_by_store, '{}'::jsonb), ARRAY[t.from_store_id],
               to_jsonb(greatest(
                 coalesce((stock_by_store ->> t.from_store_id)::int, 0) - v_qty, 0)), true),
             stock_quantity = greatest(stock_quantity - v_qty, 0)
       WHERE id = it.product_id;
    END IF;

    UPDATE public.products
       SET stock_by_store = jsonb_set(
             coalesce(stock_by_store, '{}'::jsonb), ARRAY[t.to_store_id],
             to_jsonb(coalesce((stock_by_store ->> t.to_store_id)::int, 0) + v_qty), true),
           stock_quantity = stock_quantity + v_qty
     WHERE id = v_target;

    UPDATE public.stock_transfer_items SET quantity_received = v_qty WHERE id = it.id;
  END LOOP;

  UPDATE public.stock_transfers
     SET status = 'received', received_at = now(),
         received_by = coalesce(p_received_by, received_by)
   WHERE id = t.id;
END $$;

DROP FUNCTION IF EXISTS public.stock_transfer_receive(uuid, text);

REVOKE ALL ON FUNCTION public.stock_transfer_receive(uuid, text, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.stock_transfer_receive(uuid, text, boolean) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';