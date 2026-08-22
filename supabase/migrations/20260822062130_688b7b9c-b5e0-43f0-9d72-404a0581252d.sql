CREATE OR REPLACE FUNCTION public.app_users_require_store() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  -- A blank branch means "works at every branch"; the terminal supplies the
  -- branch at sign-in. Normalise empty strings so the checks stay simple.
  IF NEW.store_id IS NOT NULL AND btrim(NEW.store_id) = '' THEN
    NEW.store_id := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.user_has_store_access(_store_id text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT CASE
    WHEN _store_id IS NULL THEN public.is_staff_now()
    WHEN public.is_app_supervisor() THEN true
    ELSE EXISTS (
      SELECT 1 FROM public.app_users u
      WHERE u.auth_user_id = (SELECT auth.uid())
        AND u.is_active
        AND (u.store_id = _store_id
             OR nullif(btrim(coalesce(u.store_id, '')), '') IS NULL)
    )
  END
$$;