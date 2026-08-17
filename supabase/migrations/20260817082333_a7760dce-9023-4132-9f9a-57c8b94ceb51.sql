ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS is_primary_sub boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_stores_parent_id ON public.stores (parent_id);
CREATE INDEX IF NOT EXISTS idx_stores_location_type ON public.stores (location_type);