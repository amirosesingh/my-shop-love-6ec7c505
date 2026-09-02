REVOKE ALL ON FUNCTION public.stock_transfer_verify(uuid, text, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.stock_transfer_verify(uuid, text, jsonb, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.stock_transfer_verify(uuid, text, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.stock_transfer_verify(uuid, text, jsonb, text) TO service_role;