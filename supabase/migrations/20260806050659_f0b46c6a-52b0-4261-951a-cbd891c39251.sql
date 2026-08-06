CREATE TABLE IF NOT EXISTS public.held_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL DEFAULT '',
  store_id text,
  shift_id text,
  held_by text,
  total numeric NOT NULL DEFAULT 0,
  lines jsonb NOT NULL DEFAULT '[]'::jsonb,
  cart_discount numeric NOT NULL DEFAULT 0,
  cart_discount_type text NOT NULL DEFAULT 'amount',
  exchange_ref text,
  member_id uuid,
  member_name text,
  coupon jsonb,
  note text NOT NULL DEFAULT '',
  cancelled_from text,
  held_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.held_orders TO authenticated;
GRANT ALL ON public.held_orders TO service_role;
ALTER TABLE public.held_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff manage held orders" ON public.held_orders FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER held_orders_touch_updated_at BEFORE UPDATE ON public.held_orders FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.stock_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_name text,
  sku text,
  barcode text,
  store_id text,
  terminal_id text,
  reason text NOT NULL DEFAULT 'manual',
  note text NOT NULL DEFAULT '',
  previous_stock integer NOT NULL DEFAULT 0,
  updated_stock integer NOT NULL DEFAULT 0,
  delta integer NOT NULL DEFAULT 0,
  cost_impact numeric NOT NULL DEFAULT 0,
  staff_id text,
  staff_name text,
  role text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_adjustments TO authenticated;
GRANT ALL ON public.stock_adjustments TO service_role;
ALTER TABLE public.stock_adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read stock adjustments" ON public.stock_adjustments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff add stock adjustments" ON public.stock_adjustments FOR INSERT TO authenticated WITH CHECK (true);
CREATE INDEX IF NOT EXISTS stock_adjustments_created_idx ON public.stock_adjustments (created_at DESC);

CREATE TABLE IF NOT EXISTS public.whatsapp_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number_id text NOT NULL DEFAULT '',
  recipient text NOT NULL,
  body text NOT NULL DEFAULT '',
  reference text,
  store_id text,
  status text NOT NULL DEFAULT 'QUEUED',
  error text,
  queued_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_queue TO authenticated;
GRANT ALL ON public.whatsapp_queue TO service_role;
ALTER TABLE public.whatsapp_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff manage whatsapp queue" ON public.whatsapp_queue FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER whatsapp_queue_touch_updated_at BEFORE UPDATE ON public.whatsapp_queue FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();