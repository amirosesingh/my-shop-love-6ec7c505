-- 1. Staff recognition: fall back to the staff profile role.
CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT _user_id IS NOT NULL AND (
    EXISTS (
      SELECT 1 FROM public.user_roles
       WHERE user_id = _user_id AND role IN ('admin','manager','staff')
    )
    OR EXISTS (
      SELECT 1 FROM public.app_users a
       WHERE a.is_active
         AND a.auth_user_id = _user_id
         AND a.role::text IN ('admin','manager','staff')
    )
  )
$$;

-- 2. Branch visibility: a staff member with no branch on the profile is not denied.
CREATE OR REPLACE FUNCTION public.store_visible(_store_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT public.is_supervisor_now()
      OR coalesce(btrim(_store_id), '') = ''
      OR public.user_store_id() IS NULL
      OR btrim(_store_id) = public.user_store_id()
$$;

-- 3. Open a shift and return the full row (or the shift already open).
CREATE OR REPLACE FUNCTION public.shift_open(
  p_id uuid,
  p_store_id text,
  p_opened_by_name text,
  p_opening_float numeric DEFAULT 0,
  p_terminal_id text DEFAULT NULL,
  p_terminal_name text DEFAULT NULL,
  p_opened_by_staff_id text DEFAULT NULL,
  p_opened_by_role text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
) RETURNS public.shifts
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  _branch text := coalesce(nullif(btrim(coalesce(p_store_id, '')), ''), public.user_store_id());
  _row public.shifts;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Only staff can open a shift';
  END IF;
  IF coalesce(_branch, '') = '' THEN
    RAISE EXCEPTION 'SHIFT_BRANCH_REQUIRED';
  END IF;

  SELECT * INTO _row FROM public.shifts
   WHERE store_id = _branch AND status = 'OPEN' AND closed_at IS NULL
   ORDER BY opened_at DESC LIMIT 1;
  IF FOUND THEN RETURN _row; END IF;

  INSERT INTO public.shifts (
    id, store_id, terminal_id, terminal_name, opened_by_name,
    opened_by_staff_id, opened_by_role, opening_float, status, user_id
  ) VALUES (
    coalesce(p_id, gen_random_uuid()), _branch, p_terminal_id, p_terminal_name,
    coalesce(nullif(btrim(coalesce(p_opened_by_name, '')), ''), 'Cashier'),
    p_opened_by_staff_id, p_opened_by_role, coalesce(p_opening_float, 0), 'OPEN',
    coalesce(p_user_id, auth.uid())
  )
  RETURNING * INTO _row;

  RETURN _row;
END $$;

-- 4. The branch's currently open shift, as a full row.
CREATE OR REPLACE FUNCTION public.shift_active_for_branch(p_store_id text)
RETURNS public.shifts
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  _branch text := coalesce(nullif(btrim(coalesce(p_store_id, '')), ''), public.user_store_id());
  _row public.shifts;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Only staff can read shifts';
  END IF;
  SELECT * INTO _row FROM public.shifts
   WHERE store_id = _branch AND status = 'OPEN' AND closed_at IS NULL
   ORDER BY opened_at DESC LIMIT 1;
  RETURN _row;
END $$;

REVOKE ALL ON FUNCTION public.shift_open(uuid, text, text, numeric, text, text, text, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.shift_active_for_branch(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shift_open(uuid, text, text, numeric, text, text, text, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.shift_active_for_branch(text) TO authenticated, service_role;