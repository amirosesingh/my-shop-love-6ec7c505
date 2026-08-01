
CREATE TABLE public.membership_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  discount_percentage NUMERIC NOT NULL DEFAULT 0,
  points_multiplier NUMERIC NOT NULL DEFAULT 1.0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barcode TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT,
  cost_price NUMERIC NOT NULL DEFAULT 0,
  selling_price NUMERIC NOT NULL DEFAULT 0,
  ecom_price NUMERIC,
  stock_quantity INTEGER NOT NULL DEFAULT 0,
  custom_points NUMERIC,
  point_multiplier NUMERIC NOT NULL DEFAULT 1.0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_code TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  email TEXT,
  address TEXT,
  date_of_birth DATE,
  tier_id UUID REFERENCES public.membership_tiers(id) ON DELETE SET NULL,
  loyalty_points NUMERIC NOT NULL DEFAULT 0,
  total_spent NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_number TEXT NOT NULL UNIQUE,
  member_id UUID REFERENCES public.members(id) ON DELETE SET NULL,
  store_id TEXT,
  cashier_name TEXT,
  subtotal_amount NUMERIC NOT NULL DEFAULT 0,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  discount_amount NUMERIC NOT NULL DEFAULT 0,
  tax_amount NUMERIC NOT NULL DEFAULT 0,
  payment_type TEXT NOT NULL DEFAULT 'cash',
  points_earned NUMERIC NOT NULL DEFAULT 0,
  points_redeemed NUMERIC NOT NULL DEFAULT 0,
  is_exchange BOOLEAN NOT NULL DEFAULT false,
  original_bill_number TEXT,
  is_refunded BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.sale_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  quantity INTEGER NOT NULL DEFAULT 1,
  discount_percent NUMERIC NOT NULL DEFAULT 0,
  discount_amount NUMERIC NOT NULL DEFAULT 0,
  is_return BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number TEXT NOT NULL UNIQUE,
  supplier_name TEXT,
  operator_name TEXT,
  total_cost NUMERIC NOT NULL DEFAULT 0,
  total_items_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.purchase_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  barcode TEXT,
  product_name TEXT,
  cost_price NUMERIC NOT NULL DEFAULT 0,
  selling_price NUMERIC NOT NULL DEFAULT 0,
  quantity_received INTEGER NOT NULL DEFAULT 0,
  subtotal_cost NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  promo_type TEXT NOT NULL,
  min_spend NUMERIC NOT NULL DEFAULT 0,
  discount_percent NUMERIC NOT NULL DEFAULT 0,
  discount_amount NUMERIC NOT NULL DEFAULT 0,
  foc_product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  points_per_dollar NUMERIC NOT NULL DEFAULT 1,
  tier_rates JSONB,
  is_active BOOLEAN NOT NULL DEFAULT true,
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.pos_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  tax_percentage NUMERIC NOT NULL DEFAULT 0,
  enable_tax BOOLEAN NOT NULL DEFAULT true,
  tax_mode TEXT NOT NULL DEFAULT 'exclusive',
  paper_size TEXT NOT NULL DEFAULT '80mm',
  header_text TEXT,
  footer_text TEXT,
  show_logo BOOLEAN NOT NULL DEFAULT true,
  show_points BOOLEAN NOT NULL DEFAULT true,
  show_barcode BOOLEAN NOT NULL DEFAULT true,
  show_tax_details BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_name TEXT,
  action_category TEXT NOT NULL,
  action_name TEXT NOT NULL,
  target_module TEXT,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sale_items_sale_id ON public.sale_items(sale_id);
CREATE INDEX idx_sales_member_id ON public.sales(member_id);
CREATE INDEX idx_sales_created_at ON public.sales(created_at DESC);
CREATE INDEX idx_audit_logs_created_at ON public.audit_logs(created_at DESC);
CREATE INDEX idx_po_items_po_id ON public.purchase_order_items(po_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.membership_tiers TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.members TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sale_items TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_orders TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_order_items TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.promotions TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pos_settings TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_logs TO anon, authenticated;
GRANT ALL ON public.membership_tiers TO service_role;
GRANT ALL ON public.products TO service_role;
GRANT ALL ON public.members TO service_role;
GRANT ALL ON public.sales TO service_role;
GRANT ALL ON public.sale_items TO service_role;
GRANT ALL ON public.purchase_orders TO service_role;
GRANT ALL ON public.purchase_order_items TO service_role;
GRANT ALL ON public.promotions TO service_role;
GRANT ALL ON public.pos_settings TO service_role;
GRANT ALL ON public.audit_logs TO service_role;

ALTER TABLE public.membership_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public access" ON public.membership_tiers FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Public access" ON public.products FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Public access" ON public.members FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Public access" ON public.sales FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Public access" ON public.sale_items FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Public access" ON public.purchase_orders FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Public access" ON public.purchase_order_items FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Public access" ON public.promotions FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Public access" ON public.pos_settings FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Public access" ON public.audit_logs FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

INSERT INTO public.membership_tiers (name, discount_percentage, points_multiplier) VALUES
  ('Bronze', 5, 1.0),
  ('Silver', 10, 1.25),
  ('Gold', 15, 1.5);

INSERT INTO public.pos_settings (id, tax_percentage, enable_tax, tax_mode, paper_size, header_text, footer_text)
VALUES (1, 8.5, true, 'exclusive', '80mm', 'LUMEN RETAIL', 'Thank you for shopping with us!');
