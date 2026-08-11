DO $$
DECLARE r record;
BEGIN
  IF to_regclass('public.app_users') IS NULL THEN RETURN; END IF;

  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'public.app_users'::regclass
      AND c.contype = 'f'
      AND (SELECT array_agg(a.attname::text)
             FROM unnest(c.conkey) k
             JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k)
          = ARRAY['id']::text[]
  LOOP
    EXECUTE format('ALTER TABLE public.app_users DROP CONSTRAINT %I', r.conname);
  END LOOP;

  ALTER TABLE public.app_users ALTER COLUMN id SET DEFAULT gen_random_uuid();
  UPDATE public.app_users SET id = gen_random_uuid() WHERE id IS NULL;
  ALTER TABLE public.app_users ALTER COLUMN id SET NOT NULL;
END $$;

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
    (coalesce(p_auth_user_id, gen_random_uuid()), _user_id, _name, _email, p_role, _slug,
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
GRANT EXECUTE ON FUNCTION public.staff_account_upsert(text,text,text,app_role,text,text,boolean,text,smallint,uuid,jsonb) TO service_role;