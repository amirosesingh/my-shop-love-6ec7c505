-- The ambiguous two-argument overload: a caller naming only
-- (p_token_id, p_activate) matched both this and the four-argument version,
-- so the heartbeat right after activation failed. The four-argument routine
-- below covers every existing caller because its extra arguments default.
DROP FUNCTION IF EXISTS public.terminal_token_heartbeat(uuid, boolean);

CREATE OR REPLACE FUNCTION public.terminal_token_heartbeat(
  p_token_id uuid,
  p_activate boolean DEFAULT false,
  p_version text DEFAULT NULL,
  p_synced boolean DEFAULT false
) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  UPDATE public.terminal_tokens
  SET last_seen_at = now(),
      app_version = coalesce(nullif(btrim(p_version), ''), app_version),
      last_sync_at = CASE WHEN p_synced THEN now() ELSE last_sync_at END,
      activated_at = CASE WHEN p_activate THEN coalesce(activated_at, now()) ELSE activated_at END
  WHERE id = p_token_id AND status IN ('active', 'used')
$$;

GRANT EXECUTE ON FUNCTION public.terminal_token_heartbeat(uuid, boolean, text, boolean)
  TO anon, authenticated, service_role;

-- Re-assert the deployed activation contract so the canonical file and the
-- database agree. Behaviour is unchanged.
CREATE OR REPLACE FUNCTION public.terminal_token_status(p_token_id uuid)
 RETURNS TABLE(status text, location_name text, location_id text, is_claimed boolean, expires_at timestamp with time zone)
 LANGUAGE sql STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT t.status,
         coalesce(t.location_name, ''),
         coalesce(t.location_id, ''),
         (t.claimed_at IS NOT NULL OR t.status = 'used'),
         t.expires_at
  FROM public.terminal_tokens t
  WHERE t.id = p_token_id
$$;

GRANT EXECUTE ON FUNCTION public.terminal_token_status(uuid) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.terminal_token_claim(
  p_token_id uuid,
  p_device text DEFAULT NULL,
  p_proof_hash text DEFAULT NULL,
  p_platform text DEFAULT NULL,
  p_os text DEFAULT NULL
) RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $$
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
$$;

GRANT EXECUTE ON FUNCTION public.terminal_token_claim(uuid, text, text, text, text)
  TO anon, authenticated, service_role;
