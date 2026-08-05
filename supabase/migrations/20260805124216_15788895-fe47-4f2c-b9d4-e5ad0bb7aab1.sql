GRANT EXECUTE ON FUNCTION public.terminal_token_claim(uuid, text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.terminal_token_claim(uuid, text) FROM anon;