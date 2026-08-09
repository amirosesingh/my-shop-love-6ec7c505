-- ============================================================
-- 03_catalog.sql — Products, categories, units of measure and suppliers
-- Lucky Charms POS. Safe to run repeatedly: nothing is dropped.
-- Requires: 00_extensions_and_enums.sql, then 02_staff_and_access.sql
-- (row level security policies below call is_staff() / is_app_supervisor()).
-- ============================================================

-- ---------- tables, columns and indexes ----------
CREATE TABLE IF NOT EXISTS public.product_categories (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  parent_id uuid,
  sort integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

ALTER TABLE public.product_categories ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();

ALTER TABLE public.product_categories ADD COLUMN IF NOT EXISTS name text;

ALTER TABLE public.product_categories ADD COLUMN IF NOT EXISTS parent_id uuid;

ALTER TABLE public.product_categories ADD COLUMN IF NOT EXISTS sort integer DEFAULT 0;

ALTER TABLE public.product_categories ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();

ALTER TABLE public.product_categories ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();

DO $$ BEGIN ALTER TABLE public.product_categories ADD CONSTRAINT product_categories_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES product_categories(id) ON DELETE CASCADE; EXCEPTION WHEN others THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS product_categories_pkey ON public.product_categories USING btree (id);

CREATE TABLE IF NOT EXISTS public.products (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  barcode text NOT NULL,
  name text NOT NULL,
  category text,
  cost_price numeric DEFAULT 0 NOT NULL,
  selling_price numeric DEFAULT 0 NOT NULL,
  ecom_price numeric,
  stock_quantity integer DEFAULT 0 NOT NULL,
  custom_points numeric,
  point_multiplier numeric DEFAULT 1.0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  sku text,
  reorder_level integer DEFAULT 0 NOT NULL,
  tax_rate numeric DEFAULT 0 NOT NULL,
  ecom_visible boolean DEFAULT true NOT NULL,
  stock_by_store jsonb DEFAULT '{}'::jsonb NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  landing_pct numeric,
  sub_category text,
  unit text,
  packs jsonb DEFAULT '[]'::jsonb NOT NULL,
  barcode_aliases text[] DEFAULT '{}'::text[] NOT NULL,
  PRIMARY KEY (id)
);

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS barcode text;

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS name text;

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS category text;

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS cost_price numeric DEFAULT 0;

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS selling_price numeric DEFAULT 0;

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS ecom_price numeric;

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS stock_quantity integer DEFAULT 0;

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS custom_points numeric;

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS point_multiplier numeric DEFAULT 1.0;

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS sku text;

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS reorder_level integer DEFAULT 0;

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS tax_rate numeric DEFAULT 0;

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS ecom_visible boolean DEFAULT true;

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS stock_by_store jsonb DEFAULT '{}'::jsonb;

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS landing_pct numeric;

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS sub_category text;

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS unit text;

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS packs jsonb DEFAULT '[]'::jsonb;

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS barcode_aliases text[] DEFAULT '{}'::text[];

DO $$ BEGIN ALTER TABLE public.products ADD CONSTRAINT products_barcode_key UNIQUE (barcode); EXCEPTION WHEN others THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS products_pkey ON public.products USING btree (id);

CREATE UNIQUE INDEX IF NOT EXISTS products_sku_unique_idx ON public.products USING btree (lower(sku)) WHERE ((sku IS NOT NULL) AND (sku <> ''::text));

CREATE UNIQUE INDEX IF NOT EXISTS products_barcode_key ON public.products USING btree (barcode);

CREATE TABLE IF NOT EXISTS public.suppliers (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  contact_name text,
  phone text,
  email text,
  address text,
  tax_number text,
  notes text,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();

ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS name text;

ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS contact_name text;

ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS phone text;

ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS email text;

ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS address text;

ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS tax_number text;

ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS notes text;

ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();

ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS suppliers_pkey ON public.suppliers USING btree (id);

CREATE TABLE IF NOT EXISTS public.uom_units (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  allow_decimal boolean DEFAULT false NOT NULL,
  sort integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

ALTER TABLE public.uom_units ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();

ALTER TABLE public.uom_units ADD COLUMN IF NOT EXISTS code text;

ALTER TABLE public.uom_units ADD COLUMN IF NOT EXISTS name text;

ALTER TABLE public.uom_units ADD COLUMN IF NOT EXISTS allow_decimal boolean DEFAULT false;

ALTER TABLE public.uom_units ADD COLUMN IF NOT EXISTS sort integer DEFAULT 0;

ALTER TABLE public.uom_units ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();

ALTER TABLE public.uom_units ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();

DO $$ BEGIN ALTER TABLE public.uom_units ADD CONSTRAINT uom_units_code_key UNIQUE (code); EXCEPTION WHEN others THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uom_units_code_key ON public.uom_units USING btree (code);

CREATE UNIQUE INDEX IF NOT EXISTS uom_units_pkey ON public.uom_units USING btree (id);

-- ---------- triggers ----------
DROP TRIGGER IF EXISTS product_categories_set_updated_at ON public.product_categories;

CREATE TRIGGER product_categories_set_updated_at BEFORE UPDATE ON public.product_categories FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS products_set_updated_at ON public.products;

CREATE TRIGGER products_set_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS suppliers_set_updated_at ON public.suppliers;

CREATE TRIGGER suppliers_set_updated_at BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS uom_units_set_updated_at ON public.uom_units;

CREATE TRIGGER uom_units_set_updated_at BEFORE UPDATE ON public.uom_units FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------- grants (Data API access) ----------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
GRANT SELECT ON public.products TO anon;  -- public claim / storefront pages
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_categories TO authenticated;
GRANT ALL ON public.product_categories TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.uom_units TO authenticated;
GRANT ALL ON public.uom_units TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppliers TO authenticated;
GRANT ALL ON public.suppliers TO service_role;

-- ---------- row level security ----------
ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.uom_units ENABLE ROW LEVEL SECURITY;

-- ---------- policies ----------
DROP POLICY IF EXISTS "Staff can manage product categories" ON public.product_categories;

CREATE POLICY "Staff can manage product categories" ON public.product_categories FOR ALL TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff can read product categories" ON public.product_categories;

CREATE POLICY "Staff can read product categories" ON public.product_categories FOR SELECT TO authenticated USING (is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff can delete" ON public.products;

CREATE POLICY "Staff can delete" ON public.products FOR DELETE TO authenticated USING (is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff can insert" ON public.products;

CREATE POLICY "Staff can insert" ON public.products FOR INSERT TO authenticated WITH CHECK (is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff can read products" ON public.products;

CREATE POLICY "Staff can read products" ON public.products FOR SELECT TO authenticated USING (is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff can update" ON public.products;

CREATE POLICY "Staff can update" ON public.products FOR UPDATE TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff can manage suppliers" ON public.suppliers;

CREATE POLICY "Staff can manage suppliers" ON public.suppliers FOR ALL TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff can read suppliers" ON public.suppliers;

CREATE POLICY "Staff can read suppliers" ON public.suppliers FOR SELECT TO authenticated USING (is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff can manage units" ON public.uom_units;

CREATE POLICY "Staff can manage units" ON public.uom_units FOR ALL TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff can read units" ON public.uom_units;

CREATE POLICY "Staff can read units" ON public.uom_units FOR SELECT TO authenticated USING (is_staff(auth.uid()));

-- ---------- verification ----------
SELECT t.name AS table_name,
       CASE WHEN to_regclass('public.' || t.name) IS NULL THEN 'MISSING' ELSE 'OK' END AS status
FROM (VALUES ('products'),('product_categories'),('uom_units'),('suppliers')) AS t(name);

-- Archived products stay in history but leave the till and web catalogue.
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS archived_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_products_is_archived ON public.products (is_archived);
