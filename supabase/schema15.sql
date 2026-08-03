-- ---------------------------------------------------------------------------
-- schema15.sql — complete terminal activation repair
--
-- Run this once on the separate POS database used by Settings -> Terminal
-- activation. It consolidates the activation additions from schemas 11-13 so
-- older installations do not need to determine which individual script was
-- missed. Safe to re-run; no terminal token rows are changed or deleted.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.terminal_tokens') IS NULL THEN
    RAISE EXCEPTION
      'public.terminal_tokens is missing. Run supabase/schema10.sql first, then rerun schema15.sql.';
  END IF;
END $$;

ALTER TABLE public.terminal_tokens
  ADD COLUMN IF NOT EXISTS claimed_by_device text,
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reissued_at timestamptz,
  ADD COLUMN IF NOT EXISTS replaced_by uuid;

ALTER TABLE public.terminal_tokens
  DROP CONSTRAINT IF EXISTS terminal_tokens_status_check;

ALTER TABLE public.terminal_tokens
  ADD CONSTRAINT terminal_tokens_status_check
  CHECK (status IN ('active', 'used', 'revoked'));

-- An unregistered till can inspect only the exact token id in its code.
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

-- Active and already-claimed terminals can continue reporting health.
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
      activated_at = CASE
        WHEN p_activate THEN coalesce(activated_at, now())
        ELSE activated_at
      END
  WHERE id = p_token_id AND status IN ('active', 'used')
$$;

-- Atomically spend a one-time code. Concurrent or repeated claims return false.
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

GRANT EXECUTE ON FUNCTION public.terminal_token_status(uuid)
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.terminal_token_heartbeat(uuid, boolean)
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.terminal_token_claim(uuid, text)
  TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';