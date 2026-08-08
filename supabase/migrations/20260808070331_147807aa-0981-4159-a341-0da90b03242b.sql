GRANT SELECT, INSERT, UPDATE, DELETE ON public.stores TO authenticated;
GRANT ALL ON public.stores TO service_role;
GRANT SELECT ON public.app_users TO authenticated;
GRANT ALL ON public.app_users TO service_role;
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

GRANT EXECUTE ON FUNCTION public.current_app_user() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_staff_now() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_app_supervisor() TO authenticated, service_role;

INSERT INTO public.user_roles (user_id, role)
SELECT a.auth_user_id, a.role
  FROM public.app_users a
 WHERE a.is_active
   AND a.auth_user_id IS NOT NULL
ON CONFLICT (user_id, role) DO NOTHING;