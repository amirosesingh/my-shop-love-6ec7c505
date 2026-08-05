-- Schema 23 — phone-assisted terminal pairing.
--
-- The PC activation screen now shows a pairing QR containing the token id it
-- has reserved for itself. An administrator scans it from the Android app and
-- approves it, which creates the token row with that exact id. The PC polls
-- terminal_token_status until the row appears, so the status helper must also
-- return the location id the till needs for its local configuration.

DROP FUNCTION IF EXISTS public.terminal_token_status(uuid);

CREATE FUNCTION public.terminal_token_status(p_token_id uuid)
RETURNS TABLE (status text, location_name text, location_id text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.status, coalesce(t.location_name, ''), coalesce(t.location_id, '')
  FROM public.terminal_tokens t
  WHERE t.id = p_token_id
$$;

REVOKE ALL ON FUNCTION public.terminal_token_status(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.terminal_token_status(uuid)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
