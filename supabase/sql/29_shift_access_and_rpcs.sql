-- ============================================================
-- 29_shift_access_and_rpcs.sql — Cashier shift access + open/read routines
--
-- Fixes the two reasons a cashier could not open or see a shift:
--   * is_staff() only looked at user_roles, so staff created in the staff
--     screen (app_users) were not recognised.
--   * store_visible() denied anyone whose staff profile has no branch, which
--     is exactly the state of a terminal-bound cashier.
--
-- Adds shift_open() — stores the shift and returns the full row, so the till
-- never needs a second, rule-checked read — and shift_active_for_branch().
--
-- Safe to run more than once. Requires 02_staff_and_access.sql and 05_shifts.sql.
-- ============================================================

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

CREATE OR REPLACE FUNCTION public.store_visible(_store_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT public.is_supervisor_now()
      OR coalesce(btrim(_store_id), '') = ''
      OR public.user_store_id() IS NULL
      OR btrim(_store_id) = public.user_store_id()
$$;

-- ---------- open a shift and return the stored row ----------
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

-- ---------- the branch's open shift, as a full row ----------
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

-- ---------- rules and grants on shifts / shift_sessions ----------
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_sessions ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.shifts TO authenticated;
GRANT ALL ON public.shifts TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.shift_sessions TO authenticated;
GRANT ALL ON public.shift_sessions TO service_role;

DROP POLICY IF EXISTS "Branch staff read shifts" ON public.shifts;
CREATE POLICY "Branch staff read shifts" ON public.shifts
  FOR SELECT TO authenticated
  USING (public.is_staff_now() AND public.store_visible(store_id));

DROP POLICY IF EXISTS "Branch staff open shifts" ON public.shifts;
CREATE POLICY "Branch staff open shifts" ON public.shifts
  FOR INSERT TO authenticated
  WITH CHECK (public.is_staff_now() AND public.store_visible(store_id));

DROP POLICY IF EXISTS "Branch staff update shifts" ON public.shifts;
CREATE POLICY "Branch staff update shifts" ON public.shifts
  FOR UPDATE TO authenticated
  USING (public.is_staff_now() AND public.store_visible(store_id))
  WITH CHECK (public.is_staff_now() AND public.store_visible(store_id));

DROP POLICY IF EXISTS "Branch staff read shift sessions" ON public.shift_sessions;
CREATE POLICY "Branch staff read shift sessions" ON public.shift_sessions
  FOR SELECT TO authenticated
  USING (public.is_staff_now() AND public.store_visible(store_id));

DROP POLICY IF EXISTS "Branch staff insert shift sessions" ON public.shift_sessions;
CREATE POLICY "Branch staff insert shift sessions" ON public.shift_sessions
  FOR INSERT TO authenticated
  WITH CHECK (public.is_staff_now() AND public.store_visible(store_id));

DROP POLICY IF EXISTS "Branch staff update shift sessions" ON public.shift_sessions;
CREATE POLICY "Branch staff update shift sessions" ON public.shift_sessions
  FOR UPDATE TO authenticated
  USING (public.is_staff_now() AND public.store_visible(store_id))
  WITH CHECK (public.is_staff_now() AND public.store_visible(store_id));
