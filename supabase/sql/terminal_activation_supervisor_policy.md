# Terminal activation access upgrade

This upgrade was applied to the connected `pos` Supabase project on 2026-09-22.
Fresh databases receive the same policies and claim routine from `../schema.sql`.
For another existing database, run the SQL below once in its SQL editor.

```sql
-- Restrict terminal code management to supervisors and administrators.
BEGIN;

-- Status checks use the narrow terminal_token_status RPC. A broad SELECT
-- policy would let every authenticated staff account read every token row.
DROP POLICY IF EXISTS "Anyone can check a token status" ON public.terminal_tokens;

DROP POLICY IF EXISTS "Staff can delete tokens" ON public.terminal_tokens;
DROP POLICY IF EXISTS "Supervisors can delete tokens" ON public.terminal_tokens;
CREATE POLICY "Supervisors can delete tokens" ON public.terminal_tokens
  FOR DELETE TO authenticated
  USING ((SELECT public.is_app_supervisor()));

DROP POLICY IF EXISTS "Staff can issue tokens" ON public.terminal_tokens;
DROP POLICY IF EXISTS "Supervisors can issue tokens" ON public.terminal_tokens;
CREATE POLICY "Supervisors can issue tokens" ON public.terminal_tokens
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_app_supervisor()));

DROP POLICY IF EXISTS "Staff can manage tokens" ON public.terminal_tokens;
DROP POLICY IF EXISTS "Supervisors can manage tokens" ON public.terminal_tokens;
CREATE POLICY "Supervisors can manage tokens" ON public.terminal_tokens
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_app_supervisor()))
  WITH CHECK ((SELECT public.is_app_supervisor()));

DROP POLICY IF EXISTS "Staff can read tokens" ON public.terminal_tokens;
DROP POLICY IF EXISTS "Supervisors can read tokens" ON public.terminal_tokens;
CREATE POLICY "Supervisors can read tokens" ON public.terminal_tokens
  FOR SELECT TO authenticated
  USING ((SELECT public.is_app_supervisor()));

-- Preserve the category chosen by management. The old claim routine replaced
-- "mobile" with "android", which moved tablets into the Windows list.
CREATE OR REPLACE FUNCTION public.terminal_token_claim(
  p_token_id uuid, p_device text DEFAULT NULL::text,
  p_proof_hash text DEFAULT NULL::text, p_platform text DEFAULT NULL::text,
  p_os text DEFAULT NULL::text
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
      UPDATE public.terminal_tokens SET last_seen_at = now() WHERE id = p_token_id;
      RETURN true;
    END IF;
    RETURN false;
  END IF;

  IF (t.platform = 'mobile' AND p_platform IS DISTINCT FROM 'android')
     OR (t.platform = 'pc' AND p_platform IS DISTINCT FROM 'electron') THEN
    RAISE EXCEPTION 'TERMINAL_PLATFORM_MISMATCH';
  END IF;

  UPDATE public.terminal_tokens
  SET status = 'used',
      claimed_by_device = left(coalesce(p_device, claimed_by_device), 120),
      claim_proof = coalesce(p_proof_hash, claim_proof),
      claimed_os = coalesce(nullif(btrim(coalesce(p_os, '')), ''), claimed_os),
      claimed_at = now(),
      activated_at = coalesce(activated_at, now()),
      last_seen_at = now()
  WHERE id = p_token_id AND status = 'active' AND claimed_at IS NULL
  RETURNING true INTO claimed;

  RETURN coalesce(claimed, false);
END;
$$;

UPDATE public.terminal_tokens SET platform = 'mobile' WHERE platform = 'android';
UPDATE public.terminal_tokens SET platform = 'pc' WHERE platform = 'electron';

COMMIT;
```
