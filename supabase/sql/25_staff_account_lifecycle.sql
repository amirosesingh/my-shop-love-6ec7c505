-- ============================================================
-- 25_staff_account_lifecycle.sql — account update/delete safety.
-- Safe to run repeatedly. Run AFTER 24_staff_management.sql.
-- ============================================================

CREATE OR REPLACE FUNCTION public.staff_account_delete_profile(
  p_user_id text, p_auth_user_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _target public.app_users%rowtype;
  _other_active_admins integer;
BEGIN
  IF (SELECT auth.uid()) IS NOT NULL AND NOT public.is_app_supervisor() THEN
    RAISE EXCEPTION 'Only supervisors can delete staff';
  END IF;

  SELECT * INTO _target
    FROM public.app_users
   WHERE lower(user_id) = lower(trim(p_user_id))
   FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'STAFF_NOT_FOUND'; END IF;
  IF _target.is_active THEN RAISE EXCEPTION 'DEACTIVATE_ACCOUNT_FIRST'; END IF;
  IF _target.auth_user_id IS DISTINCT FROM p_auth_user_id THEN
    RAISE EXCEPTION 'STAFF_IDENTITY_MISMATCH';
  END IF;
  IF _target.auth_user_id = (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'CANNOT_DELETE_CURRENT_ACCOUNT';
  END IF;

  IF _target.role = 'admin'::public.app_role THEN
    SELECT count(*) INTO _other_active_admins
      FROM public.app_users
     WHERE role = 'admin'::public.app_role
       AND is_active
       AND id <> _target.id;
    IF _other_active_admins = 0 THEN RAISE EXCEPTION 'CANNOT_DELETE_LAST_ADMIN'; END IF;
  END IF;

  DELETE FROM public.user_roles WHERE user_id = _target.auth_user_id;
  DELETE FROM public.app_users WHERE id = _target.id;
  IF to_regclass('public.cashiers') IS NOT NULL THEN
    DELETE FROM public.cashiers WHERE lower(username) = lower(_target.user_id);
  END IF;
END
$function$;

REVOKE ALL ON FUNCTION public.staff_account_delete_profile(text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_account_delete_profile(text, uuid)
  TO service_role;

SELECT p.proname AS routine, p.prosecdef AS protected
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('staff_account_upsert', 'staff_account_set_active',
                     'staff_account_set_pin', 'staff_account_delete_profile',
                     'terminal_staff_list')
 ORDER BY p.proname;