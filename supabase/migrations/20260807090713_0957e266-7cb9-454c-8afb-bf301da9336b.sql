CREATE TABLE IF NOT EXISTS public.public_flags (
  key text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.public_flags TO anon;
GRANT SELECT, INSERT, UPDATE ON public.public_flags TO authenticated;
GRANT ALL ON public.public_flags TO service_role;

ALTER TABLE public.public_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read public flags" ON public.public_flags;
CREATE POLICY "Anyone can read public flags" ON public.public_flags
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Staff can add public flags" ON public.public_flags;
CREATE POLICY "Staff can add public flags" ON public.public_flags
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_staff_now()));

DROP POLICY IF EXISTS "Staff can change public flags" ON public.public_flags;
CREATE POLICY "Staff can change public flags" ON public.public_flags
  FOR UPDATE TO authenticated USING ((SELECT public.is_staff_now()))
  WITH CHECK ((SELECT public.is_staff_now()));

DROP TRIGGER IF EXISTS public_flags_touch ON public.public_flags;
CREATE TRIGGER public_flags_touch BEFORE UPDATE ON public.public_flags
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.public_flags (key, enabled) VALUES
  ('member_domain_enabled', true),
  ('redeem_domain_enabled', true)
ON CONFLICT (key) DO NOTHING;