-- ============================================================
-- schema31.sql — terminal claim metadata + session cascade re-assert.
--
-- Additive only: no table, column, policy or row is dropped, and nothing
-- is seeded. Safe to run repeatedly on a live database.
-- ============================================================

-- 1 · troubleshooting columns for activation -----------------------------
ALTER TABLE public.terminal_tokens
  ADD COLUMN IF NOT EXISTS claimed_proof_hash text,
  ADD COLUMN IF NOT EXISTS claimed_platform text,
  ADD COLUMN IF NOT EXISTS claimed_os text;

-- 2 · unified claim routine ---------------------------------------------
-- The extra arguments are optional, so tills still on the two-argument call
-- keep working unchanged.
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

GRANT EXECUTE ON FUNCTION public.terminal_token_claim(uuid, text, text, text, text)
  TO anon, authenticated, service_role;

-- 3 · instant revocation cascades ----------------------------------------
CREATE OR REPLACE FUNCTION public.sessions_revoke_for_terminal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.revoked_at IS NOT NULL AND OLD.revoked_at IS NULL THEN
    UPDATE public.user_sessions
       SET is_revoked = true, revoked_at = now(), revoked_reason = 'terminal reset'
     WHERE terminal_id = NEW.id::text AND is_revoked = false;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS terminal_tokens_revoke_sessions ON public.terminal_tokens;
CREATE TRIGGER terminal_tokens_revoke_sessions
  AFTER UPDATE ON public.terminal_tokens
  FOR EACH ROW EXECUTE FUNCTION public.sessions_revoke_for_terminal();

CREATE OR REPLACE FUNCTION public.sessions_revoke_for_branch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  UPDATE public.user_sessions
     SET is_revoked = true, revoked_at = now(), revoked_reason = 'branch removed'
   WHERE branch_id = OLD.id AND is_revoked = false;
  RETURN OLD;
END;
$function$;

DROP TRIGGER IF EXISTS stores_revoke_sessions ON public.stores;
CREATE TRIGGER stores_revoke_sessions
  AFTER DELETE ON public.stores
  FOR EACH ROW EXECUTE FUNCTION public.sessions_revoke_for_branch();