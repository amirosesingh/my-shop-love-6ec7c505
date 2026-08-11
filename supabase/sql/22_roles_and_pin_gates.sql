-- ============================================================
-- 22_roles_and_pin_gates.sql — Custom staff roles, manager PINs,
-- and per-action "require manager PIN" switches.
-- Safe to run repeatedly. Nothing is dropped except routines that are
-- recreated immediately below.
-- Run AFTER 02_staff_and_access.sql and 13_pos_rules.sql.
-- ============================================================

-- ------------------------------------------------------------
-- 1 · Custom roles
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.staff_roles (
  slug        text PRIMARY KEY,
  name        text NOT NULL,
  base_level  text NOT NULL DEFAULT 'cashier',
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_core     boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.staff_roles TO authenticated;
GRANT ALL ON public.staff_roles TO service_role;
ALTER TABLE public.staff_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff read roles" ON public.staff_roles;
CREATE POLICY "Staff read roles" ON public.staff_roles
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
-- writes go through the supervisor-only routines below.

DROP TRIGGER IF EXISTS staff_roles_touch_updated_at ON public.staff_roles;
CREATE TRIGGER staff_roles_touch_updated_at BEFORE UPDATE ON public.staff_roles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Built-in roles. Permissions stay empty here: the application owns the
-- preset for each base level, so a preset change never needs a migration.
INSERT INTO public.staff_roles (slug, name, base_level, is_core) VALUES
  ('cashier',    'Cashier',             'cashier',    true),
  ('warehouse',  'Warehouse Supervisor','warehouse',  true),
  ('supervisor', 'Supervisor',          'supervisor', true),
  ('admin',      'Admin',               'admin',      true)
ON CONFLICT (slug) DO UPDATE SET is_core = true;

CREATE OR REPLACE FUNCTION public.staff_role_save(
  _slug text, _name text, _base_level text, _permissions jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_app_supervisor() THEN
    RAISE EXCEPTION 'Only supervisors can manage roles';
  END IF;
  IF coalesce(trim(_slug), '') = '' OR coalesce(trim(_name), '') = '' THEN
    RAISE EXCEPTION 'A role needs a name';
  END IF;
  INSERT INTO public.staff_roles (slug, name, base_level, permissions)
  VALUES (lower(trim(_slug)), trim(_name), coalesce(nullif(trim(_base_level), ''), 'cashier'),
          coalesce(_permissions, '{}'::jsonb))
  ON CONFLICT (slug) DO UPDATE
    SET name = excluded.name,
        -- a built-in role keeps its base level; only its preset can be tuned
        base_level = CASE WHEN public.staff_roles.is_core THEN public.staff_roles.base_level
                          ELSE excluded.base_level END,
        permissions = excluded.permissions,
        updated_at = now();
END $function$;

CREATE OR REPLACE FUNCTION public.staff_role_delete(_slug text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_app_supervisor() THEN
    RAISE EXCEPTION 'Only supervisors can manage roles';
  END IF;
  IF EXISTS (SELECT 1 FROM public.staff_roles WHERE slug = lower(trim(_slug)) AND is_core) THEN
    RAISE EXCEPTION 'Built-in roles cannot be removed';
  END IF;
  DELETE FROM public.staff_roles WHERE slug = lower(trim(_slug)) AND NOT is_core;
END $function$;

REVOKE ALL ON FUNCTION public.staff_role_save(text, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_role_save(text, text, text, jsonb) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.staff_role_delete(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_role_delete(text) TO authenticated, service_role;

-- ------------------------------------------------------------
-- 2 · Which role a person is assigned, on both kinds of account
-- ------------------------------------------------------------
ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS role_slug text;

-- `cashiers` is a legacy table. Fresh unified-account databases do not have it.
DO $legacy_cashier_column$
BEGIN
  IF to_regclass('public.cashiers') IS NOT NULL THEN
    ALTER TABLE public.cashiers ADD COLUMN IF NOT EXISTS role_slug text;
  END IF;
END
$legacy_cashier_column$;

UPDATE public.app_users SET role_slug = CASE role WHEN 'admin' THEN 'admin'
                                                  WHEN 'manager' THEN 'supervisor'
                                                  ELSE 'cashier' END
 WHERE role_slug IS NULL;
DO $legacy_cashier_backfill$
BEGIN
  IF to_regclass('public.cashiers') IS NOT NULL THEN
    UPDATE public.cashiers SET role_slug = 'cashier' WHERE role_slug IS NULL;
  END IF;
END
$legacy_cashier_backfill$;

CREATE OR REPLACE FUNCTION public.set_app_user_role_slug(p_user_id text, p_role_slug text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_app_supervisor() THEN
    RAISE EXCEPTION 'Only supervisors can change roles';
  END IF;
  UPDATE public.app_users a SET role_slug = nullif(trim(coalesce(p_role_slug, '')), ''),
                                updated_at = now()
   WHERE lower(a.user_id) = lower(trim(p_user_id));
END $function$;

CREATE OR REPLACE FUNCTION public.set_cashier_role_slug(p_id uuid, p_role_slug text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_app_supervisor() THEN
    RAISE EXCEPTION 'Only supervisors can change roles';
  END IF;
  IF to_regclass('public.cashiers') IS NULL THEN RETURN; END IF;
  UPDATE public.cashiers SET role_slug = nullif(trim(coalesce(p_role_slug, '')), '')
   WHERE id = p_id;
EXCEPTION WHEN undefined_table OR undefined_column THEN RETURN;
END $function$;

REVOKE ALL ON FUNCTION public.set_app_user_role_slug(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_app_user_role_slug(text, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.set_cashier_role_slug(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_cashier_role_slug(uuid, text) TO authenticated, service_role;

-- ------------------------------------------------------------
-- 3 · Manager PIN on a staff record (4-6 digits, hashed)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_app_user_pin(p_user_id text, p_pin text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NOT public.is_app_supervisor() THEN
    RAISE EXCEPTION 'Only supervisors can set a PIN';
  END IF;
  IF p_pin !~ '^[0-9]{4,6}$' THEN
    RAISE EXCEPTION 'PIN must be 4 to 6 digits';
  END IF;
  UPDATE public.app_users a
     SET pin_hash = extensions.crypt(p_pin::text, extensions.gen_salt('bf'::text, 10)),
         updated_at = now()
   WHERE lower(a.user_id) = lower(trim(p_user_id));
END $function$;

REVOKE ALL ON FUNCTION public.set_app_user_pin(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_app_user_pin(text, text) TO authenticated, service_role;

-- ------------------------------------------------------------
-- 4 · Listing routines now report the assigned role
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.list_app_users();
CREATE OR REPLACE FUNCTION public.list_app_users()
 RETURNS TABLE(id uuid, auth_user_id uuid, user_id text, full_name text, email text,
               role app_role, role_slug text, store_id text, is_active boolean,
               permissions jsonb, has_pin boolean,
               last_login_at timestamptz, created_at timestamptz)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $function$
  SELECT a.id, a.auth_user_id, a.user_id::text, a.full_name::text, a.email::text,
         a.role, a.role_slug::text, a.store_id::text, a.is_active, a.permissions,
         coalesce(a.pin_hash, '') <> '', a.last_login_at, a.created_at
  FROM public.app_users a
  WHERE public.is_app_supervisor()
  ORDER BY a.user_id
$function$;

REVOKE ALL ON FUNCTION public.list_app_users() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_app_users() TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.list_cashiers();
CREATE OR REPLACE FUNCTION public.list_cashiers()
 RETURNS TABLE(id uuid, username text, full_name text, role_slug text, permissions jsonb,
               is_active boolean, last_login_at timestamptz, created_at timestamptz)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  IF to_regclass('public.cashiers') IS NULL THEN RETURN; END IF;
  RETURN QUERY
    SELECT c.id, c.username, c.full_name, c.role_slug::text, c.permissions,
           c.is_active, c.last_login_at, c.created_at
      FROM public.cashiers c
     WHERE public.is_app_supervisor()
     ORDER BY c.username;
EXCEPTION WHEN undefined_table OR undefined_column THEN RETURN;
END
$function$;

REVOKE ALL ON FUNCTION public.list_cashiers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_cashiers() TO authenticated, service_role;

-- ------------------------------------------------------------
-- 5 · Per-action "require manager PIN" switches
-- ------------------------------------------------------------
DO $optional_pos_rules$
BEGIN
  IF to_regclass('public.pos_store_settings') IS NOT NULL THEN
    ALTER TABLE public.pos_store_settings
      ADD COLUMN IF NOT EXISTS require_pin_void_cart       boolean NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS require_pin_void_line       boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS require_pin_reduce_qty      boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS require_pin_manual_discount boolean NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS require_pin_price_override  boolean NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS require_pin_stock_adjustment boolean NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS require_pin_shift_close     boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS require_pin_edit_tenders    boolean NOT NULL DEFAULT false;
  END IF;
END
$optional_pos_rules$;

-- Generic saver: any column of pos_store_settings present in the patch is
-- written, so future switches need no further changes here.
DROP FUNCTION IF EXISTS public.pos_rules_save(text, jsonb);
CREATE OR REPLACE FUNCTION public.pos_rules_save(_store_id text, _patch jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_store text := coalesce(_store_id, '');
  v_sets  text;
BEGIN
  IF NOT public.is_app_supervisor() THEN
    RAISE EXCEPTION 'Only supervisors can change POS rules';
  END IF;

  INSERT INTO public.pos_store_settings (store_id) VALUES (v_store)
  ON CONFLICT (store_id) DO NOTHING;

  SELECT string_agg(format('%I = ($1->>%L)::%s', c.column_name, c.column_name, c.data_type), ', ')
    INTO v_sets
    FROM information_schema.columns c
   WHERE c.table_schema = 'public'
     AND c.table_name = 'pos_store_settings'
     AND c.column_name NOT IN ('store_id', 'created_at', 'updated_at')
     AND coalesce(_patch, '{}'::jsonb) ? c.column_name;

  IF v_sets IS NOT NULL THEN
    EXECUTE format(
      'UPDATE public.pos_store_settings SET %s, updated_at = now() WHERE store_id = $2', v_sets)
    USING _patch, v_store;
  END IF;

  RETURN public.pos_rules_get(v_store);
END $function$;

REVOKE ALL ON FUNCTION public.pos_rules_save(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_rules_save(text, jsonb) TO authenticated, service_role;