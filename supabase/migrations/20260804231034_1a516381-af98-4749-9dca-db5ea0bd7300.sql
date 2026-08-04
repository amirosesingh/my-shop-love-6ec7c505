ALTER TABLE public.pos_settings
  ADD COLUMN IF NOT EXISTS integration_settings jsonb NOT NULL DEFAULT '{}'::jsonb;