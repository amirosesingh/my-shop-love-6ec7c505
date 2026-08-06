ALTER TABLE public.pos_settings
  ADD COLUMN IF NOT EXISTS booking_slip jsonb NOT NULL DEFAULT '{}'::jsonb;