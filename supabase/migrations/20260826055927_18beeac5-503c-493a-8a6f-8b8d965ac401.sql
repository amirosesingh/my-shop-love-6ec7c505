-- Configuration overrides were world-readable (role public, USING true), which
-- exposed every branch/cluster patch and every PRIVATE per-user row.
-- Activated tills hold a machine account session and back-office users sign in,
-- so scoping to `authenticated` does not lock anyone out.
DROP POLICY IF EXISTS "settings_overrides_read" ON public.settings_overrides;

CREATE POLICY "settings_overrides_read"
  ON public.settings_overrides
  FOR SELECT
  TO authenticated
  USING (
    scope <> 'PRIVATE'
    OR scope_id = public.settings_private_key()
  );

REVOKE SELECT ON public.settings_overrides FROM anon;

-- Scoped settings were readable by any authenticated account, staff or not.
-- Application reads go through the service-role relay, so this only affects
-- direct Data API access.
DROP POLICY IF EXISTS "settings_scoped_read" ON public.settings_scoped;

CREATE POLICY "settings_scoped_read"
  ON public.settings_scoped
  FOR SELECT
  TO authenticated
  USING (public.is_staff_now() OR public.is_supervisor_now());

REVOKE SELECT ON public.settings_scoped FROM anon;

-- Lock state leaked internal operational posture to unauthenticated callers.
DROP POLICY IF EXISTS "settings_locks_read" ON public.settings_locks;

CREATE POLICY "settings_locks_read"
  ON public.settings_locks
  FOR SELECT
  TO authenticated
  USING (true);

REVOKE SELECT ON public.settings_locks FROM anon;

GRANT SELECT ON public.settings_overrides TO authenticated;
GRANT SELECT ON public.settings_scoped TO authenticated;
GRANT SELECT ON public.settings_locks TO authenticated;
