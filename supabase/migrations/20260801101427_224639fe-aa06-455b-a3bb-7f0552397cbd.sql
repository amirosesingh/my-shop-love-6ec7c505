CREATE TABLE public.secure_settings (
  key text PRIMARY KEY,
  ciphertext text NOT NULL,
  hint text,
  updated_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.secure_settings TO service_role;

ALTER TABLE public.secure_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages secure settings"
  ON public.secure_settings FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_secure_settings_updated_at
  BEFORE UPDATE ON public.secure_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();