-- --------------------------------------------------------- role helpers ---
CREATE OR REPLACE FUNCTION public.is_app_supervisor()
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END; $$;

-- ------------------------------------------------------------ app_users ---
CREATE TABLE IF NOT EXISTS public.app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar(64) NOT NULL UNIQUE,
  full_name varchar(160) NOT NULL,
  email varchar(255) NOT NULL,
  role app_role NOT NULL DEFAULT 'staff',
  store_id varchar(64),
  is_active boolean NOT NULL DEFAULT true,
  permissions jsonb NOT NULL DEFAULT jsonb_build_object(
    'can_open_drawer', true, 'can_close_drawer', true, 'can_view_drawer_balance', false,
    'can_process_sale', true, 'can_give_discount', false, 'can_void_item', false,
    'can_hold_cart', true, 'can_process_refund', false, 'can_process_exchange', false,
    'can_view_inventory', true, 'can_edit_product_price', false, 'can_add_new_product', false,
    'can_receive_purchase_order', false, 'can_add_member', true, 'can_edit_member_points', false,
    'can_apply_member_discount', true, 'can_view_sales_reports', false,
    'can_access_pos_settings', false, 'can_manage_staff', false
  ),
  pin_hash text NOT NULL DEFAULT '',
  auth_user_id uuid,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS app_users_user_id_key
  ON public.app_users (lower(user_id));
CREATE UNIQUE INDEX IF NOT EXISTS app_users_auth_user_id_key
  ON public.app_users (auth_user_id) WHERE auth_user_id IS NOT NULL;

REVOKE ALL ON public.app_users FROM anon;
REVOKE ALL ON public.app_users FROM authenticated;
GRANT ALL ON public.app_users TO service_role;
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS app_users_touch_updated_at ON public.app_users;
CREATE TRIGGER app_users_touch_updated_at BEFORE UPDATE ON public.app_users
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ------------------------------------------------------- app_user RPCs ---
DROP FUNCTION IF EXISTS public.verify_terminal_pin(text, text);
CREATE FUNCTION public.verify_terminal_pin(p_user_id text, p_pin text)
RETURNS TABLE (user_id text, full_name text, role app_role, store_id text, email text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE u public.app_users%rowtype;
BEGIN
  SELECT * INTO u FROM public.app_users a
   WHERE lower(a.user_id) = lower(trim(p_user_id)) AND a.is_active;
  IF NOT FOUND THEN RETURN; END IF;
  IF u.pin_hash = '' OR u.pin_hash <> extensions.crypt(p_pin::text, u.pin_hash::text) THEN RETURN; END IF;
  UPDATE public.app_users SET last_login_at = now() WHERE id = u.id;
  RETURN QUERY SELECT u.user_id::text, u.full_name::text, u.role, u.store_id::text, u.email::text;
END $$;

DROP FUNCTION IF EXISTS public.current_app_user();
CREATE FUNCTION public.current_app_user()
RETURNS TABLE (id uuid, user_id text, full_name text, role app_role, store_id text,
               email text, permissions jsonb, is_active boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
  SELECT a.id, a.user_id::text, a.full_name::text, a.role, a.store_id::text,
         a.email::text, a.permissions, a.is_active
  FROM public.app_users a
  WHERE a.auth_user_id = auth.uid()
     OR lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  LIMIT 1
$$;

DROP FUNCTION IF EXISTS public.list_app_users();
CREATE FUNCTION public.list_app_users()
RETURNS TABLE (id uuid, auth_user_id uuid, user_id text, full_name text, email text,
               role app_role, store_id text, is_active boolean, permissions jsonb,
               last_login_at timestamptz, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
  SELECT a.id, a.auth_user_id, a.user_id::text, a.full_name::text, a.email::text,
         a.role, a.store_id::text, a.is_active, a.permissions, a.last_login_at, a.created_at
  FROM public.app_users a
  WHERE public.is_app_supervisor()
  ORDER BY a.user_id
$$;

DROP FUNCTION IF EXISTS public.set_app_user_permissions(text, jsonb);
CREATE FUNCTION public.set_app_user_permissions(p_user_id text, p_permissions jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  IF NOT public.is_app_supervisor() THEN
    RAISE EXCEPTION 'Only supervisors can change permissions';
  END IF;
  UPDATE public.app_users a
     SET permissions = coalesce(a.permissions, '{}'::jsonb) || p_permissions,
         updated_at = now()
   WHERE lower(a.user_id) = lower(trim(p_user_id));
END $$;

DROP FUNCTION IF EXISTS public.set_app_user_profile(text, text, app_role, text, boolean);
CREATE FUNCTION public.set_app_user_profile(
  p_user_id text, p_full_name text, p_role app_role, p_store_id text, p_is_active boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
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
END $$;

DROP FUNCTION IF EXISTS public.upsert_terminal_user(text, text, app_role, text, text, text, text);
CREATE FUNCTION public.upsert_terminal_user(
  p_user_id text, p_full_name text, p_role app_role, p_store_id text,
  p_email text, p_pin text, p_password text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
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
END $$;

DROP FUNCTION IF EXISTS public.set_terminal_active(text, boolean);
CREATE FUNCTION public.set_terminal_active(p_user_id text, p_active boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  IF NOT public.is_app_supervisor() THEN
    RAISE EXCEPTION 'Only supervisors can manage terminal users';
  END IF;
  UPDATE public.app_users a SET is_active = p_active, updated_at = now()
   WHERE lower(a.user_id) = lower(trim(p_user_id));
END $$;

DROP FUNCTION IF EXISTS public.delete_terminal_user(text);
CREATE FUNCTION public.delete_terminal_user(p_user_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Only admins can delete terminal users';
  END IF;
  DELETE FROM public.app_users a WHERE lower(a.user_id) = lower(trim(p_user_id));
END $$;

-- ------------------------------------------------------------- cashiers ---
CREATE TABLE IF NOT EXISTS public.cashiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL,
  full_name text NOT NULL DEFAULT '',
  pin_hash text NOT NULL,
  store_id text,
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS cashiers_username_key
  ON public.cashiers (lower(username));

REVOKE ALL ON public.cashiers FROM anon;
REVOKE ALL ON public.cashiers FROM authenticated;
GRANT ALL ON public.cashiers TO service_role;
ALTER TABLE public.cashiers ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS cashiers_touch_updated_at ON public.cashiers;
CREATE TRIGGER cashiers_touch_updated_at BEFORE UPDATE ON public.cashiers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP FUNCTION IF EXISTS public.list_cashiers();
CREATE FUNCTION public.list_cashiers()
RETURNS TABLE (id uuid, username text, full_name text, store_id text,
               permissions jsonb, is_active boolean,
               last_login_at timestamptz, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
  SELECT c.id, c.username, c.full_name, c.store_id, c.permissions,
         c.is_active, c.last_login_at, c.created_at
  FROM public.cashiers c
  WHERE public.is_app_supervisor()
  ORDER BY c.username
$$;

DROP FUNCTION IF EXISTS public.upsert_cashier(uuid, text, text, text, text, boolean);
CREATE FUNCTION public.upsert_cashier(
  p_id uuid, p_username text, p_full_name text, p_pin text,
  p_store_id text, p_is_active boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
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
END $$;

DROP FUNCTION IF EXISTS public.set_cashier_permissions(uuid, jsonb);
CREATE FUNCTION public.set_cashier_permissions(p_id uuid, p_permissions jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  IF NOT public.is_app_supervisor() THEN
    RAISE EXCEPTION 'Only supervisors and admins can manage cashiers';
  END IF;
  UPDATE public.cashiers
     SET permissions = coalesce(permissions, '{}'::jsonb) || coalesce(p_permissions, '{}'::jsonb)
   WHERE id = p_id;
END $$;

DROP FUNCTION IF EXISTS public.delete_cashier(uuid);
CREATE FUNCTION public.delete_cashier(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  IF NOT public.is_app_supervisor() THEN
    RAISE EXCEPTION 'Only supervisors and admins can manage cashiers';
  END IF;
  DELETE FROM public.cashiers WHERE id = p_id;
END $$;

DROP FUNCTION IF EXISTS public.verify_cashier_pin(text, text);
CREATE FUNCTION public.verify_cashier_pin(p_username text, p_pin text)
RETURNS TABLE (id uuid, username text, full_name text, store_id text, permissions jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
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
END $$;

-- ------------------------------------------------------- auth user sync ---
CREATE OR REPLACE FUNCTION public.sync_auth_user_to_public()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_code text := coalesce(nullif(trim(new.raw_user_meta_data ->> 'user_id'), ''),
                          split_part(new.email, '@', 1));
  v_name text := coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), v_code);
  v_store text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'store_id', '')), '');
BEGIN
  INSERT INTO public.app_users (user_id, full_name, role, store_id, email, auth_user_id)
  VALUES (v_code, v_name, 'staff'::app_role, v_store, lower(new.email), new.id)
  ON CONFLICT (user_id) DO UPDATE
    SET full_name    = excluded.full_name,
        store_id     = coalesce(excluded.store_id, public.app_users.store_id),
        email        = excluded.email,
        auth_user_id = excluded.auth_user_id,
        updated_at   = now();
  RETURN new;
END $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT OR UPDATE OF email, raw_user_meta_data ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.sync_auth_user_to_public();

-- ----------------------------------------------------------- privileges ---
REVOKE ALL ON FUNCTION public.is_app_supervisor() FROM public;
REVOKE ALL ON FUNCTION public.verify_terminal_pin(text, text) FROM public;
REVOKE ALL ON FUNCTION public.current_app_user() FROM public;
REVOKE ALL ON FUNCTION public.list_app_users() FROM public;
REVOKE ALL ON FUNCTION public.set_app_user_permissions(text, jsonb) FROM public;
REVOKE ALL ON FUNCTION public.set_app_user_profile(text, text, app_role, text, boolean) FROM public;
REVOKE ALL ON FUNCTION public.upsert_terminal_user(text, text, app_role, text, text, text, text) FROM public;
REVOKE ALL ON FUNCTION public.set_terminal_active(text, boolean) FROM public;
REVOKE ALL ON FUNCTION public.delete_terminal_user(text) FROM public;
REVOKE ALL ON FUNCTION public.list_cashiers() FROM public;
REVOKE ALL ON FUNCTION public.upsert_cashier(uuid, text, text, text, text, boolean) FROM public;
REVOKE ALL ON FUNCTION public.set_cashier_permissions(uuid, jsonb) FROM public;
REVOKE ALL ON FUNCTION public.delete_cashier(uuid) FROM public;
REVOKE ALL ON FUNCTION public.verify_cashier_pin(text, text) FROM public;

GRANT EXECUTE ON FUNCTION public.is_app_supervisor() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_app_user() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_app_users() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_app_user_permissions(text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_app_user_profile(text, text, app_role, text, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.upsert_terminal_user(text, text, app_role, text, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_terminal_active(text, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_terminal_user(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_cashiers() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.upsert_cashier(uuid, text, text, text, text, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_cashier_permissions(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_cashier(uuid) TO authenticated, service_role;
-- The till has no session yet when staff sign in with a PIN.
GRANT EXECUTE ON FUNCTION public.verify_terminal_pin(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.verify_cashier_pin(text, text) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';