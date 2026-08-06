-- ============================================================
-- 04_register_sales.sql — Register: sales, sale lines, held tickets and cash drawer events
-- Lucky Charms POS. Safe to run repeatedly: nothing is dropped.
-- Requires 00_extensions_and_enums.sql and 02_staff_and_access.sql first.
-- ============================================================

-- ---------- tables, columns and indexes ----------
CREATE TABLE IF NOT EXISTS public.drawer_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  store_id text,
  terminal_id text,
  shift_id text,
  staff_id text,
  staff_name text,
  role text,
  reason text NOT NULL,
  note text,
  approved_by text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

ALTER TABLE public.drawer_events ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();

ALTER TABLE public.drawer_events ADD COLUMN IF NOT EXISTS store_id text;

ALTER TABLE public.drawer_events ADD COLUMN IF NOT EXISTS terminal_id text;

ALTER TABLE public.drawer_events ADD COLUMN IF NOT EXISTS shift_id text;

ALTER TABLE public.drawer_events ADD COLUMN IF NOT EXISTS staff_id text;

ALTER TABLE public.drawer_events ADD COLUMN IF NOT EXISTS staff_name text;

ALTER TABLE public.drawer_events ADD COLUMN IF NOT EXISTS role text;

ALTER TABLE public.drawer_events ADD COLUMN IF NOT EXISTS reason text;

ALTER TABLE public.drawer_events ADD COLUMN IF NOT EXISTS note text;

ALTER TABLE public.drawer_events ADD COLUMN IF NOT EXISTS approved_by text;

ALTER TABLE public.drawer_events ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS drawer_events_pkey ON public.drawer_events USING btree (id);

CREATE TABLE IF NOT EXISTS public.held_orders (
  id text DEFAULT (gen_random_uuid())::text NOT NULL,
  label text DEFAULT ''::text NOT NULL,
  store_id text,
  shift_id text,
  held_by text,
  total numeric DEFAULT 0 NOT NULL,
  lines jsonb DEFAULT '[]'::jsonb NOT NULL,
  cart_discount numeric DEFAULT 0 NOT NULL,
  cart_discount_type text DEFAULT 'amount'::text NOT NULL,
  exchange_ref text,
  member_id text,
  member_name text,
  coupon jsonb,
  note text DEFAULT ''::text NOT NULL,
  cancelled_from text,
  held_at timestamp with time zone DEFAULT now() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

ALTER TABLE public.held_orders ADD COLUMN IF NOT EXISTS id text DEFAULT (gen_random_uuid())::text;

ALTER TABLE public.held_orders ADD COLUMN IF NOT EXISTS label text DEFAULT ''::text;

ALTER TABLE public.held_orders ADD COLUMN IF NOT EXISTS store_id text;

ALTER TABLE public.held_orders ADD COLUMN IF NOT EXISTS shift_id text;

ALTER TABLE public.held_orders ADD COLUMN IF NOT EXISTS held_by text;

ALTER TABLE public.held_orders ADD COLUMN IF NOT EXISTS total numeric DEFAULT 0;

ALTER TABLE public.held_orders ADD COLUMN IF NOT EXISTS lines jsonb DEFAULT '[]'::jsonb;

ALTER TABLE public.held_orders ADD COLUMN IF NOT EXISTS cart_discount numeric DEFAULT 0;

ALTER TABLE public.held_orders ADD COLUMN IF NOT EXISTS cart_discount_type text DEFAULT 'amount'::text;

ALTER TABLE public.held_orders ADD COLUMN IF NOT EXISTS exchange_ref text;

ALTER TABLE public.held_orders ADD COLUMN IF NOT EXISTS member_id text;

ALTER TABLE public.held_orders ADD COLUMN IF NOT EXISTS member_name text;

ALTER TABLE public.held_orders ADD COLUMN IF NOT EXISTS coupon jsonb;

ALTER TABLE public.held_orders ADD COLUMN IF NOT EXISTS note text DEFAULT ''::text;

ALTER TABLE public.held_orders ADD COLUMN IF NOT EXISTS cancelled_from text;

ALTER TABLE public.held_orders ADD COLUMN IF NOT EXISTS held_at timestamp with time zone DEFAULT now();

ALTER TABLE public.held_orders ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();

ALTER TABLE public.held_orders ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS held_orders_pkey ON public.held_orders USING btree (id);

CREATE TABLE IF NOT EXISTS public.sale_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  sale_id uuid NOT NULL,
  product_id uuid,
  product_name text NOT NULL,
  unit_price numeric DEFAULT 0 NOT NULL,
  quantity integer DEFAULT 1 NOT NULL,
  discount_percent numeric DEFAULT 0 NOT NULL,
  discount_amount numeric DEFAULT 0 NOT NULL,
  is_return boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  tax_rate numeric DEFAULT 0 NOT NULL,
  is_foc boolean DEFAULT false NOT NULL,
  promo_id text,
  coupon_code text,
  coupon_discount numeric DEFAULT 0 NOT NULL,
  unit_cost numeric DEFAULT 0 NOT NULL,
  PRIMARY KEY (id)
);

ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();

ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS sale_id uuid;

ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS product_id uuid;

ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS product_name text;

ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS unit_price numeric DEFAULT 0;

ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS quantity integer DEFAULT 1;

ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS discount_percent numeric DEFAULT 0;

ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS discount_amount numeric DEFAULT 0;

ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS is_return boolean DEFAULT false;

ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();

ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS tax_rate numeric DEFAULT 0;

ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS is_foc boolean DEFAULT false;

ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS promo_id text;

ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS coupon_code text;

ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS coupon_discount numeric DEFAULT 0;

ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS unit_cost numeric DEFAULT 0;

DO $$ BEGIN ALTER TABLE public.sale_items ADD CONSTRAINT sale_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL; EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.sale_items ADD CONSTRAINT sale_items_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE; EXCEPTION WHEN others THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON public.sale_items USING btree (sale_id);

CREATE UNIQUE INDEX IF NOT EXISTS sale_items_pkey ON public.sale_items USING btree (id);

CREATE TABLE IF NOT EXISTS public.sales (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  bill_number text NOT NULL,
  member_id uuid,
  store_id text,
  cashier_name text,
  subtotal_amount numeric DEFAULT 0 NOT NULL,
  total_amount numeric DEFAULT 0 NOT NULL,
  discount_amount numeric DEFAULT 0 NOT NULL,
  tax_amount numeric DEFAULT 0 NOT NULL,
  payment_type text DEFAULT 'cash'::text NOT NULL,
  points_earned numeric DEFAULT 0 NOT NULL,
  points_redeemed numeric DEFAULT 0 NOT NULL,
  is_exchange boolean DEFAULT false NOT NULL,
  original_bill_number text,
  is_refunded boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  shift_id text,
  paid_amount numeric DEFAULT 0 NOT NULL,
  change_amount numeric DEFAULT 0 NOT NULL,
  exchange_credit numeric DEFAULT 0 NOT NULL,
  exchanged_to_bill_number text,
  coupon_code text,
  coupon_promo_id text,
  coupon_scope text,
  coupon_discount numeric DEFAULT 0 NOT NULL,
  payments jsonb DEFAULT '[]'::jsonb NOT NULL,
  PRIMARY KEY (id)
);

ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();

ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS bill_number text;

ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS member_id uuid;

ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS store_id text;

ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS cashier_name text;

ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS subtotal_amount numeric DEFAULT 0;

ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS total_amount numeric DEFAULT 0;

ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS discount_amount numeric DEFAULT 0;

ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS tax_amount numeric DEFAULT 0;

ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS payment_type text DEFAULT 'cash'::text;

ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS points_earned numeric DEFAULT 0;

ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS points_redeemed numeric DEFAULT 0;

ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS is_exchange boolean DEFAULT false;

ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS original_bill_number text;

ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS is_refunded boolean DEFAULT false;

ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();

ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS shift_id text;

ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS paid_amount numeric DEFAULT 0;

ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS change_amount numeric DEFAULT 0;

ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS exchange_credit numeric DEFAULT 0;

ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS exchanged_to_bill_number text;

ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS coupon_code text;

ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS coupon_promo_id text;

ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS coupon_scope text;

ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS coupon_discount numeric DEFAULT 0;

ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS payments jsonb DEFAULT '[]'::jsonb;

DO $$ BEGIN ALTER TABLE public.sales ADD CONSTRAINT sales_bill_number_key UNIQUE (bill_number); EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.sales ADD CONSTRAINT sales_member_id_fkey FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE SET NULL; EXCEPTION WHEN others THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_sales_created_at ON public.sales USING btree (created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS sales_pkey ON public.sales USING btree (id);

CREATE UNIQUE INDEX IF NOT EXISTS sales_bill_number_key ON public.sales USING btree (bill_number);

CREATE INDEX IF NOT EXISTS idx_sales_member_id ON public.sales USING btree (member_id);

-- ---------- triggers ----------
DROP TRIGGER IF EXISTS held_orders_touch_updated_at ON public.held_orders;

CREATE TRIGGER held_orders_touch_updated_at BEFORE UPDATE ON public.held_orders FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ---------- grants (Data API access) ----------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales TO authenticated;
GRANT ALL ON public.sales TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sale_items TO authenticated;
GRANT ALL ON public.sale_items TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.held_orders TO authenticated;
GRANT ALL ON public.held_orders TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.drawer_events TO authenticated;
GRANT ALL ON public.drawer_events TO service_role;

-- ---------- row level security ----------
ALTER TABLE public.drawer_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.held_orders ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

-- ---------- policies ----------
DROP POLICY IF EXISTS "Staff can append drawer events" ON public.drawer_events;

CREATE POLICY "Staff can append drawer events" ON public.drawer_events FOR INSERT TO authenticated WITH CHECK (is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff can read drawer events" ON public.drawer_events;

CREATE POLICY "Staff can read drawer events" ON public.drawer_events FOR SELECT TO authenticated USING (is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff manage held orders" ON public.held_orders;

CREATE POLICY "Staff manage held orders" ON public.held_orders FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Staff can delete" ON public.sale_items;

CREATE POLICY "Staff can delete" ON public.sale_items FOR DELETE TO authenticated USING (is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff can insert" ON public.sale_items;

CREATE POLICY "Staff can insert" ON public.sale_items FOR INSERT TO authenticated WITH CHECK (is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff can read sale items" ON public.sale_items;

CREATE POLICY "Staff can read sale items" ON public.sale_items FOR SELECT TO authenticated USING (is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff can update" ON public.sale_items;

CREATE POLICY "Staff can update" ON public.sale_items FOR UPDATE TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff can delete" ON public.sales;

CREATE POLICY "Staff can delete" ON public.sales FOR DELETE TO authenticated USING (is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff can insert" ON public.sales;

CREATE POLICY "Staff can insert" ON public.sales FOR INSERT TO authenticated WITH CHECK (is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff can read sales" ON public.sales;

CREATE POLICY "Staff can read sales" ON public.sales FOR SELECT TO authenticated USING (is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff can update" ON public.sales;

CREATE POLICY "Staff can update" ON public.sales FOR UPDATE TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));

-- ---------- verification ----------
SELECT t.name AS table_name,
       CASE WHEN to_regclass('public.' || t.name) IS NULL THEN 'MISSING' ELSE 'OK' END AS status
FROM (VALUES ('sales'),('sale_items'),('held_orders'),('drawer_events')) AS t(name);
