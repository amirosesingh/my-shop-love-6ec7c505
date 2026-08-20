-- Batch relative stock application. Each element reuses the single-movement
-- routine, so the replay guard and branch check are unchanged.
CREATE OR REPLACE FUNCTION public.stock_apply_deltas(_movements jsonb)
RETURNS TABLE(movement_id uuid, status text, balance integer, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _m jsonb;
  _seen uuid[] := ARRAY[]::uuid[];
  _id uuid;
  _pid uuid;
  _store text;
  _delta integer;
  _bal integer;
  _existed boolean;
BEGIN
  FOR _m IN SELECT * FROM jsonb_array_elements(COALESCE(_movements, '[]'::jsonb)) LOOP
    BEGIN
      _id := NULLIF(_m ->> 'movement_id', '')::uuid;
      _pid := NULLIF(_m ->> 'product_id', '')::uuid;
      _store := NULLIF(_m ->> 'store_id', '');
      _delta := COALESCE((_m ->> 'delta')::int, 0);
    EXCEPTION WHEN others THEN
      movement_id := NULL; status := 'refused'; balance := NULL; reason := 'invalid';
      RETURN NEXT; CONTINUE;
    END;

    IF _id IS NULL OR _pid IS NULL THEN
      movement_id := _id; status := 'refused'; balance := NULL; reason := 'invalid';
      RETURN NEXT; CONTINUE;
    END IF;

    -- A movement id repeated inside one batch is answered once.
    IF _id = ANY(_seen) THEN
      movement_id := _id; status := 'duplicate'; balance := NULL; reason := NULL;
      RETURN NEXT; CONTINUE;
    END IF;
    _seen := _seen || _id;

    SELECT EXISTS(SELECT 1 FROM public.stock_delta_applied s WHERE s.movement_id = _id)
      INTO _existed;

    BEGIN
      _bal := public.stock_apply_delta(_id, _pid, _store, _delta);
      movement_id := _id;
      status := CASE WHEN _existed THEN 'duplicate' ELSE 'applied' END;
      balance := _bal;
      reason := NULL;
      RETURN NEXT;
    EXCEPTION WHEN others THEN
      movement_id := _id;
      status := 'refused';
      balance := NULL;
      reason := CASE
        WHEN SQLERRM ILIKE '%own branch%' THEN 'not_permitted'
        WHEN SQLERRM ILIKE '%unknown product%' THEN 'unknown_product'
        WHEN SQLERRM ILIKE '%required%' THEN 'invalid'
        ELSE 'failed'
      END;
      RETURN NEXT;
    END;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.stock_apply_deltas(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.stock_apply_deltas(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.stock_apply_deltas(jsonb) TO service_role;

-- Read-only drift report for one branch.
CREATE OR REPLACE FUNCTION public.stock_reconcile(_store_id text, _since timestamptz DEFAULT (now() - interval '30 days'))
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _missing jsonb;
  _mismatched jsonb;
  _products jsonb;
BEGIN
  IF _store_id IS NULL OR NOT public.store_visible(_store_id) THEN
    RAISE EXCEPTION 'You can only reconcile your own branch';
  END IF;

  -- Movement exists in the ledger but no central application was recorded.
  SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) INTO _missing FROM (
    SELECT l.id AS movement_id, l.product_id, l.quantity_delta AS delta, l.created_at
      FROM public.item_activity_logs l
      LEFT JOIN public.stock_delta_applied s ON s.movement_id = l.id
     WHERE l.store_id = _store_id
       AND COALESCE(l.quantity_delta, 0) <> 0
       AND l.created_at >= _since
       AND s.movement_id IS NULL
     ORDER BY l.created_at DESC
     LIMIT 200
  ) x;

  -- Applied, but for a different amount than the ledger row says: the sign of
  -- a movement that reached the centre more than once, or was edited after.
  SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) INTO _mismatched FROM (
    SELECT l.id AS movement_id, l.product_id, l.quantity_delta AS ledger_delta, s.delta AS applied_delta
      FROM public.item_activity_logs l
      JOIN public.stock_delta_applied s ON s.movement_id = l.id
     WHERE l.store_id = _store_id
       AND l.created_at >= _since
       AND COALESCE(s.delta, 0) <> COALESCE(l.quantity_delta, 0)
     ORDER BY l.created_at DESC
     LIMIT 200
  ) x;

  -- Central figure against the sum of everything applied for this branch.
  SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) INTO _products FROM (
    SELECT p.id AS product_id,
           COALESCE((p.stock_by_store ->> _store_id)::int, 0) AS central,
           a.applied_sum
      FROM (
        SELECT product_id, SUM(delta)::int AS applied_sum
          FROM public.stock_delta_applied
         WHERE store_id = _store_id
         GROUP BY product_id
      ) a
      JOIN public.products p ON p.id = a.product_id
     WHERE COALESCE((p.stock_by_store ->> _store_id)::int, 0) <> a.applied_sum
     LIMIT 200
  ) x;

  RETURN jsonb_build_object(
    'store_id', _store_id,
    'checked_at', now(),
    'not_applied', _missing,
    'amount_mismatch', _mismatched,
    'stock_mismatch', _products
  );
END;
$$;

REVOKE ALL ON FUNCTION public.stock_reconcile(text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.stock_reconcile(text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.stock_reconcile(text, timestamptz) TO service_role;