-- ============================================================
-- 27_staff_credentials_and_ids.sql — staff id defaults + flexible credentials
-- ============================================================
-- Safe to run repeatedly, on fresh and on existing databases.
--
-- 1. Guarantees that public.app_users (and public.staff_roles) can generate
--    their own primary keys, which fixes:
--       23502 null value in column "id" of relation "app_users"
--    on databases created by an older script where the default was lost.
-- 2. Allows staff credentials of 4 to 32 characters (digits for till PINs,
--    or any characters for longer passwords) instead of exactly 4-6 digits.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ---------- 1. primary key defaults ----------
DO $$
BEGIN
  IF to_regclass('public.app_users') IS NOT NULL THEN
    ALTER TABLE public.app_users ALTER COLUMN id SET DEFAULT gen_random_uuid();
    UPDATE public.app_users SET id = gen_random_uuid() WHERE id IS NULL;
    ALTER TABLE public.app_users ALTER COLUMN id SET NOT NULL;
    -- Older rows may predate the length column.
    BEGIN
      ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS pin_length smallint NOT NULL DEFAULT 6;
    EXCEPTION WHEN others THEN NULL;
    END;
  END IF;
END $$;

-- ---------- 2. flexible credential length ----------
CREATE OR REPLACE FUNCTION public.staff_account_set_pin(
  p_user_id text, p_pin text, p_pin_length smallint DEFAULT 4)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  IF coalesce(p_pin, '') = '' OR length(p_pin) < 4 OR length(p_pin) > 32 THEN
    RAISE EXCEPTION 'STAFF_PIN_INVALID';
  END IF;
  UPDATE public.app_users
  SET pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf', 10)),
      pin_length = least(length(p_pin), 32)::smallint,
      updated_at = now()
  WHERE lower(user_id) = lower(trim(p_user_id));
END
$function$;

CREATE OR REPLACE FUNCTION public.staff_account_upsert(
  p_user_id text, p_full_name text, p_email text, p_role app_role,
  p_role_slug text, p_store_id text, p_is_active boolean, p_pin text,
  p_pin_length smallint, p_auth_user_id uuid, p_permissions jsonb DEFAULT NULL::jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
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
  IF coalesce(p_pin, '') <> '' AND (length(p_pin) < 4 OR length(p_pin) > 32) THEN
    RAISE EXCEPTION 'STAFF_PIN_INVALID';
  END IF;

  INSERT INTO public.app_users
    (id, user_id, full_name, email, role, role_slug, store_id, is_active,
     pin_hash, pin_length, auth_user_id, permissions)
  VALUES
    (gen_random_uuid(), _user_id, _name, _email, p_role, _slug,
     nullif(trim(coalesce(p_store_id, '')), ''), coalesce(p_is_active, true), _hash,
     CASE WHEN coalesce(p_pin, '') = '' THEN 0
          ELSE least(coalesce(nullif(p_pin_length, 0), length(p_pin)), 32) END,
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

REVOKE ALL ON FUNCTION public.staff_account_upsert(text,text,text,app_role,text,text,boolean,text,smallint,uuid,jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.staff_account_set_pin(text,text,smallint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_account_upsert(text,text,text,app_role,text,text,boolean,text,smallint,uuid,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.staff_account_set_pin(text,text,smallint) TO service_role;

SELECT 'staff credentials + id defaults ready' AS verification;