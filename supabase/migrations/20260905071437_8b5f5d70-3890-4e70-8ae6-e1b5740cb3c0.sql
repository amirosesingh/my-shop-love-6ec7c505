ALTER TABLE public.uom_units ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE public.product_categories ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;