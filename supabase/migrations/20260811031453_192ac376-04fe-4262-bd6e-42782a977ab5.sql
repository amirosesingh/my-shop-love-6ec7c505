ALTER TABLE public.app_users
  ADD COLUMN IF NOT EXISTS role_slug text,
  ADD COLUMN IF NOT EXISTS pin_length smallint NOT NULL DEFAULT 6;

ALTER TABLE public.cashiers
  ADD COLUMN IF NOT EXISTS role_slug text;

CREATE TABLE IF NOT EXISTS public.staff_roles (
  slug text PRIMARY KEY,
  name text NOT NULL,
  base_level text NOT NULL DEFAULT 'cashier',
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_core boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_roles_base_level_valid CHECK (base_level IN ('cashier','warehouse','supervisor','admin'))
);
GRANT SELECT ON public.staff_roles TO authenticated;
GRANT ALL ON public.staff_roles TO service_role;
ALTER TABLE public.staff_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff read roles" ON public.staff_roles;
CREATE POLICY "Staff read roles" ON public.staff_roles
  FOR SELECT TO authenticated USING (public.is_staff((SELECT auth.uid())));

DROP TRIGGER IF EXISTS staff_roles_touch_updated_at ON public.staff_roles;
CREATE TRIGGER staff_roles_touch_updated_at
  BEFORE UPDATE ON public.staff_roles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.staff_roles (slug, name, base_level, is_core) VALUES
  ('cashier', 'Cashier', 'cashier', true),
  ('warehouse', 'Warehouse Supervisor', 'warehouse', true),
  ('supervisor', 'Supervisor', 'supervisor', true),
  ('admin', 'Administrator', 'admin', true)
ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name, base_level = EXCLUDED.base_level, is_core = true;

UPDATE public.app_users
SET role_slug = CASE role
  WHEN 'admin'::public.app_role THEN 'admin'
  WHEN 'manager'::public.app_role THEN 'supervisor'
  ELSE 'warehouse'
END
WHERE coalesce(trim(role_slug), '') = '';

UPDATE public.cashiers
SET role_slug = 'cashier'
WHERE coalesce(trim(role_slug), '') = '';

CREATE INDEX IF NOT EXISTS idx_app_users_is_active ON public.app_users (is_active);
CREATE INDEX IF NOT EXISTS idx_app_users_role_slug ON public.app_users (role_slug);

CREATE OR REPLACE FUNCTION public.staff_role_save(
  _slug text, _name text, _base_level text, _permissions jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.is_app_supervisor() THEN
    RAISE EXCEPTION 'Only supervisors can manage roles';
  END IF;
  IF coalesce(trim(_slug), '') = '' OR coalesce(trim(_name), '') = '' THEN
    RAISE EXCEPTION 'A role needs a name';
  END IF;
  IF coalesce(_base_level, '') NOT IN ('cashier','warehouse','supervisor','admin') THEN
    RAISE EXCEPTION 'INVALID_BASE_ROLE';
  END IF;
  INSERT INTO public.staff_roles (slug, name, base_level, permissions)
  VALUES (lower(trim(_slug)), trim(_name), _base_level, coalesce(_permissions, '{}'::jsonb))
  ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    base_level = CASE WHEN public.staff_roles.is_core THEN public.staff_roles.base_level ELSE EXCLUDED.base_level END,
    permissions = EXCLUDED.permissions,
    updated_at = now();
END
$function$;
REVOKE ALL ON FUNCTION public.staff_role_save(text,text,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_role_save(text,text,text,jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.staff_role_delete(_slug text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE _s text := lower(trim(_slug));
BEGIN
  IF NOT public.is_app_supervisor() THEN
    RAISE EXCEPTION 'Only supervisors can manage roles';
  END IF;
  IF EXISTS (SELECT 1 FROM public.staff_roles WHERE slug = _s AND is_core) THEN
    RAISE EXCEPTION 'Built-in roles cannot be removed';
  END IF;
  IF EXISTS (SELECT 1 FROM public.app_users WHERE role_slug = _s) THEN
    RAISE EXCEPTION 'ROLE_IN_USE';
  END IF;
  IF EXISTS (SELECT 1 FROM public.cashiers WHERE role_slug = _s) THEN
    RAISE EXCEPTION 'ROLE_IN_USE';
  END IF;
  DELETE FROM public.staff_roles WHERE slug = _s AND NOT is_core;
END
$function$;
REVOKE ALL ON FUNCTION public.staff_role_delete(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_role_delete(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.staff_account_upsert(
  p_user_id text,
  p_full_name text,
  p_email text,
  p_role public.app_role,
  p_role_slug text,
  p_store_id text,
  p_is_active boolean,
  p_pin text,
  p_pin_length smallint,
  p_auth_user_id uuid,
  p_permissions jsonb DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  _user_id text := lower(trim(coalesce(p_user_id, '')));
  _name text := trim(coalesce(p_full_name, ''));
  _email text := lower(trim(coalesce(p_email, '')));
  _slug text := lower(trim(coalesce(p_role_slug, '')));
  _hash text := CASE WHEN coalesce(p_pin, '') = '' THEN ''
                     ELSE extensions.crypt(p_pin, extensions.gen_salt('bf', 10)) END;
BEGIN
  IF _user_id = '' THEN RAISE EXCEPTION 'STAFF_USERNAME_REQUIRED'; END IF;
  IF _name = '' THEN RAISE EXCEPTION 'STAFF_NAME_REQUIRED'; END IF;
  IF _email = '' THEN RAISE EXCEPTION 'STAFF_EMAIL_REQUIRED'; END IF;
  IF p_role IS NULL THEN RAISE EXCEPTION 'STAFF_BASE_ROLE_REQUIRED'; END IF;
  IF _slug = '' OR NOT EXISTS (SELECT 1 FROM public.staff_roles WHERE slug = _slug) THEN
    RAISE EXCEPTION 'STAFF_ROLE_REQUIRED';
  END IF;
  IF p_auth_user_id IS NULL THEN RAISE EXCEPTION 'STAFF_AUTH_ACCOUNT_REQUIRED'; END IF;
  IF coalesce(p_pin, '') <> '' AND p_pin !~ '^[0-9]{4,6}$' THEN
    RAISE EXCEPTION 'STAFF_PIN_INVALID';
  END IF;

  INSERT INTO public.app_users
    (user_id, full_name, email, role, role_slug, store_id, is_active,
     pin_hash, pin_length, auth_user_id, permissions)
  VALUES
    (_user_id, _name, _email, p_role, _slug,
     nullif(trim(coalesce(p_store_id, '')), ''), coalesce(p_is_active, true), _hash,
     CASE WHEN coalesce(p_pin, '') = '' THEN 0 ELSE coalesce(p_pin_length, length(p_pin)) END,
     p_auth_user_id, coalesce(p_permissions, '{}'::jsonb))
  ON CONFLICT (user_id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    email = EXCLUDED.email,
    role = EXCLUDED.role,
    role_slug = EXCLUDED.role_slug,
    store_id = EXCLUDED.store_id,
    is_active = EXCLUDED.is_active,
    pin_hash = CASE WHEN EXCLUDED.pin_hash = '' THEN public.app_users.pin_hash ELSE EXCLUDED.pin_hash END,
    pin_length = CASE WHEN EXCLUDED.pin_hash = '' THEN public.app_users.pin_length ELSE EXCLUDED.pin_length END,
    auth_user_id = EXCLUDED.auth_user_id,
    permissions = CASE WHEN p_permissions IS NULL THEN public.app_users.permissions ELSE EXCLUDED.permissions END,
    updated_at = now();
END
$function$;
REVOKE ALL ON FUNCTION public.staff_account_upsert(text,text,text,public.app_role,text,text,boolean,text,smallint,uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_account_upsert(text,text,text,public.app_role,text,text,boolean,text,smallint,uuid,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.staff_account_set_active(p_user_id text, p_active boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_app_supervisor() THEN
    RAISE EXCEPTION 'Only supervisors can activate or deactivate staff';
  END IF;
  UPDATE public.app_users
  SET is_active = coalesce(p_active, false), updated_at = now()
  WHERE lower(user_id) = lower(trim(p_user_id));
  UPDATE public.cashiers
  SET is_active = coalesce(p_active, false)
  WHERE lower(username) = lower(trim(p_user_id));
END
$function$;
REVOKE ALL ON FUNCTION public.staff_account_set_active(text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_account_set_active(text,boolean) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.staff_account_set_pin(p_user_id text, p_pin text, p_pin_length smallint DEFAULT 4)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  IF p_pin !~ '^[0-9]{4,6}$' THEN RAISE EXCEPTION 'STAFF_PIN_INVALID'; END IF;
  UPDATE public.app_users
  SET pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf', 10)),
      pin_length = length(p_pin)::smallint,
      updated_at = now()
  WHERE lower(user_id) = lower(trim(p_user_id));
END
$function$;
REVOKE ALL ON FUNCTION public.staff_account_set_pin(text,text,smallint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_account_set_pin(text,text,smallint) TO service_role;

DROP FUNCTION IF EXISTS public.list_app_users();
CREATE OR REPLACE FUNCTION public.list_app_users()
RETURNS TABLE(id uuid, auth_user_id uuid, user_id text, full_name text, email text,
              role public.app_role, role_slug text, store_id text, is_active boolean,
              permissions jsonb, has_pin boolean, pin_length smallint,
              last_login_at timestamptz, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT a.id, a.auth_user_id, a.user_id::text, a.full_name::text, a.email::text,
         a.role, a.role_slug, a.store_id::text, a.is_active, a.permissions,
         coalesce(a.pin_hash, '') <> '', a.pin_length, a.last_login_at, a.created_at
  FROM public.app_users a
  WHERE public.is_app_supervisor()
  ORDER BY a.full_name, a.user_id
$function$;
REVOKE ALL ON FUNCTION public.list_app_users() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_app_users() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.terminal_staff_list(p_store_id text DEFAULT NULL)
RETURNS TABLE(user_id text, full_name text, role_slug text, store_id text, kind text, pin_length smallint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT a.user_id::text, a.full_name::text, coalesce(a.role_slug, 'cashier'),
         a.store_id::text, 'account'::text, coalesce(a.pin_length, 6)::smallint
  FROM public.app_users a
  WHERE a.is_active AND coalesce(a.pin_hash, '') <> ''
    AND (coalesce(trim(p_store_id), '') = '' OR coalesce(a.store_id, '') IN ('', trim(p_store_id)))
  ORDER BY a.full_name
$function$;
REVOKE ALL ON FUNCTION public.terminal_staff_list(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.terminal_staff_list(text) TO service_role;

CREATE OR REPLACE FUNCTION public.legacy_cashiers_for_migration()
RETURNS TABLE(username text, full_name text, pin_hash text, role_slug text, store_id text, is_active boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT c.username, c.full_name, c.pin_hash, coalesce(c.role_slug, 'cashier'), c.store_id, c.is_active
  FROM public.cashiers c
  WHERE NOT EXISTS (
    SELECT 1 FROM public.app_users a
    WHERE lower(a.user_id) = lower(c.username) AND coalesce(a.pin_hash, '') <> ''
  )
$function$;
REVOKE ALL ON FUNCTION public.legacy_cashiers_for_migration() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.legacy_cashiers_for_migration() TO service_role;

CREATE OR REPLACE FUNCTION public.staff_account_adopt_legacy(p_username text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE c public.cashiers%rowtype;
BEGIN
  SELECT * INTO c FROM public.cashiers WHERE lower(username) = lower(trim(p_username));
  IF NOT FOUND THEN RETURN; END IF;
  INSERT INTO public.app_users
    (user_id, full_name, email, role, role_slug, store_id, is_active, pin_hash, pin_length, permissions)
  VALUES
    (lower(c.username), coalesce(nullif(trim(c.full_name), ''), c.username),
     lower(c.username) || '@pos-internal.local', 'staff'::public.app_role,
     coalesce(c.role_slug, 'cashier'), c.store_id, c.is_active, c.pin_hash, 6,
     coalesce(c.permissions, '{}'::jsonb))
  ON CONFLICT (user_id) DO UPDATE SET
    pin_hash = CASE WHEN public.app_users.pin_hash = '' THEN EXCLUDED.pin_hash ELSE public.app_users.pin_hash END,
    role_slug = coalesce(public.app_users.role_slug, EXCLUDED.role_slug),
    updated_at = now();
END
$function$;
REVOKE ALL ON FUNCTION public.staff_account_adopt_legacy(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_account_adopt_legacy(text) TO service_role;

CREATE OR REPLACE FUNCTION public.staff_account_delete_profile(p_user_id text, p_auth_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _target public.app_users%rowtype;
  _admin_count integer;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_app_supervisor() THEN
    RAISE EXCEPTION 'Only supervisors can delete staff';
  END IF;
  SELECT * INTO _target FROM public.app_users
  WHERE lower(user_id) = lower(trim(p_user_id)) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'STAFF_NOT_FOUND'; END IF;
  IF _target.is_active THEN RAISE EXCEPTION 'DEACTIVATE_ACCOUNT_FIRST'; END IF;
  IF _target.auth_user_id IS DISTINCT FROM p_auth_user_id THEN RAISE EXCEPTION 'STAFF_IDENTITY_MISMATCH'; END IF;
  IF _target.auth_user_id = auth.uid() THEN RAISE EXCEPTION 'CANNOT_DELETE_CURRENT_ACCOUNT'; END IF;
  IF _target.role = 'admin'::public.app_role THEN
    SELECT count(*) INTO _admin_count FROM public.app_users
    WHERE role = 'admin'::public.app_role AND is_active AND id <> _target.id;
    IF _admin_count = 0 THEN RAISE EXCEPTION 'CANNOT_DELETE_LAST_ADMIN'; END IF;
  END IF;
  DELETE FROM public.user_roles WHERE user_id = _target.auth_user_id;
  DELETE FROM public.app_users WHERE id = _target.id;
  DELETE FROM public.cashiers WHERE lower(username) = lower(_target.user_id);
END
$function$;
REVOKE ALL ON FUNCTION public.staff_account_delete_profile(text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_account_delete_profile(text,uuid) TO service_role;