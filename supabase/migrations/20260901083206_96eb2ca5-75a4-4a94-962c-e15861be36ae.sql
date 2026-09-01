ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS rounding_adjustment numeric(18,4) NOT NULL DEFAULT 0;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS rounding_label text;