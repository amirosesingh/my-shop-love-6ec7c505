-- Schema 26 — strict one-time activation tokens (15 minute window).
--
-- Adds the single-use flag and the redemption deadline, rewrites the claim so
-- it succeeds exactly once, and returns both fields to the till so it can say
-- why a code was refused. Safe to re-run.

ALTER TABLE public.terminal_tokens
  ADD COLUMN IF NOT EXISTS is_claimed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

UPDATE public.terminal_tokens SET is_claimed = true
 WHERE status = 'used' AND is_claimed = false;

-- ------------------------------- claim ----------------------------------
DROP FUNCTION IF EXISTS public.terminal_token_claim(uuid, text);

CREATE FUNCTION public.terminal_token_claim(p_token_id uuid, p_device text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  claimed boolean;
  v_location text;
BEGIN
  SELECT coalesce(location_id, '') INTO v_location
    FROM public.terminal_tokens WHERE id = p_token_id;
  IF v_location IS NULL THEN RETURN false; END IF;
  IF btrim(v_location) = '' THEN
    RAISE EXCEPTION 'TERMINAL_BRANCH_REQUIRED';
  END IF;

  UPDATE public.terminal_tokens
     SET status            = 'used',
         is_claimed        = true,
         claimed_by_device = left(coalesce(p_device, claimed_by_device), 120),
         claimed_at        = now(),
         activated_at      = coalesce(activated_at, now()),
         last_seen_at      = now()
   WHERE id = p_token_id
     AND status = 'active'
     AND is_claimed = false
     AND (expires_at IS NULL OR expires_at > now())
  RETURNING true INTO claimed;

  RETURN coalesce(claimed, false);
END;
$$;

REVOKE ALL ON FUNCTION public.terminal_token_claim(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.terminal_token_claim(uuid, text)
  TO anon, authenticated, service_role;

-- ------------------------------- status ----------------------------------
DROP FUNCTION IF EXISTS public.terminal_token_status(uuid);

CREATE FUNCTION public.terminal_token_status(p_token_id uuid)
RETURNS TABLE (status text, location_name text, location_id text,
               is_claimed boolean, expires_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT t.status, coalesce(t.location_name, ''), coalesce(t.location_id, ''),
         coalesce(t.is_claimed, false), t.expires_at
  FROM public.terminal_tokens t
  WHERE t.id = p_token_id
$$;

REVOKE ALL ON FUNCTION public.terminal_token_status(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.terminal_token_status(uuid)
  TO anon, authenticated, service_role;

-- ----------------------------- realtime -----------------------------------
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.terminal_tokens;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.terminal_tokens REPLICA IDENTITY FULL;

NOTIFY pgrst, 'reload schema';
