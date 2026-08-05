-- Schema 24 — complete the phone-assisted terminal pairing response.

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