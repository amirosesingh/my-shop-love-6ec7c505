-- ---------------------------------------------------------------------------
-- schema13.sql — one-time activation codes + terminal deletion
--
-- Run once on the POS database, after schema10 / schema11 / schema12.
-- Safe to re-run.
-- ---------------------------------------------------------------------------

ALTER TABLE public.terminal_tokens
  ADD COLUMN IF NOT EXISTS claimed_by_device text,
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz;

COMMENT ON COLUMN public.terminal_tokens.claimed_by_device IS
  'Name of the terminal that redeemed this single-use code.';

-- A code may now be active (never used), used (claimed by one till) or revoked.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.terminal_tokens'::regclass
      AND conname = 'terminal_tokens_status_check'
  ) THEN
    ALTER TABLE public.terminal_tokens DROP CONSTRAINT terminal_tokens_status_check;
  END IF;
END $$;

ALTER TABLE public.terminal_tokens
  ADD CONSTRAINT terminal_tokens_status_check
  CHECK (status IN ('active', 'used', 'revoked'));

-- A till that already claimed its code must keep beating.
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

-- Atomically spend a code. Returns true only for the terminal that won it.
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

REVOKE ALL ON FUNCTION public.terminal_token_heartbeat(uuid, boolean) FROM public;
REVOKE ALL ON FUNCTION public.terminal_token_claim(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.terminal_token_heartbeat(uuid, boolean) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.terminal_token_claim(uuid, text) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';