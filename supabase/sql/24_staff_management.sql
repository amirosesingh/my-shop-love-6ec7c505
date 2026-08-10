-- ============================================================
-- 24_staff_management.sql — the single, current staff schema.
--
-- Every operator (admin, supervisor, warehouse, cashier and any custom role)
-- now lives in public.app_users with a real auth account. The old
-- public.cashiers table and its routines are retired here.
--
-- Order of business:
--   1. rescue  — copy any cashier row that was never migrated
--   2. retire  — drop the cashiers table and its routines, but only when
--                nothing is left to migrate
--   3. trim    — remove columns and indexes the application stopped reading
--   4. tidy    — prune unused custom roles, re-assert the built-in four
--   5. rules   — re-state grants and row level security in one place
--
-- Safe to run repeatedly. Take a backup first: step 2 deletes a table.
-- Run AFTER 23_unified_staff_accounts.sql.
-- ============================================================

-- ------------------------------------------------------------
-- 1 · Rescue: nobody loses their sign-in
-- ------------------------------------------------------------
DO $rescue$
DECLARE c record;
BEGIN
  IF to_regclass('public.cashiers') IS NULL THEN
    RAISE NOTICE 'No legacy cashier table — nothing to rescue.';
    RETURN;
  END IF;

  FOR c IN SELECT * FROM public.cashiers LOOP
    INSERT INTO public.app_users
      (user_id, full_name, email, role, role_slug, store_id, is_active,
       pin_hash, pin_length, permissions)
    VALUES
      (lower(c.username),
       coalesce(nullif(c.full_name, ''), c.username),
       lower(c.username) || '@pos-internal.local',
       'staff'::app_role,
       coalesce(c.role_slug, 'cashier'),
       NULL,
       c.is_active,
       c.pin_hash,
       6,
       coalesce(c.permissions, '{}'::jsonb))
    ON CONFLICT (user_id) DO UPDATE
      SET pin_hash   = CASE WHEN coalesce(public.app_users.pin_hash, '') = ''
                            THEN excluded.pin_hash ELSE public.app_users.pin_hash END,
          role_slug  = coalesce(public.app_users.role_slug, excluded.role_slug),
          full_name  = coalesce(nullif(public.app_users.full_name, ''), excluded.full_name),
          updated_at = now();
  END LOOP;
END $rescue$;

-- ------------------------------------------------------------
-- 2 · Retire the legacy cashier table and everything that reads it
-- ------------------------------------------------------------
DO $retire$
DECLARE
  _left integer := 0;
  r record;
BEGIN
  IF to_regclass('public.cashiers') IS NULL THEN RETURN; END IF;

  SELECT count(*) INTO _left
    FROM public.cashiers c
   WHERE NOT EXISTS (SELECT 1 FROM public.app_users a
                      WHERE lower(a.user_id) = lower(c.username)
                        AND coalesce(a.pin_hash, '') <> '');
  IF _left > 0 THEN
    RAISE EXCEPTION
      'STAFF_MIGRATION_INCOMPLETE: % cashier row(s) still have no account. Nothing was dropped.',
      _left;
  END IF;

  -- Routines that only exist to serve the old table.
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace
       AND p.proname = ANY (ARRAY['list_cashiers', 'upsert_cashier', 'delete_cashier',
                                  'verify_cashier_pin', 'set_cashier_permissions',
                                  'set_cashier_role_slug', 'legacy_cashiers_for_migration',
                                  'staff_account_adopt_legacy'])
  LOOP
    BEGIN
      EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Left % in place: %', r.sig, SQLERRM;
    END;
  END LOOP;

  DROP TABLE public.cashiers CASCADE;
  RAISE NOTICE 'Legacy cashier table retired.';
END $retire$;

-- The two retired helpers above are referenced by
-- 23_unified_staff_accounts.sql; recreate harmless no-op replacements so an
-- older server build calling them cannot fail with "function does not exist".
CREATE OR REPLACE FUNCTION public.legacy_cashiers_for_migration()
RETURNS TABLE(username text, full_name text, pin_hash text, role_slug text,
              store_id text, is_active boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$ SELECT NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::boolean
              WHERE false $function$;

REVOKE ALL ON FUNCTION public.legacy_cashiers_for_migration()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.legacy_cashiers_for_migration() TO service_role;

CREATE OR REPLACE FUNCTION public.staff_account_adopt_legacy(p_username text)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$ SELECT $function$;

REVOKE ALL ON FUNCTION public.staff_account_adopt_legacy(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_account_adopt_legacy(text) TO service_role;

-- Activation no longer has a second table to keep in step.
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
END $function$;

REVOKE ALL ON FUNCTION public.staff_account_set_active(text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_account_set_active(text, boolean)
  TO authenticated, service_role;

-- Deleting a role only has to look at one table now.
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
  DELETE FROM public.staff_roles WHERE slug = _s AND NOT is_core;
END $function$;

REVOKE ALL ON FUNCTION public.staff_role_delete(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_role_delete(text) TO authenticated, service_role;

-- ------------------------------------------------------------
-- 3 · Trim what the application no longer reads
-- ------------------------------------------------------------
-- `store_id` stays: branch scoping (user_store_id, store_visible, the terminal
-- staff grid and every branch policy) reads it. Cashiers simply leave it empty
-- and trade in the branch of the till they sign in on.

-- A duplicate unique index on user_id was left behind by an earlier schema:
-- the table constraint already enforces it.
DROP INDEX IF EXISTS public.app_users_user_id_key1;

-- Keep the lookups the login grid and roster actually use.
CREATE INDEX IF NOT EXISTS idx_app_users_is_active ON public.app_users (is_active);
CREATE INDEX IF NOT EXISTS idx_app_users_role_slug ON public.app_users (role_slug);

-- ------------------------------------------------------------
-- 4 · Tidy the role list
-- ------------------------------------------------------------
INSERT INTO public.staff_roles (slug, name, base_level, is_core) VALUES
  ('cashier',    'Cashier',              'cashier',    true),
  ('warehouse',  'Warehouse Supervisor', 'warehouse',  true),
  ('supervisor', 'Supervisor',           'supervisor', true),
  ('admin',      'Admin',                'admin',      true)
ON CONFLICT (slug) DO UPDATE SET is_core = true;

DELETE FROM public.staff_roles r
 WHERE NOT r.is_core
   AND NOT EXISTS (SELECT 1 FROM public.app_users a WHERE a.role_slug = r.slug);

-- Anyone left pointing at a role that no longer exists falls back to cashier.
UPDATE public.app_users a
   SET role_slug = 'cashier', updated_at = now()
 WHERE coalesce(a.role_slug, '') = ''
    OR NOT EXISTS (SELECT 1 FROM public.staff_roles r WHERE r.slug = a.role_slug);

-- ------------------------------------------------------------
-- 5 · Access rules, stated once
-- ------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_users  TO authenticated;
GRANT ALL    ON public.app_users  TO service_role;
GRANT SELECT ON public.staff_roles TO authenticated;
GRANT ALL    ON public.staff_roles TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL    ON public.user_roles TO service_role;

ALTER TABLE public.app_users   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their own staff record" ON public.app_users;
CREATE POLICY "Users can read their own staff record" ON public.app_users
  FOR SELECT TO authenticated USING (auth_user_id = auth.uid());

DROP POLICY IF EXISTS "Staff read roles" ON public.staff_roles;
CREATE POLICY "Staff read roles" ON public.staff_roles
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Users can read their own roles" ON public.user_roles;
CREATE POLICY "Users can read their own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins manage roles" ON public.user_roles;
CREATE POLICY "Admins manage roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Everything else on these tables goes through the supervisor-guarded
-- routines in 02, 22 and 23; visitors get nothing.

-- Verification: this should return no rows once the file has run.
SELECT c.relname AS still_present
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relname = 'cashiers';