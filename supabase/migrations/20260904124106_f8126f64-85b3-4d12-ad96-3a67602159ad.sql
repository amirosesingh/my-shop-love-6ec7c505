ALTER TABLE public.terminal_tokens ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE public.terminal_tokens ADD COLUMN IF NOT EXISTS claimed_os text;
ALTER TABLE public.terminal_tokens ADD COLUMN IF NOT EXISTS claim_proof text;

DROP FUNCTION IF EXISTS public.terminal_token_status(uuid);

CREATE OR REPLACE FUNCTION public.terminal_token_status(p_token_id uuid)
RETURNS TABLE(status text, location_name text, location_id text, is_claimed boolean, expires_at timestamptz)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT t.status,
         coalesce(t.location_name, ''),
         coalesce(t.location_id, ''),
         (t.claimed_at IS NOT NULL OR t.status = 'used'),
         t.expires_at
  FROM public.terminal_tokens t
  WHERE t.id = p_token_id
$function$;

DROP FUNCTION IF EXISTS public.terminal_token_claim(uuid, text);

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
  t public.terminal_tokens%ROWTYPE;
  claimed boolean;
BEGIN
  SELECT * INTO t FROM public.terminal_tokens WHERE id = p_token_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;

  IF t.status = 'revoked' OR t.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'TERMINAL_TOKEN_REVOKED';
  END IF;

  IF t.expires_at IS NOT NULL AND t.expires_at < now() THEN
    RAISE EXCEPTION 'TERMINAL_TOKEN_EXPIRED';
  END IF;

  IF btrim(coalesce(t.location_id, '')) = '' THEN
    RAISE EXCEPTION 'TERMINAL_BRANCH_REQUIRED';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.stores s
    WHERE s.id = t.location_id
      AND (s.deleted_at IS NOT NULL OR s.archived_at IS NOT NULL OR s.is_active IS FALSE)
  ) THEN
    RAISE EXCEPTION 'TERMINAL_BRANCH_INACTIVE';
  END IF;

  -- Already claimed: only the same device may re-present the token, and only
  -- when a fingerprint was recorded to compare against.
  IF t.status <> 'active' OR t.claimed_at IS NOT NULL THEN
    IF p_proof_hash IS NOT NULL
       AND t.claim_proof IS NOT NULL
       AND t.claim_proof = p_proof_hash THEN
      UPDATE public.terminal_tokens
      SET last_seen_at = now()
      WHERE id = p_token_id;
      RETURN true;
    END IF;
    RETURN false;
  END IF;

  UPDATE public.terminal_tokens
  SET status = 'used',
      claimed_by_device = left(coalesce(p_device, claimed_by_device), 120),
      claim_proof = coalesce(p_proof_hash, claim_proof),
      platform = coalesce(nullif(btrim(coalesce(p_platform, '')), ''), platform),
      claimed_os = coalesce(nullif(btrim(coalesce(p_os, '')), ''), claimed_os),
      claimed_at = now(),
      activated_at = coalesce(activated_at, now()),
      last_seen_at = now()
  WHERE id = p_token_id AND status = 'active' AND claimed_at IS NULL
  RETURNING true INTO claimed;

  RETURN coalesce(claimed, false);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.terminal_token_status(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.terminal_token_claim(uuid, text, text, text, text) TO anon, authenticated, service_role;