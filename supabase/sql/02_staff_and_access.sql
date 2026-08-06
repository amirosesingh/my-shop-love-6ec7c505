-- ============================================================
-- 02_staff_and_access.sql — Staff accounts, cashiers, roles and PIN sign-in
-- Lucky Charms POS. Safe to run repeatedly: nothing is dropped.
-- Requires: 00_extensions_and_enums.sql, then 02_staff_and_access.sql
-- (row level security policies below call is_staff() / is_app_supervisor()).
-- ============================================================

-- ---------- tables, columns and indexes ----------
ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();

ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS user_id character varying(64);

ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS full_name character varying(160);

ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS email character varying(255);

ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS role app_role DEFAULT 'staff'::app_role;

ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS store_id character varying(64);

ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS permissions jsonb DEFAULT jsonb_build_object('can_open_drawer', true, 'can_close_drawer', true, 'can_view_drawer_balance', false, 'can_process_sale', true, 'can_give_discount', false, 'can_void_item', false, 'can_hold_cart', true, 'can_process_refund', false, 'can_process_exchange', false, 'can_view_inventory', true, 'can_edit_product_price', false, 'can_add_new_product', false, 'can_receive_purchase_order', false, 'can_add_member', true, 'can_edit_member_points', false, 'can_apply_member_discount', true, 'can_view_sales_reports', false, 'can_access_pos_settings', false, 'can_manage_staff', false);

ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS pin_hash text DEFAULT ''::text;

ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS auth_user_id uuid;

ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS last_login_at timestamp with time zone;

ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();

ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();

DO $$ BEGIN ALTER TABLE public.app_users ADD CONSTRAINT app_users_user_id_key UNIQUE (user_id); EXCEPTION WHEN others THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS app_users_auth_user_id_key ON public.app_users USING btree (auth_user_id) WHERE (auth_user_id IS NOT NULL);

CREATE UNIQUE INDEX IF NOT EXISTS app_users_pkey ON public.app_users USING btree (id);

CREATE UNIQUE INDEX IF NOT EXISTS app_users_user_id_key ON public.app_users USING btree (user_id);

CREATE TABLE IF NOT EXISTS public.cashiers (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  username text NOT NULL,
  full_name text DEFAULT ''::text NOT NULL,
  pin_hash text NOT NULL,
  store_id text,
  permissions jsonb DEFAULT '{}'::jsonb NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  last_login_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

ALTER TABLE public.cashiers ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();

ALTER TABLE public.cashiers ADD COLUMN IF NOT EXISTS username text;

ALTER TABLE public.cashiers ADD COLUMN IF NOT EXISTS full_name text DEFAULT ''::text;

ALTER TABLE public.cashiers ADD COLUMN IF NOT EXISTS pin_hash text;

ALTER TABLE public.cashiers ADD COLUMN IF NOT EXISTS store_id text;

ALTER TABLE public.cashiers ADD COLUMN IF NOT EXISTS permissions jsonb DEFAULT '{}'::jsonb;

ALTER TABLE public.cashiers ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

ALTER TABLE public.cashiers ADD COLUMN IF NOT EXISTS last_login_at timestamp with time zone;

ALTER TABLE public.cashiers ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();

ALTER TABLE public.cashiers ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS cashiers_pkey ON public.cashiers USING btree (id);

CREATE UNIQUE INDEX IF NOT EXISTS cashiers_username_key ON public.cashiers USING btree (lower(username));

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  role app_role NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();

ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS user_id uuid;

ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS role app_role;

ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();

DO $$ BEGIN ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role); EXCEPTION WHEN others THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS user_roles_user_id_role_key ON public.user_roles USING btree (user_id, role);

CREATE UNIQUE INDEX IF NOT EXISTS user_roles_pkey ON public.user_roles USING btree (id);

-- ---------- functions ----------
-- Table-returning routines: a replace cannot change the output columns, so
-- drop any older copy first. Dropping a function never touches data.
DROP FUNCTION IF EXISTS public.current_app_user();

-- ── Safe re-run guard ─────────────────────────────────────────────────────
-- Postgres refuses CREATE OR REPLACE when a function's return type changed.
-- Drop any stale overload of the routines defined below first. Each drop is
-- attempted on its own, so a routine still referenced by a policy or trigger
-- is simply left in place instead of aborting the whole file.
DO $guard$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace
       AND p.proname = ANY (ARRAY[
      'current_app_user',
      'delete_cashier',
      'delete_terminal_user',
      'has_role',
      'is_app_supervisor',
      'is_staff',
      'list_app_users',
      'list_cashiers',
      'set_app_user_permissions',
      'set_app_user_profile',
      'set_cashier_permissions',
      'set_terminal_active',
      'sync_auth_user_to_public',
      'upsert_cashier',
      'upsert_terminal_user',
      'verify_cashier_pin',
      'verify_terminal_pin'
       ])
  LOOP
    BEGIN
      EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
END $guard$;

CREATE OR REPLACE FUNCTION public.current_app_user()
 RETURNS TABLE(id uuid, user_id text, full_name text, role app_role, store_id text, email text, permissions jsonb, is_active boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT a.id, a.user_id::text, a.full_name::text, a.role, a.store_id::text,
         a.email::text, a.permissions, a.is_active
  FROM public.app_users a
  WHERE a.auth_user_id = auth.uid()
     OR lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  LIMIT 1
$function$;

CREATE OR REPLACE FUNCTION public.delete_cashier(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NOT public.is_app_supervisor() THEN
    RAISE EXCEPTION 'Only supervisors and admins can manage cashiers';
  END IF;
  DELETE FROM public.cashiers WHERE id = p_id;
END $function$;

CREATE OR REPLACE FUNCTION public.delete_terminal_user(p_user_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Only admins can delete terminal users';
  END IF;
  DELETE FROM public.app_users a WHERE lower(a.user_id) = lower(trim(p_user_id));
END $function$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.user_roles where user_id = _user_id and role = _role
  )
$function$;

CREATE OR REPLACE FUNCTION public.is_app_supervisor()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE ok boolean := false;
BEGIN
  SELECT exists (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role IN ('admin','manager')
  ) INTO ok;
  IF ok THEN RETURN true; END IF;
  BEGIN
    SELECT exists (
      SELECT 1 FROM public.app_users a
      WHERE a.auth_user_id = auth.uid()
        AND a.role::text IN ('admin','manager')
    ) INTO ok;
  EXCEPTION WHEN undefined_table OR undefined_column THEN ok := false;
  END;
  RETURN coalesce(ok, false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role in ('admin', 'manager', 'staff')
  )
$function$;

DROP FUNCTION IF EXISTS public.list_app_users();

CREATE OR REPLACE FUNCTION public.list_app_users()
 RETURNS TABLE(id uuid, auth_user_id uuid, user_id text, full_name text, email text, role app_role, store_id text, is_active boolean, permissions jsonb, last_login_at timestamp with time zone, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT a.id, a.auth_user_id, a.user_id::text, a.full_name::text, a.email::text,
         a.role, a.store_id::text, a.is_active, a.permissions, a.last_login_at, a.created_at
  FROM public.app_users a
  WHERE public.is_app_supervisor()
  ORDER BY a.user_id
$function$;

DROP FUNCTION IF EXISTS public.list_cashiers();

CREATE OR REPLACE FUNCTION public.list_cashiers()
 RETURNS TABLE(id uuid, username text, full_name text, store_id text, permissions jsonb, is_active boolean, last_login_at timestamp with time zone, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT c.id, c.username, c.full_name, c.store_id, c.permissions,
         c.is_active, c.last_login_at, c.created_at
  FROM public.cashiers c
  WHERE public.is_app_supervisor()
  ORDER BY c.username
$function$;

CREATE OR REPLACE FUNCTION public.set_app_user_permissions(p_user_id text, p_permissions jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NOT public.is_app_supervisor() THEN
    RAISE EXCEPTION 'Only supervisors can change permissions';
  END IF;
  UPDATE public.app_users a
     SET permissions = coalesce(a.permissions, '{}'::jsonb) || p_permissions,
         updated_at = now()
   WHERE lower(a.user_id) = lower(trim(p_user_id));
END $function$;

CREATE OR REPLACE FUNCTION public.set_app_user_profile(p_user_id text, p_full_name text, p_role app_role, p_store_id text, p_is_active boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NOT public.is_app_supervisor() THEN
    RAISE EXCEPTION 'Only supervisors can edit staff profiles';
  END IF;
  UPDATE public.app_users a
     SET full_name  = coalesce(nullif(trim(p_full_name), ''), a.full_name),
         role       = coalesce(p_role, a.role),
         store_id   = nullif(trim(coalesce(p_store_id, '')), ''),
         is_active  = coalesce(p_is_active, a.is_active),
         updated_at = now()
   WHERE lower(a.user_id) = lower(trim(p_user_id));
END $function$;

CREATE OR REPLACE FUNCTION public.set_cashier_permissions(p_id uuid, p_permissions jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NOT public.is_app_supervisor() THEN
    RAISE EXCEPTION 'Only supervisors and admins can manage cashiers';
  END IF;
  UPDATE public.cashiers
     SET permissions = coalesce(permissions, '{}'::jsonb) || coalesce(p_permissions, '{}'::jsonb)
   WHERE id = p_id;
END $function$;

CREATE OR REPLACE FUNCTION public.set_terminal_active(p_user_id text, p_active boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NOT public.is_app_supervisor() THEN
    RAISE EXCEPTION 'Only supervisors can manage terminal users';
  END IF;
  UPDATE public.app_users a SET is_active = p_active, updated_at = now()
   WHERE lower(a.user_id) = lower(trim(p_user_id));
END $function$;

CREATE OR REPLACE FUNCTION public.sync_auth_user_to_public()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_code text := coalesce(nullif(trim(new.raw_user_meta_data ->> 'user_id'), ''),
                          split_part(new.email, '@', 1));
  v_name text := coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), v_code);
  v_store text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'store_id', '')), '');
  v_existing public.app_users%rowtype;
BEGIN
  SELECT * INTO v_existing FROM public.app_users WHERE user_id = v_code;

  IF FOUND THEN
    -- Never let a new signup hijack a row already linked to another auth account,
    -- and never link a row whose email does not match the signup email.
    IF (v_existing.auth_user_id IS NOT NULL AND v_existing.auth_user_id <> new.id)
       OR lower(coalesce(v_existing.email, '')) <> lower(new.email) THEN
      RETURN new;
    END IF;

    UPDATE public.app_users
       SET full_name    = v_name,
           store_id     = coalesce(v_store, store_id),
           auth_user_id = new.id,
           updated_at   = now()
     WHERE id = v_existing.id;
    RETURN new;
  END IF;

  -- Self-service signups are created PENDING: no role grant and inactive until
  -- an admin activates them from Staff Management. Never auto-grant staff access.
  INSERT INTO public.app_users (user_id, full_name, role, store_id, email, auth_user_id, is_active)
  VALUES (v_code, v_name, 'staff'::app_role, v_store, lower(new.email), new.id, false)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN new;
END $function$;

CREATE OR REPLACE FUNCTION public.upsert_cashier(p_id uuid, p_username text, p_full_name text, p_pin text, p_store_id text, p_is_active boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE v_id uuid;
BEGIN
  IF NOT public.is_app_supervisor() THEN
    RAISE EXCEPTION 'Only supervisors and admins can manage cashiers';
  END IF;
  IF coalesce(trim(p_username), '') = '' THEN
    RAISE EXCEPTION 'Username is required';
  END IF;
  IF p_pin IS NOT NULL AND p_pin <> '' AND p_pin !~ '^\d{4,6}$' THEN
    RAISE EXCEPTION 'PIN must be 4 to 6 digits';
  END IF;

  IF p_id IS NULL THEN
    IF p_pin IS NULL OR p_pin = '' THEN
      RAISE EXCEPTION 'A PIN is required for a new cashier';
    END IF;
    INSERT INTO public.cashiers (username, full_name, pin_hash, store_id, is_active)
    VALUES (lower(trim(p_username)), coalesce(p_full_name, ''),
            extensions.crypt(p_pin::text, extensions.gen_salt('bf'::text, 10)),
            p_store_id, coalesce(p_is_active, true))
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.cashiers SET
      username = lower(trim(p_username)),
      full_name = coalesce(p_full_name, full_name),
      store_id = p_store_id,
      is_active = coalesce(p_is_active, is_active),
      pin_hash = CASE WHEN p_pin IS NULL OR p_pin = '' THEN pin_hash
                      ELSE extensions.crypt(p_pin::text, extensions.gen_salt('bf'::text, 10)) END
    WHERE id = p_id
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END $function$;

CREATE OR REPLACE FUNCTION public.upsert_terminal_user(p_user_id text, p_full_name text, p_role app_role, p_store_id text, p_email text, p_pin text, p_password text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NOT public.is_app_supervisor() THEN
    RAISE EXCEPTION 'Only supervisors can manage terminal users';
  END IF;
  IF p_pin !~ '^[0-9]{4,6}$' THEN
    RAISE EXCEPTION 'PIN must be 4 to 6 digits';
  END IF;
  INSERT INTO public.app_users (user_id, full_name, role, store_id, email, pin_hash)
  VALUES (trim(p_user_id), trim(p_full_name), p_role,
          nullif(trim(coalesce(p_store_id,'')),''), lower(trim(p_email)),
          extensions.crypt(p_pin::text, extensions.gen_salt('bf'::text, 10)))
  ON CONFLICT (user_id) DO UPDATE
    SET full_name = excluded.full_name, role = excluded.role,
        store_id = excluded.store_id, email = excluded.email,
        pin_hash = excluded.pin_hash, updated_at = now();
END $function$;

-- Older databases may hold earlier versions with different output columns;
-- CREATE OR REPLACE cannot change a return type, so drop first.
DROP FUNCTION IF EXISTS public.verify_cashier_pin(text, text);

CREATE OR REPLACE FUNCTION public.verify_cashier_pin(p_username text, p_pin text)
 RETURNS TABLE(id uuid, username text, full_name text, store_id text, permissions jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE v_row public.cashiers;
BEGIN
  SELECT * INTO v_row FROM public.cashiers c
   WHERE lower(c.username) = lower(trim(p_username)) AND c.is_active
   LIMIT 1;
  IF v_row.id IS NULL THEN RETURN; END IF;
  IF v_row.pin_hash <> extensions.crypt(p_pin::text, v_row.pin_hash::text) THEN RETURN; END IF;
  UPDATE public.cashiers SET last_login_at = now() WHERE public.cashiers.id = v_row.id;
  id := v_row.id; username := v_row.username; full_name := v_row.full_name;
  store_id := v_row.store_id; permissions := coalesce(v_row.permissions, '{}'::jsonb);
  RETURN NEXT;
END $function$;

DROP FUNCTION IF EXISTS public.verify_terminal_pin(text, text);

CREATE OR REPLACE FUNCTION public.verify_terminal_pin(p_user_id text, p_pin text)
 RETURNS TABLE(user_id text, full_name text, role app_role, store_id text, email text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE u public.app_users%rowtype;
BEGIN
  SELECT * INTO u FROM public.app_users a
   WHERE lower(a.user_id) = lower(trim(p_user_id)) AND a.is_active;
  IF NOT FOUND THEN RETURN; END IF;
  IF u.pin_hash = '' OR u.pin_hash <> extensions.crypt(p_pin::text, u.pin_hash::text) THEN RETURN; END IF;
  UPDATE public.app_users SET last_login_at = now() WHERE id = u.id;
  RETURN QUERY SELECT u.user_id::text, u.full_name::text, u.role, u.store_id::text, u.email::text;
END $function$;

-- ---------- triggers ----------
CREATE TRIGGER app_users_touch_updated_at BEFORE UPDATE ON public.app_users FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS cashiers_touch_updated_at ON public.cashiers;

CREATE TRIGGER cashiers_touch_updated_at BEFORE UPDATE ON public.cashiers FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ---------- grants (Data API access) ----------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_users TO authenticated;
GRANT ALL ON public.app_users TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cashiers TO authenticated;
GRANT ALL ON public.cashiers TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

-- ---------- row level security ----------
ALTER TABLE public.cashiers ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- ---------- policies ----------
DROP POLICY IF EXISTS "Admins manage roles" ON public.user_roles;

CREATE POLICY "Admins manage roles" ON public.user_roles FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Users can read their own roles" ON public.user_roles;

CREATE POLICY "Users can read their own roles" ON public.user_roles FOR SELECT TO authenticated USING ((user_id = auth.uid()));

-- ---------- other ----------
-- ---------- tables ----------

CREATE TABLE IF NOT EXISTS public.app_users (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id character varying(64) NOT NULL,
  full_name character varying(160) NOT NULL,
  email character varying(255) NOT NULL,
  role app_role DEFAULT 'staff'::app_role NOT NULL,
  store_id character varying(64),
  is_active boolean DEFAULT true NOT NULL,
  permissions jsonb DEFAULT jsonb_build_object('can_open_drawer', true, 'can_close_drawer', true, 'can_view_drawer_balance', false, 'can_process_sale', true, 'can_give_discount', false, 'can_void_item', false, 'can_hold_cart', true, 'can_process_refund', false, 'can_process_exchange', false, 'can_view_inventory', true, 'can_edit_product_price', false, 'can_add_new_product', false, 'can_receive_purchase_order', false, 'can_add_member', true, 'can_edit_member_points', false, 'can_apply_member_discount', true, 'can_view_sales_reports', false, 'can_access_pos_settings', false, 'can_manage_staff', false) NOT NULL,
  pin_hash text DEFAULT ''::text NOT NULL,
  auth_user_id uuid,
  last_login_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

-- ---------- triggers ----------
DROP TRIGGER IF EXISTS app_users_touch_updated_at ON public.app_users;

-- ---------- grants ----------

-- ---------- row level security ----------
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;

-- ---------- verification ----------
SELECT t.name AS table_name,
       CASE WHEN to_regclass('public.' || t.name) IS NULL THEN 'MISSING' ELSE 'OK' END AS status
FROM (VALUES ('app_users'),('cashiers'),('user_roles')) AS t(name);
