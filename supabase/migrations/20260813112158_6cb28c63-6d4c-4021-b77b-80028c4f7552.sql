CREATE TABLE IF NOT EXISTS public.settings_overrides (
  scope text NOT NULL DEFAULT 'BRANCH',
  scope_id text NOT NULL DEFAULT '',
  section text NOT NULL,
  patch jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope, scope_id, section)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.settings_overrides TO authenticated;
GRANT SELECT ON public.settings_overrides TO anon;
GRANT ALL ON public.settings_overrides TO service_role;

ALTER TABLE public.settings_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "settings_overrides_read" ON public.settings_overrides
  FOR SELECT USING (true);
CREATE POLICY "settings_overrides_write" ON public.settings_overrides
  FOR ALL TO authenticated
  USING (public.is_supervisor_now())
  WITH CHECK (public.is_supervisor_now());

CREATE TRIGGER settings_overrides_touch
  BEFORE UPDATE ON public.settings_overrides
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.settings_locks (
  section text PRIMARY KEY,
  locked boolean NOT NULL DEFAULT false,
  updated_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.settings_locks TO authenticated;
GRANT SELECT ON public.settings_locks TO anon;
GRANT ALL ON public.settings_locks TO service_role;

ALTER TABLE public.settings_locks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "settings_locks_read" ON public.settings_locks
  FOR SELECT USING (true);
CREATE POLICY "settings_locks_write" ON public.settings_locks
  FOR ALL TO authenticated
  USING (public.is_supervisor_now())
  WITH CHECK (public.is_supervisor_now());

CREATE TRIGGER settings_locks_touch
  BEFORE UPDATE ON public.settings_locks
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS tag_id text,
  ADD COLUMN IF NOT EXISTS intake_note text,
  ADD COLUMN IF NOT EXISTS string_origin text,
  ADD COLUMN IF NOT EXISTS string_source_product_id uuid,
  ADD COLUMN IF NOT EXISTS grip_product_id uuid,
  ADD COLUMN IF NOT EXISTS charges jsonb NOT NULL DEFAULT '{}'::jsonb;