ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS store_id text;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS store_code text;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS invoice_date date;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS invoice_entry_date timestamp with time zone DEFAULT now();
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone NOT NULL DEFAULT now();

UPDATE public.purchase_orders
   SET invoice_entry_date = COALESCE(invoice_entry_date, created_at, now())
 WHERE invoice_entry_date IS NULL;

ALTER TABLE public.purchase_order_items ADD COLUMN IF NOT EXISTS sku text;
ALTER TABLE public.purchase_order_items ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS purchase_orders_touch_updated_at ON public.purchase_orders;
CREATE TRIGGER purchase_orders_touch_updated_at
BEFORE UPDATE ON public.purchase_orders
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS purchase_order_items_touch_updated_at ON public.purchase_order_items;
CREATE TRIGGER purchase_order_items_touch_updated_at
BEFORE UPDATE ON public.purchase_order_items
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX IF NOT EXISTS idx_purchase_orders_store_entry
  ON public.purchase_orders USING btree (store_id, invoice_entry_date DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_orders TO authenticated;
GRANT ALL ON public.purchase_orders TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_order_items TO authenticated;
GRANT ALL ON public.purchase_order_items TO service_role;