DO $pin_rpc_grants$
BEGIN
  IF to_regprocedure('public.verify_terminal_pin(text,text)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.verify_terminal_pin(text, text) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.verify_terminal_pin(text, text) TO authenticated, service_role;
  END IF;
  IF to_regprocedure('public.verify_cashier_pin(text,text)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.verify_cashier_pin(text, text) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.verify_cashier_pin(text, text) TO service_role;
  END IF;
END
$pin_rpc_grants$;