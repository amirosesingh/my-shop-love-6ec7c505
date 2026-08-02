-- ---------------------------------------------------------------------------
-- schema11.sql — terminal activation helpers
--
-- Run this once against the POS database if terminal activation fails with
-- "This database is missing the terminal activation setup".
--
-- These two SECURITY DEFINER functions are the only token access an
-- unregistered till has: it must already know the exact token id, so the
-- terminal_tokens table can never be enumerated by an anonymous visitor.
--
-- Safe to re-run: functions only, no table or data changes.
-- ---------------------------------------------------------------------------

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
  WHERE id = p_token_id AND status = 'active'
$$;

REVOKE ALL ON FUNCTION public.terminal_token_status(uuid) FROM public;
REVOKE ALL ON FUNCTION public.terminal_token_heartbeat(uuid, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.terminal_token_status(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.terminal_token_heartbeat(uuid, boolean) TO anon, authenticated, service_role;

-- Let PostgREST pick the new functions up immediately.
NOTIFY pgrst, 'reload schema';