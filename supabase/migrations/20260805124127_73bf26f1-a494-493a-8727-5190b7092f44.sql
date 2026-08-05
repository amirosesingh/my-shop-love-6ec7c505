REVOKE EXECUTE ON FUNCTION public.terminal_token_status(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.terminal_token_status(uuid) TO authenticated, service_role;