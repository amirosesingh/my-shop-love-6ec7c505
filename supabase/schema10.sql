-- ===========================================================================
-- Northwind POS — schema 10
-- Central store/warehouse directory + Windows terminal activation tokens.
-- Run this once against the POS database.
-- ===========================================================================

-- ---------------------------------------------------------------- stores ---
CREATE TABLE IF NOT EXISTS public.stores (
  -- text, not uuid: existing terminals already use short branch codes as ids
  id text PRIMARY KEY,
  code text NOT NULL,
  name text NOT NULL,
  address text,
  phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stores TO authenticated;
GRANT ALL ON public.stores TO service_role;
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can read stores" ON public.stores;
CREATE POLICY "Staff can read stores" ON public.stores
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS "Staff can insert stores" ON public.stores;
CREATE POLICY "Staff can insert stores" ON public.stores
  FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS "Staff can update stores" ON public.stores;
CREATE POLICY "Staff can update stores" ON public.stores
  FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS "Staff can delete stores" ON public.stores;
CREATE POLICY "Staff can delete stores" ON public.stores
  FOR DELETE TO authenticated USING (public.is_staff(auth.uid()));

DROP TRIGGER IF EXISTS update_stores_updated_at ON public.stores;
CREATE TRIGGER update_stores_updated_at BEFORE UPDATE ON public.stores
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ------------------------------------------------------- terminal tokens ---
CREATE TABLE IF NOT EXISTS public.terminal_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id text REFERENCES public.stores(id) ON DELETE SET NULL,
  location_name text,
  device_name text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz,
  revoked_at timestamptz,
  last_seen_at timestamptz
);

CREATE INDEX IF NOT EXISTS terminal_tokens_location_idx
  ON public.terminal_tokens (location_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.terminal_tokens TO authenticated;
GRANT ALL ON public.terminal_tokens TO service_role;
-- A terminal that has not signed in yet must still be able to check its own
-- token status (activation + kill-switch heartbeat), so anon gets read only.
GRANT SELECT, UPDATE (last_seen_at, activated_at) ON public.terminal_tokens TO anon;
ALTER TABLE public.terminal_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can check a token status" ON public.terminal_tokens;
CREATE POLICY "Anyone can check a token status" ON public.terminal_tokens
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Terminals can stamp their heartbeat" ON public.terminal_tokens;
CREATE POLICY "Terminals can stamp their heartbeat" ON public.terminal_tokens
  FOR UPDATE TO anon USING (status = 'active') WITH CHECK (status = 'active');
DROP POLICY IF EXISTS "Staff can issue tokens" ON public.terminal_tokens;
CREATE POLICY "Staff can issue tokens" ON public.terminal_tokens
  FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS "Staff can manage tokens" ON public.terminal_tokens;
CREATE POLICY "Staff can manage tokens" ON public.terminal_tokens
  FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS "Staff can delete tokens" ON public.terminal_tokens;
CREATE POLICY "Staff can delete tokens" ON public.terminal_tokens
  FOR DELETE TO authenticated USING (public.is_staff(auth.uid()));
