ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'posted';

UPDATE public.purchase_orders SET status = 'posted' WHERE status IS NULL OR status = '';

ALTER TABLE public.purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_po_number_key;

ALTER TABLE public.purchase_orders ALTER COLUMN po_number DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS purchase_orders_po_number_posted_uidx
  ON public.purchase_orders (po_number)
  WHERE status = 'posted' AND po_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS purchase_orders_store_status_idx
  ON public.purchase_orders (store_id, status);