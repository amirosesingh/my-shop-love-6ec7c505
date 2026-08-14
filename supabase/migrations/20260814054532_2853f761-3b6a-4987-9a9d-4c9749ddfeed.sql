ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS incident_note text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS barcode_variants jsonb NOT NULL DEFAULT '[]'::jsonb;