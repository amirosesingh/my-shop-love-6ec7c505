-- 1. Per-table sync high-water marks
CREATE TABLE public.sync_metadata (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id text,
  terminal_id text,
  table_name text NOT NULL,
  last_synced_at timestamptz,
  last_pushed_at timestamptz,
  rows_pushed integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, terminal_id, table_name)
);

GRANT SELECT, INSERT, UPDATE ON public.sync_metadata TO authenticated;
GRANT ALL ON public.sync_metadata TO service_role;

ALTER TABLE public.sync_metadata ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sync_metadata_select_own_branch" ON public.sync_metadata
  FOR SELECT TO authenticated
  USING (store_id IS NULL OR public.store_visible(store_id));

CREATE POLICY "sync_metadata_insert_own_branch" ON public.sync_metadata
  FOR INSERT TO authenticated
  WITH CHECK (store_id IS NULL OR public.store_visible(store_id));

CREATE POLICY "sync_metadata_update_own_branch" ON public.sync_metadata
  FOR UPDATE TO authenticated
  USING (store_id IS NULL OR public.store_visible(store_id))
  WITH CHECK (store_id IS NULL OR public.store_visible(store_id));

CREATE TRIGGER sync_metadata_touch
  BEFORE UPDATE ON public.sync_metadata
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2. Idempotency ledger for relative stock movements
CREATE TABLE public.stock_delta_applied (
  movement_id uuid NOT NULL PRIMARY KEY,
  product_id uuid,
  store_id text,
  delta integer NOT NULL DEFAULT 0,
  applied_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.stock_delta_applied TO authenticated;
GRANT ALL ON public.stock_delta_applied TO service_role;

ALTER TABLE public.stock_delta_applied ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stock_delta_applied_select_own_branch" ON public.stock_delta_applied
  FOR SELECT TO authenticated
  USING (store_id IS NULL OR public.store_visible(store_id));

-- 3. Optimistic locking counter on products
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS row_version integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.products_bump_row_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.row_version := COALESCE(OLD.row_version, 0) + 1;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS products_row_version ON public.products;
CREATE TRIGGER products_row_version
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.products_bump_row_version();

-- 4. Relative, replay-safe stock movement
CREATE OR REPLACE FUNCTION public.stock_apply_delta(
  _movement_id uuid,
  _product_id uuid,
  _store_id text,
  _delta integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _stock jsonb;
  _current integer;
  _next integer;
BEGIN
  IF _movement_id IS NULL OR _product_id IS NULL THEN
    RAISE EXCEPTION 'movement id and product id are required';
  END IF;
  IF _store_id IS NULL OR NOT public.store_visible(_store_id) THEN
    RAISE EXCEPTION 'You can only adjust stock for your own branch';
  END IF;

  -- Replay guard: the same movement never moves stock twice.
  INSERT INTO public.stock_delta_applied (movement_id, product_id, store_id, delta)
  VALUES (_movement_id, _product_id, _store_id, COALESCE(_delta, 0))
  ON CONFLICT (movement_id) DO NOTHING;
  IF NOT FOUND THEN
    SELECT COALESCE((stock_by_store ->> _store_id)::int, 0) INTO _current
      FROM public.products WHERE id = _product_id;
    RETURN COALESCE(_current, 0);
  END IF;

  SELECT COALESCE(stock_by_store, '{}'::jsonb) INTO _stock
    FROM public.products WHERE id = _product_id FOR UPDATE;
  IF _stock IS NULL THEN
    RAISE EXCEPTION 'Unknown product';
  END IF;

  _current := COALESCE((_stock ->> _store_id)::int, 0);
  _next := _current + COALESCE(_delta, 0);
  _stock := jsonb_set(_stock, ARRAY[_store_id], to_jsonb(_next), true);

  UPDATE public.products
     SET stock_by_store = _stock,
         stock_quantity = (
           SELECT COALESCE(SUM(value::int), 0) FROM jsonb_each_text(_stock)
         ),
         updated_at = now()
   WHERE id = _product_id;

  RETURN _next;
END;
$$;

REVOKE ALL ON FUNCTION public.stock_apply_delta(uuid, uuid, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stock_apply_delta(uuid, uuid, text, integer) TO authenticated, service_role;