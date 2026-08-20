REVOKE ALL ON FUNCTION public.settings_private_key() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_has_store_access(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.settings_private_key() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_has_store_access(text) TO authenticated, service_role;