-- ============================================================
-- schema33.sql — remove the duplicate terminal_token_claim overload.
--
-- After schema31.sql added the five-argument claim routine, databases that
-- still carried the older two-argument version ended up with both. Postgres
-- then refuses the call with:
--   "Could not choose the best candidate function between:
--    public.terminal_token_claim(p_token_id => uuid, p_device => text), ..."
--
-- This script leaves exactly one routine in place. It is idempotent and drops
-- no table, column, policy or row.
-- ============================================================

-- Columns the claim writes (no-op when schema31.sql already ran).
ALTER TABLE public.terminal_tokens
  ADD COLUMN IF NOT EXISTS claimed_proof_hash text,
  ADD COLUMN IF NOT EXISTS claimed_platform text,
  ADD COLUMN IF NOT EXISTS claimed_os text;

-- 1 · drop the stale two-argument overload -------------------------------
DROP FUNCTION IF EXISTS public.terminal_token_claim(uuid, text);

-- 2 · re-create the single surviving definition --------------------------
CREATE OR REPLACE FUNCTION public.terminal_token_claim(
  p_token_id uuid,
  p_device text DEFAULT NULL,
  p_proof_hash text DEFAULT NULL,
  p_platform text DEFAULT NULL,
  p_os text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
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
  SET status = 'used',
      claimed_by_device = left(coalesce(p_device, claimed_by_device), 120),
      claimed_proof_hash = left(coalesce(p_proof_hash, claimed_proof_hash), 200),
      claimed_platform = left(coalesce(p_platform, claimed_platform), 40),
      claimed_os = left(coalesce(p_os, claimed_os), 40),
      claimed_at = now(),
      activated_at = coalesce(activated_at, now()),
      last_seen_at = now()
  WHERE id = p_token_id AND status = 'active'
  RETURNING true INTO claimed;

  RETURN coalesce(claimed, false);
END;
$function$;

-- 3 · activation happens before sign-in, so the visitor role needs it -----
REVOKE ALL ON FUNCTION public.terminal_token_claim(uuid, text, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.terminal_token_claim(uuid, text, text, text, text)
  TO anon, authenticated, service_role;

-- 4 · verification: this must return exactly one row ----------------------
SELECT p.oid::regprocedure::text AS remaining_claim_routine
  FROM pg_proc p
 WHERE p.pronamespace = 'public'::regnamespace
   AND p.proname = 'terminal_token_claim';