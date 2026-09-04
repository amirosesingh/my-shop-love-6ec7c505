-- 1. Per-line refunded quantity ------------------------------------------
ALTER TABLE public.sale_items
  ADD COLUMN IF NOT EXISTS refunded_qty integer NOT NULL DEFAULT 0;

ALTER TABLE public.sale_items
  DROP CONSTRAINT IF EXISTS sale_items_refunded_qty_bounds;
ALTER TABLE public.sale_items
  ADD CONSTRAINT sale_items_refunded_qty_bounds
  CHECK (refunded_qty >= 0 AND refunded_qty <= GREATEST(quantity, 0));

-- 2. Only the refund routine may move those figures ------------------------
CREATE OR REPLACE FUNCTION public.guard_refund_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF coalesce(current_setting('pos.refunding', true), '') = 'on' THEN
    RETURN NEW;
  END IF;
  IF auth.uid() IS NULL THEN
    RETURN NEW; -- trusted server paths (service role) do their own checks
  END IF;
  IF TG_TABLE_NAME = 'sale_items'
     AND NEW.refunded_qty IS DISTINCT FROM OLD.refunded_qty THEN
    RAISE EXCEPTION 'Refunded quantity can only be changed by processing a refund';
  END IF;
  IF TG_TABLE_NAME = 'sales'
     AND coalesce(NEW.is_refunded, false) IS DISTINCT FROM coalesce(OLD.is_refunded, false) THEN
    RAISE EXCEPTION 'A bill can only be marked refunded by processing a refund';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_sale_items_refunded_qty ON public.sale_items;
CREATE TRIGGER guard_sale_items_refunded_qty
BEFORE UPDATE ON public.sale_items
FOR EACH ROW EXECUTE FUNCTION public.guard_refund_fields();

DROP TRIGGER IF EXISTS guard_sales_refunded ON public.sales;
CREATE TRIGGER guard_sales_refunded
BEFORE UPDATE ON public.sales
FOR EACH ROW EXECUTE FUNCTION public.guard_refund_fields();

-- 3. The refund routine ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.sale_refund(
  _sale_id uuid,
  _lines jsonb DEFAULT NULL,
  _client_refund_id text DEFAULT NULL,
  _reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  _sale public.sales%ROWTYPE;
  _key text := coalesce(nullif(btrim(coalesce(_client_refund_id, '')), ''), _sale_id::text);
  _item record;
  _want integer;
  _remaining integer;
  _movement uuid;
  _stock integer;
  _results jsonb := '[]'::jsonb;
  _outstanding integer;
BEGIN
  IF NOT public.is_staff_now() THEN
    RAISE EXCEPTION 'Sign in with a staff account to process a refund';
  END IF;
  IF NOT public.has_perm('can_process_refund') THEN
    RAISE EXCEPTION 'You are not allowed to process refunds';
  END IF;

  SELECT * INTO _sale FROM public.sales WHERE id = _sale_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown bill';
  END IF;
  IF NOT public.user_has_store_access(_sale.store_id) THEN
    RAISE EXCEPTION 'You can only refund bills from your own branch';
  END IF;

  PERFORM set_config('pos.refunding', 'on', true);

  FOR _item IN
    SELECT si.id, si.product_id, si.quantity, si.refunded_qty
      FROM public.sale_items si
     WHERE si.sale_id = _sale_id
     ORDER BY si.id
     FOR UPDATE
  LOOP
    IF _lines IS NULL OR jsonb_array_length(_lines) = 0 THEN
      _want := GREATEST(_item.quantity, 0) - _item.refunded_qty;
    ELSE
      SELECT COALESCE(SUM(GREATEST((l ->> 'qty')::int, 0)), 0) INTO _want
        FROM jsonb_array_elements(_lines) l
       WHERE (l ->> 'item_id') = _item.id::text
          OR ((l ->> 'item_id') IS NULL AND (l ->> 'product_id') = _item.product_id::text);
    END IF;

    CONTINUE WHEN coalesce(_want, 0) <= 0;

    _remaining := GREATEST(_item.quantity, 0) - _item.refunded_qty;
    IF _want > _remaining THEN
      RAISE EXCEPTION 'Cannot return % of "%": only % left to return',
        _want, _item.product_id, _remaining;
    END IF;

    UPDATE public.sale_items
       SET refunded_qty = refunded_qty + _want
     WHERE id = _item.id;

    -- Deterministic movement id: replaying the same refund moves no stock.
    _movement := md5(_key || ':' || _item.id::text)::uuid;
    _stock := public.stock_apply_delta(_movement, _item.product_id, _sale.store_id, _want);
    _results := _results || jsonb_build_object(
      'item_id', _item.id,
      'product_id', _item.product_id,
      'qty', _want,
      'stock', _stock
    );
  END LOOP;

  SELECT COALESCE(SUM(GREATEST(si.quantity, 0) - si.refunded_qty), 0) INTO _outstanding
    FROM public.sale_items si WHERE si.sale_id = _sale_id;

  IF _outstanding = 0 THEN
    UPDATE public.sales
       SET is_refunded = true, updated_by = coalesce(auth.uid()::text, updated_by)
     WHERE id = _sale_id AND coalesce(is_refunded, false) = false;
  END IF;

  BEGIN
    INSERT INTO public.audit_logs (action, entity_type, entity_id, user_id, details)
    VALUES ('sale_refund', 'sale', _sale_id::text, auth.uid(),
            jsonb_build_object('reason', _reason, 'lines', _results, 'refund_id', _key));
  EXCEPTION WHEN others THEN
    NULL; -- the audit shape varies by deployment; never block the refund
  END;

  PERFORM set_config('pos.refunding', 'off', true);

  RETURN jsonb_build_object(
    'sale_id', _sale_id,
    'fully_refunded', _outstanding = 0,
    'lines', _results
  );
END;
$$;

REVOKE ALL ON FUNCTION public.sale_refund(uuid, jsonb, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.sale_refund(uuid, jsonb, text, text) TO authenticated, service_role;

-- 4. Narrow a couple of over-broad read policies ---------------------------
DROP POLICY IF EXISTS payment_types_read ON public.payment_types;
CREATE POLICY payment_types_read ON public.payment_types
FOR SELECT TO authenticated USING (public.is_staff_now());

DROP POLICY IF EXISTS "Staff read authorisation rules" ON public.authorization_actions;
CREATE POLICY "Staff read authorisation rules" ON public.authorization_actions
FOR SELECT TO authenticated
USING (public.is_staff_now() AND (scope_id = '' OR public.store_visible(scope_id)));

DROP POLICY IF EXISTS "Staff read authorisation log" ON public.authorization_log;
CREATE POLICY "Staff read authorisation log" ON public.authorization_log
FOR SELECT TO authenticated
USING (public.is_staff_now() AND (store_id = '' OR public.store_visible(store_id)));

DROP POLICY IF EXISTS "Staff read authorisation requests" ON public.authorization_requests;
CREATE POLICY "Staff read authorisation requests" ON public.authorization_requests
FOR SELECT TO authenticated
USING (public.is_staff_now() AND (store_id = '' OR public.store_visible(store_id)));