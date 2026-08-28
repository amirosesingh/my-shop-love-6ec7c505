ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS reference text;

CREATE UNIQUE INDEX IF NOT EXISTS purchase_orders_reference_uidx
  ON public.purchase_orders (reference)
  WHERE reference IS NOT NULL;

CREATE INDEX IF NOT EXISTS purchase_orders_store_status_created_idx
  ON public.purchase_orders (store_id, status, created_at DESC);