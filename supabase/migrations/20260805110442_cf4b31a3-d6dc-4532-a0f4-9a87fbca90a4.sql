-- ---------------------------------------------------------------- stores ---
CREATE TABLE IF NOT EXISTS public.stores (
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
  last_seen_at timestamptz,
  reissued_at timestamptz,
  replaced_by uuid,
  claimed_by_device text,
  claimed_at timestamptz
);

CREATE INDEX IF NOT EXISTS terminal_tokens_location_idx
  ON public.terminal_tokens (location_id);

ALTER TABLE public.terminal_tokens
  DROP CONSTRAINT IF EXISTS terminal_tokens_status_check;
ALTER TABLE public.terminal_tokens
  ADD CONSTRAINT terminal_tokens_status_check
  CHECK (status IN ('active', 'used', 'revoked'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.terminal_tokens TO authenticated;
GRANT ALL ON public.terminal_tokens TO service_role;
REVOKE ALL ON public.terminal_tokens FROM anon;
ALTER TABLE public.terminal_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can read tokens" ON public.terminal_tokens;
CREATE POLICY "Staff can read tokens" ON public.terminal_tokens
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
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

-- --------------------------------------------- narrow activation helpers ---
CREATE OR REPLACE FUNCTION public.terminal_token_status(p_token_id uuid)
RETURNS TABLE (status text, location_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.status, coalesce(t.location_name, '')
  FROM public.terminal_tokens t
  WHERE t.id = p_token_id
$$;

CREATE OR REPLACE FUNCTION public.terminal_token_heartbeat(
  p_token_id uuid,
  p_activate boolean DEFAULT false
)
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.terminal_tokens
  SET last_seen_at = now(),
      activated_at = CASE WHEN p_activate THEN coalesce(activated_at, now()) ELSE activated_at END
  WHERE id = p_token_id AND status IN ('active', 'used')
$$;

CREATE OR REPLACE FUNCTION public.terminal_token_claim(
  p_token_id uuid,
  p_device text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claimed boolean;
BEGIN
  UPDATE public.terminal_tokens
  SET status = 'used',
      claimed_by_device = coalesce(p_device, claimed_by_device),
      claimed_at = now(),
      activated_at = coalesce(activated_at, now()),
      last_seen_at = now()
  WHERE id = p_token_id AND status = 'active'
  RETURNING true INTO claimed;

  RETURN coalesce(claimed, false);
END;
$$;

REVOKE ALL ON FUNCTION public.terminal_token_status(uuid) FROM public;
REVOKE ALL ON FUNCTION public.terminal_token_heartbeat(uuid, boolean) FROM public;
REVOKE ALL ON FUNCTION public.terminal_token_claim(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.terminal_token_status(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.terminal_token_heartbeat(uuid, boolean) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.terminal_token_claim(uuid, text) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';