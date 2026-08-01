ALTER TABLE public.pos_settings
  ADD COLUMN IF NOT EXISTS company_name text NOT NULL DEFAULT 'NORTHWIND & CO.',
  ADD COLUMN IF NOT EXISTS tax_number text,
  ADD COLUMN IF NOT EXISTS reg_number text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS fonts jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS custom_lines jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS qr jsonb NOT NULL DEFAULT '{}'::jsonb;