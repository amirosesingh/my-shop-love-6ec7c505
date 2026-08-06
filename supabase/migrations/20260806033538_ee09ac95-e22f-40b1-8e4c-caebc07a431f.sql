ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS sub_category text,
  ADD COLUMN IF NOT EXISTS unit text,
  ADD COLUMN IF NOT EXISTS packs jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS barcode_aliases text[] NOT NULL DEFAULT '{}'::text[];

CREATE TABLE IF NOT EXISTS public.product_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  parent_id uuid REFERENCES public.product_categories(id) ON DELETE CASCADE,
  sort integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_categories TO authenticated;
GRANT ALL ON public.product_categories TO service_role;
ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can read product categories" ON public.product_categories
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff can manage product categories" ON public.product_categories
  FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE TRIGGER product_categories_set_updated_at
  BEFORE UPDATE ON public.product_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.uom_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  allow_decimal boolean NOT NULL DEFAULT false,
  sort integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.uom_units TO authenticated;
GRANT ALL ON public.uom_units TO service_role;
ALTER TABLE public.uom_units ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can read units" ON public.uom_units
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff can manage units" ON public.uom_units
  FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE TRIGGER uom_units_set_updated_at
  BEFORE UPDATE ON public.uom_units
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.uom_units (code, name, allow_decimal, sort) VALUES
  ('pcs', 'Pieces', false, 1),
  ('box', 'Box', false, 2),
  ('pack', 'Pack', false, 3),
  ('set', 'Set', false, 4),
  ('kg', 'Kilogram', true, 5),
  ('g', 'Gram', true, 6),
  ('l', 'Litre', true, 7),
  ('m', 'Metre', true, 8)
ON CONFLICT (code) DO NOTHING;