REVOKE ALL ON FUNCTION public.product_visible_to_me(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.product_visible_to_me(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.product_visible_to_me(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.product_visible_to_me(text) TO service_role;