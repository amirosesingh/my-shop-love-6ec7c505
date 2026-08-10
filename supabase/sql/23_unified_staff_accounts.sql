-- ============================================================
-- 23_unified_staff_accounts.sql — one real account per person.
--
-- Every operator (admin, supervisor, warehouse, cashier and any custom
-- role) ends up with a genuine auth account. Cashiers keep signing in with
-- a username + PIN; behind the scenes the PIN is the password of a hidden
-- internal address, so the till holds a normal verified session.
--
-- Safe to run repeatedly. Nothing is dropped except routines recreated
-- immediately below. Run AFTER 22_roles_and_pin_gates.sql.
-- ============================================================

-- ------------------------------------------------------------
-- 1 · Faster active-staff lookups (login grid, roster)
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_app_users_is_active ON public.app_users (is_active);

-- How many digits this person's PIN has, so the keypad knows when to submit.
ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS pin_length smallint NOT NULL DEFAULT 6;

-- ------------------------------------------------------------
-- 2 · A role in use can no longer be deleted
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.staff_role_delete(_slug text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE _s text := lower(trim(_slug));
        _held integer := 0;
BEGIN
  IF NOT public.is_app_supervisor() THEN
    RAISE EXCEPTION 'Only supervisors can manage roles';
  END IF;
  IF EXISTS (SELECT 1 FROM public.staff_roles WHERE slug = _s AND is_core) THEN
    RAISE EXCEPTION 'Built-in roles cannot be removed';
  END IF;

  SELECT count(*) INTO _held FROM public.app_users WHERE role_slug = _s;
  IF _held > 0 THEN
    RAISE EXCEPTION 'ROLE_IN_USE';
  END IF;
  BEGIN
    SELECT count(*) INTO _held FROM public.cashiers WHERE role_slug = _s;
  EXCEPTION WHEN undefined_table OR undefined_column THEN _held := 0;
  END;
  IF _held > 0 THEN
    RAISE EXCEPTION 'ROLE_IN_USE';
  END IF;

  DELETE FROM public.staff_roles WHERE slug = _s AND NOT is_core;
END $function$;

REVOKE ALL ON FUNCTION public.staff_role_delete(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_role_delete(text) TO authenticated, service_role;

-- ------------------------------------------------------------
-- 3 · Provisioning, done by the server with its own key
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.staff_account_upsert(
  p_user_id      text,
  p_full_name    text,
  p_email        text,
  p_role         app_role,
  p_role_slug    text,
  p_store_id     text,
  p_is_active    boolean,
  p_pin          text,
  p_pin_length   smallint,
  p_auth_user_id uuid,
  p_permissions  jsonb DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  -- The PIN is hashed here so a raw PIN never travels to another service.
  _hash text := CASE WHEN coalesce(p_pin, '') = '' THEN ''
                     ELSE extensions.crypt(p_pin, extensions.gen_salt('bf', 10)) END;
BEGIN
  INSERT INTO public.app_users
    (user_id, full_name, email, role, role_slug, store_id, is_active,
     pin_hash, pin_length, auth_user_id, permissions)
  VALUES
    (lower(trim(p_user_id)), trim(p_full_name), lower(trim(p_email)), p_role,
     nullif(trim(coalesce(p_role_slug, '')), ''),
     nullif(trim(coalesce(p_store_id, '')), ''),
     coalesce(p_is_active, true), _hash,
     coalesce(p_pin_length, 6), p_auth_user_id,
     coalesce(p_permissions, '{}'::jsonb))
  ON CONFLICT (user_id) DO UPDATE
    SET full_name    = excluded.full_name,
        email        = excluded.email,
        role         = excluded.role,
        role_slug    = coalesce(excluded.role_slug, public.app_users.role_slug),
        store_id     = excluded.store_id,
        is_active    = excluded.is_active,
        pin_hash     = CASE WHEN coalesce(excluded.pin_hash, '') = ''
                            THEN public.app_users.pin_hash ELSE excluded.pin_hash END,
        pin_length   = excluded.pin_length,
        auth_user_id = coalesce(excluded.auth_user_id, public.app_users.auth_user_id),
        permissions  = CASE WHEN p_permissions IS NULL THEN public.app_users.permissions
                            ELSE excluded.permissions END,
        updated_at   = now();
END $function$;

REVOKE ALL ON FUNCTION public.staff_account_upsert(
  text, text, text, app_role, text, text, boolean, text, smallint, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_account_upsert(
  text, text, text, app_role, text, text, boolean, text, smallint, uuid, jsonb)
  TO service_role;

-- Activate / deactivate. Blocking someone here stops the next sign-in.
CREATE OR REPLACE FUNCTION public.staff_account_set_active(p_user_id text, p_active boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_app_supervisor() THEN
    RAISE EXCEPTION 'Only supervisors can activate or deactivate staff';
  END IF;
  UPDATE public.app_users
     SET is_active = coalesce(p_active, true), updated_at = now()
   WHERE lower(user_id) = lower(trim(p_user_id));
  BEGIN
    UPDATE public.cashiers
       SET is_active = coalesce(p_active, true)
     WHERE lower(username) = lower(trim(p_user_id));
  EXCEPTION WHEN undefined_table THEN NULL;
  END;
END $function$;

REVOKE ALL ON FUNCTION public.staff_account_set_active(text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_account_set_active(text, boolean)
  TO authenticated, service_role;

-- ------------------------------------------------------------
-- 4 · Who the till may offer on its sign-in grid
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.terminal_staff_list(p_store_id text DEFAULT NULL)
RETURNS TABLE(user_id text, full_name text, role_slug text, store_id text,
              kind text, pin_length smallint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT a.user_id::text,
         a.full_name::text,
         coalesce(a.role_slug, 'cashier')::text,
         a.store_id::text,
         'account'::text,
         coalesce(a.pin_length, 6)::smallint
    FROM public.app_users a
   WHERE a.is_active
     AND coalesce(a.pin_hash, '') <> ''
     AND (coalesce(trim(p_store_id), '') = ''
          OR coalesce(a.store_id, '') = trim(p_store_id)
          OR coalesce(a.store_id, '') = '')
   ORDER BY 2
$function$;

REVOKE ALL ON FUNCTION public.terminal_staff_list(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.terminal_staff_list(text) TO service_role;

-- ------------------------------------------------------------
-- 5 · One-time silent migration of the old cashier rows
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.legacy_cashiers_for_migration()
RETURNS TABLE(username text, full_name text, pin_hash text, role_slug text,
              store_id text, is_active boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  RETURN QUERY
    SELECT c.username::text, c.full_name::text, c.pin_hash::text,
           coalesce(c.role_slug, 'cashier')::text, c.store_id::text, c.is_active
      FROM public.cashiers c
     WHERE NOT EXISTS (
             SELECT 1 FROM public.app_users a
              WHERE lower(a.user_id) = lower(c.username)
                AND coalesce(a.pin_hash, '') <> '');
EXCEPTION WHEN undefined_table THEN RETURN;
END $function$;

REVOKE ALL ON FUNCTION public.legacy_cashiers_for_migration()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.legacy_cashiers_for_migration() TO service_role;

-- Copy one legacy cashier row into public.app_users, keeping the PIN hash it
-- already has, so the same PIN keeps working while the real account is being
-- created behind the scenes.
CREATE OR REPLACE FUNCTION public.staff_account_adopt_legacy(p_username text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE c public.cashiers%rowtype;
BEGIN
  SELECT * INTO c FROM public.cashiers WHERE lower(username) = lower(trim(p_username));
  IF NOT FOUND THEN RETURN; END IF;

  INSERT INTO public.app_users
    (user_id, full_name, email, role, role_slug, store_id, is_active,
     pin_hash, pin_length, permissions)
  VALUES
    (lower(c.username), coalesce(nullif(c.full_name, ''), c.username),
     lower(c.username) || '@pos-internal.local', 'staff'::app_role,
     coalesce(c.role_slug, 'cashier'), nullif(trim(coalesce(c.store_id, '')), ''),
     c.is_active, c.pin_hash, 6, coalesce(c.permissions, '{}'::jsonb))
  ON CONFLICT (user_id) DO UPDATE
    SET pin_hash   = CASE WHEN coalesce(public.app_users.pin_hash, '') = ''
                          THEN excluded.pin_hash ELSE public.app_users.pin_hash END,
        role_slug  = coalesce(public.app_users.role_slug, excluded.role_slug),
        updated_at = now();
EXCEPTION WHEN undefined_table THEN RETURN;
END $function$;

REVOKE ALL ON FUNCTION public.staff_account_adopt_legacy(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_account_adopt_legacy(text) TO service_role;

-- Set (or reset) the PIN on an existing staff account.
CREATE OR REPLACE FUNCTION public.staff_account_set_pin(
  p_user_id text, p_pin text, p_pin_length smallint DEFAULT 4)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  IF p_pin !~ '^[0-9]{4,6}$' THEN
    RAISE EXCEPTION 'A PIN must be 4 to 6 digits';
  END IF;
  UPDATE public.app_users
     SET pin_hash   = extensions.crypt(p_pin, extensions.gen_salt('bf', 10)),
         pin_length = coalesce(p_pin_length, length(p_pin))::smallint,
         updated_at = now()
   WHERE lower(user_id) = lower(trim(p_user_id));
END $function$;

REVOKE ALL ON FUNCTION public.staff_account_set_pin(text, text, smallint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_account_set_pin(text, text, smallint) TO service_role;
