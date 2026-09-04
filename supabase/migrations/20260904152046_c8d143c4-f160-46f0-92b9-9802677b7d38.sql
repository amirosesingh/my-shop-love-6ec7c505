CREATE TABLE public.nav_pins (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id uuid NULL,
  item_kind text NOT NULL CHECK (item_kind IN ('nav', 'settings')),
  item_key text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX nav_pins_owner_item_uk
  ON public.nav_pins (COALESCE(owner_id, '00000000-0000-0000-0000-000000000000'::uuid), item_kind, item_key);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.nav_pins TO authenticated;
GRANT ALL ON public.nav_pins TO service_role;

ALTER TABLE public.nav_pins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nav_pins_read_own_and_company" ON public.nav_pins
  FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR owner_id IS NULL);

CREATE POLICY "nav_pins_insert_own" ON public.nav_pins
  FOR INSERT TO authenticated
  WITH CHECK (
    (owner_id = auth.uid())
    OR (owner_id IS NULL AND public.has_role(auth.uid(), 'admin'))
  );

CREATE POLICY "nav_pins_update_own" ON public.nav_pins
  FOR UPDATE TO authenticated
  USING (
    (owner_id = auth.uid())
    OR (owner_id IS NULL AND public.has_role(auth.uid(), 'admin'))
  )
  WITH CHECK (
    (owner_id = auth.uid())
    OR (owner_id IS NULL AND public.has_role(auth.uid(), 'admin'))
  );

CREATE POLICY "nav_pins_delete_own" ON public.nav_pins
  FOR DELETE TO authenticated
  USING (
    (owner_id = auth.uid())
    OR (owner_id IS NULL AND public.has_role(auth.uid(), 'admin'))
  );

CREATE TRIGGER nav_pins_set_updated_at
  BEFORE UPDATE ON public.nav_pins
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();