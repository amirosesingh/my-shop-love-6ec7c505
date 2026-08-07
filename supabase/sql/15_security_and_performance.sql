-- ============================================================
-- 15_security_and_performance.sql — zero-trust hardening,
-- branch (tenant) isolation, statement-level identity checks
-- and the index set that keeps reports fast at scale.
-- Safe to run repeatedly: nothing is dropped destructively.
-- Requires: every earlier numbered file in this folder.
-- ============================================================

-- ---------- identity helpers (evaluated once per statement) ----------
CREATE OR REPLACE FUNCTION public.is_staff_now()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$ SELECT public.is_staff((SELECT auth.uid())) $function$;

CREATE OR REPLACE FUNCTION public.is_supervisor_now()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$ SELECT public.is_app_supervisor() $function$;

-- Branch assigned to the caller, or NULL when none is recorded.
CREATE OR REPLACE FUNCTION public.user_store_id()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT nullif(btrim(coalesce(a.store_id, '')), '')
    FROM public.app_users a
   WHERE a.is_active
     AND (a.auth_user_id = (SELECT auth.uid())
          OR lower(a.email) = lower(coalesce((SELECT auth.jwt()) ->> 'email', '')))
   LIMIT 1
$function$;

-- Cluster the caller's branch belongs to (used by scoped settings reads).
CREATE OR REPLACE FUNCTION public.user_cluster_id()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT coalesce(nullif(s.group_id, ''), 'default')
    FROM public.stores s
   WHERE s.id = public.user_store_id()
   LIMIT 1
$function$;

-- Cross-branch access: admins/managers always; a branch-assigned cashier only
-- for their own branch (or rows with no branch stamped on them). Staff with no
-- branch recorded keep site-wide visibility so nobody is locked out mid-shift.
CREATE OR REPLACE FUNCTION public.store_visible(_store_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT public.is_supervisor_now()
      OR public.user_store_id() IS NULL
      OR coalesce(btrim(_store_id), '') = ''
      OR btrim(_store_id) = public.user_store_id()
$function$;

GRANT EXECUTE ON FUNCTION public.is_staff_now() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_supervisor_now() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_store_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_cluster_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.store_visible(text) TO authenticated, service_role;

-- ---------- wrap identity checks in every existing policy ----------
-- Postgres evaluates a bare is_staff(auth.uid()) once per row; wrapped in a
-- scalar subquery it is evaluated once per statement.
DO $do$
DECLARE
  p record; q text; w text; roles text;
BEGIN
  FOR p IN
    SELECT * FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename NOT IN ('sales','sale_items','shifts','shift_sessions','held_orders',
                             'drawer_events','bookings','booking_payments',
                             'stock_adjustments','whatsapp_queue')
  LOOP
    q := p.qual; w := p.with_check;
    q := replace(replace(q, 'is_staff(auth.uid())', '(SELECT public.is_staff_now())'),
                 'is_app_supervisor()', '(SELECT public.is_supervisor_now())');
    w := replace(replace(w, 'is_staff(auth.uid())', '(SELECT public.is_staff_now())'),
                 'is_app_supervisor()', '(SELECT public.is_supervisor_now())');
    CONTINUE WHEN q IS NOT DISTINCT FROM p.qual AND w IS NOT DISTINCT FROM p.with_check;

    roles := array_to_string(p.roles, ', ');
    EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, p.tablename);
    EXECUTE format('CREATE POLICY %I ON public.%I AS %s FOR %s TO %s %s %s',
      p.policyname, p.tablename,
      CASE WHEN p.permissive = 'PERMISSIVE' THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
      p.cmd, roles,
      CASE WHEN q IS NULL THEN '' ELSE 'USING (' || q || ')' END,
      CASE WHEN w IS NULL THEN '' ELSE 'WITH CHECK (' || w || ')' END);
  END LOOP;
END $do$;

-- ---------- branch-scoped tables ----------
DO $do$
DECLARE t text; p record;
BEGIN
  FOREACH t IN ARRAY ARRAY['sales','sale_items','shifts','shift_sessions','held_orders',
                           'drawer_events','bookings','booking_payments',
                           'stock_adjustments','whatsapp_queue']
  LOOP
    CONTINUE WHEN to_regclass('public.' || t) IS NULL;
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, t);
    END LOOP;
  END LOOP;
END $do$;

CREATE POLICY "Branch staff read sales" ON public.sales FOR SELECT TO authenticated
  USING ((SELECT public.is_staff_now()) AND public.store_visible(store_id));
CREATE POLICY "Branch staff insert sales" ON public.sales FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_staff_now()) AND public.store_visible(store_id));
CREATE POLICY "Branch staff update sales" ON public.sales FOR UPDATE TO authenticated
  USING ((SELECT public.is_staff_now()) AND public.store_visible(store_id))
  WITH CHECK ((SELECT public.is_staff_now()) AND public.store_visible(store_id));
CREATE POLICY "Supervisors delete sales" ON public.sales FOR DELETE TO authenticated
  USING ((SELECT public.is_supervisor_now()));

CREATE POLICY "Branch staff read sale items" ON public.sale_items FOR SELECT TO authenticated
  USING ((SELECT public.is_staff_now()) AND EXISTS (
    SELECT 1 FROM public.sales s WHERE s.id = sale_items.sale_id AND public.store_visible(s.store_id)));
CREATE POLICY "Branch staff insert sale items" ON public.sale_items FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_staff_now()) AND EXISTS (
    SELECT 1 FROM public.sales s WHERE s.id = sale_items.sale_id AND public.store_visible(s.store_id)));
CREATE POLICY "Branch staff update sale items" ON public.sale_items FOR UPDATE TO authenticated
  USING ((SELECT public.is_staff_now()) AND EXISTS (
    SELECT 1 FROM public.sales s WHERE s.id = sale_items.sale_id AND public.store_visible(s.store_id)))
  WITH CHECK ((SELECT public.is_staff_now()));
CREATE POLICY "Supervisors delete sale items" ON public.sale_items FOR DELETE TO authenticated
  USING ((SELECT public.is_supervisor_now()));

CREATE POLICY "Branch staff read shifts" ON public.shifts FOR SELECT TO authenticated
  USING ((SELECT public.is_staff_now()) AND public.store_visible(store_id));
CREATE POLICY "Branch staff open shifts" ON public.shifts FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_staff_now()) AND public.store_visible(store_id));
CREATE POLICY "Branch staff update shifts" ON public.shifts FOR UPDATE TO authenticated
  USING ((SELECT public.is_staff_now()) AND public.store_visible(store_id))
  WITH CHECK ((SELECT public.is_staff_now()) AND public.store_visible(store_id));

CREATE POLICY "Branch staff read shift sessions" ON public.shift_sessions FOR SELECT TO authenticated
  USING ((SELECT public.is_staff_now()) AND public.store_visible(store_id));
CREATE POLICY "Branch staff insert shift sessions" ON public.shift_sessions FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_staff_now()) AND public.store_visible(store_id));
CREATE POLICY "Branch staff update shift sessions" ON public.shift_sessions FOR UPDATE TO authenticated
  USING ((SELECT public.is_staff_now()) AND public.store_visible(store_id))
  WITH CHECK ((SELECT public.is_staff_now()) AND public.store_visible(store_id));

CREATE POLICY "Branch staff manage held orders" ON public.held_orders FOR ALL TO authenticated
  USING ((SELECT public.is_staff_now()) AND public.store_visible(store_id))
  WITH CHECK ((SELECT public.is_staff_now()) AND public.store_visible(store_id));

CREATE POLICY "Branch staff read drawer events" ON public.drawer_events FOR SELECT TO authenticated
  USING ((SELECT public.is_staff_now()) AND public.store_visible(store_id));
CREATE POLICY "Branch staff append drawer events" ON public.drawer_events FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_staff_now()) AND public.store_visible(store_id));

CREATE POLICY "Branch staff read bookings" ON public.bookings FOR SELECT TO authenticated
  USING ((SELECT public.is_staff_now()) AND public.store_visible(store_id));
CREATE POLICY "Branch staff insert bookings" ON public.bookings FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_staff_now()) AND public.store_visible(store_id));
CREATE POLICY "Branch staff update bookings" ON public.bookings FOR UPDATE TO authenticated
  USING ((SELECT public.is_staff_now()) AND public.store_visible(store_id))
  WITH CHECK ((SELECT public.is_staff_now()) AND public.store_visible(store_id));
CREATE POLICY "Branch staff delete bookings" ON public.bookings FOR DELETE TO authenticated
  USING ((SELECT public.is_staff_now()) AND public.store_visible(store_id));

CREATE POLICY "Branch staff read booking payments" ON public.booking_payments FOR SELECT TO authenticated
  USING ((SELECT public.is_staff_now()) AND EXISTS (
    SELECT 1 FROM public.bookings b WHERE b.id = booking_payments.booking_id AND public.store_visible(b.store_id)));
CREATE POLICY "Branch staff insert booking payments" ON public.booking_payments FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_staff_now()) AND EXISTS (
    SELECT 1 FROM public.bookings b WHERE b.id = booking_payments.booking_id AND public.store_visible(b.store_id)));
CREATE POLICY "Branch staff update booking payments" ON public.booking_payments FOR UPDATE TO authenticated
  USING ((SELECT public.is_staff_now()) AND EXISTS (
    SELECT 1 FROM public.bookings b WHERE b.id = booking_payments.booking_id AND public.store_visible(b.store_id)))
  WITH CHECK ((SELECT public.is_staff_now()));
CREATE POLICY "Branch staff delete booking payments" ON public.booking_payments FOR DELETE TO authenticated
  USING ((SELECT public.is_staff_now()) AND EXISTS (
    SELECT 1 FROM public.bookings b WHERE b.id = booking_payments.booking_id AND public.store_visible(b.store_id)));

CREATE POLICY "Branch staff read stock adjustments" ON public.stock_adjustments FOR SELECT TO authenticated
  USING ((SELECT public.is_staff_now()) AND public.store_visible(store_id));
CREATE POLICY "Branch staff append stock adjustments" ON public.stock_adjustments FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_staff_now()) AND public.store_visible(store_id));

CREATE POLICY "Branch staff manage whatsapp queue" ON public.whatsapp_queue FOR ALL TO authenticated
  USING ((SELECT public.is_staff_now()) AND public.store_visible(store_id))
  WITH CHECK ((SELECT public.is_staff_now()) AND public.store_visible(store_id));

-- ---------- scoped settings: branch rows follow the caller's branch ----------
DO $do$
BEGIN
  IF to_regclass('public.settings_scoped') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Staff read scoped settings" ON public.settings_scoped;
    CREATE POLICY "Staff read scoped settings" ON public.settings_scoped
      FOR SELECT TO authenticated
      USING ((SELECT public.is_staff_now()) AND (
        scope = 'GLOBAL'
        OR (SELECT public.is_supervisor_now())
        OR public.user_store_id() IS NULL
        OR (scope = 'BRANCH'  AND scope_id = public.user_store_id())
        OR (scope = 'CLUSTER' AND scope_id = public.user_cluster_id())));
  END IF;
END $do$;

-- ---------- lock the search path on every routine ----------
DO $do$
DECLARE f record; cfg text;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure::text AS sig,
           (SELECT c FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) c
             WHERE c LIKE 'search_path=%') AS sp
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
  LOOP
    cfg := coalesce(replace(f.sp, 'search_path=', ''), 'public');
    CONTINUE WHEN position('pg_temp' in cfg) > 0;
    EXECUTE format('ALTER FUNCTION %s SET search_path = %s', f.sig, cfg || ', pg_temp');
  END LOOP;
END $do$;

-- ---------- guard-column, foreign-key and composite indexes ----------
CREATE INDEX IF NOT EXISTS sales_store_idx ON public.sales (store_id);
CREATE INDEX IF NOT EXISTS sales_shift_idx ON public.sales (shift_id);
CREATE INDEX IF NOT EXISTS sales_store_created_idx ON public.sales (store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS sales_shift_created_idx ON public.sales (shift_id, created_at);
CREATE INDEX IF NOT EXISTS sale_items_product_idx ON public.sale_items (product_id);
CREATE INDEX IF NOT EXISTS sale_items_created_idx ON public.sale_items (created_at DESC);
CREATE INDEX IF NOT EXISTS bookings_store_idx ON public.bookings (store_id);
CREATE INDEX IF NOT EXISTS bookings_member_idx ON public.bookings (member_id);
CREATE INDEX IF NOT EXISTS bookings_store_status_created_idx ON public.bookings (store_id, job_status, created_at DESC);
CREATE INDEX IF NOT EXISTS booking_payments_booking_idx ON public.booking_payments (booking_id);
CREATE INDEX IF NOT EXISTS held_orders_store_idx ON public.held_orders (store_id);
CREATE INDEX IF NOT EXISTS drawer_events_store_created_idx ON public.drawer_events (store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS shift_sessions_staff_idx ON public.shift_sessions (staff_id);
CREATE INDEX IF NOT EXISTS stock_adjustments_store_idx ON public.stock_adjustments (store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS stock_adjustments_product_idx ON public.stock_adjustments (product_id);
CREATE INDEX IF NOT EXISTS stores_group_idx ON public.stores (group_id);
CREATE INDEX IF NOT EXISTS user_roles_user_idx ON public.user_roles (user_id);
CREATE INDEX IF NOT EXISTS app_users_store_idx ON public.app_users (store_id);
CREATE INDEX IF NOT EXISTS app_users_email_lower_idx ON public.app_users (lower(email));
CREATE INDEX IF NOT EXISTS issued_vouchers_campaign_idx ON public.issued_vouchers (campaign_id);
CREATE INDEX IF NOT EXISTS purchase_orders_supplier_idx ON public.purchase_orders (supplier_id);
CREATE INDEX IF NOT EXISTS purchase_order_items_product_idx ON public.purchase_order_items (product_id);
CREATE INDEX IF NOT EXISTS audit_logs_module_created_idx ON public.audit_logs (target_module, created_at DESC);
CREATE INDEX IF NOT EXISTS coupon_events_type_created_idx ON public.coupon_events (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS stock_transfers_to_status_idx ON public.stock_transfers (to_store_id, status);
CREATE INDEX IF NOT EXISTS products_category_idx ON public.products (category);
CREATE INDEX IF NOT EXISTS sku_audit_product_idx ON public.sku_audit (product_id);

-- partial indexes for hot conditional lookups
CREATE INDEX IF NOT EXISTS shifts_open_store_idx ON public.shifts (store_id) WHERE closed_at IS NULL;
CREATE INDEX IF NOT EXISTS issued_vouchers_active_member_idx ON public.issued_vouchers (member_id) WHERE status = 'ISSUED';
CREATE INDEX IF NOT EXISTS coupon_campaigns_active_slug_idx ON public.coupon_campaigns (slug) WHERE is_active;
CREATE INDEX IF NOT EXISTS terminal_tokens_active_idx ON public.terminal_tokens (location_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS whatsapp_queue_pending_idx ON public.whatsapp_queue (queued_at) WHERE status = 'QUEUED';

DO $do$
BEGIN
  IF to_regclass('public.settings_scoped') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS settings_scoped_key_idx
      ON public.settings_scoped (scope, scope_id, key);
    CREATE INDEX IF NOT EXISTS settings_scoped_override_idx
      ON public.settings_scoped (scope, scope_id) WHERE is_overridden;
  END IF;
END $do$;

-- ---------- least-privilege EXECUTE on SECURITY DEFINER routines ----------
-- Strip inherited rights, then grant back explicitly. Only the storefront /
-- pre-auth entry points stay reachable by anonymous callers.
DO $grants$
DECLARE r record;
BEGIN
  -- future routines are created locked, not open
  EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC';
  EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon';
  EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM authenticated';

  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
  END LOOP;

  FOR r IN
    SELECT p.oid::regprocedure AS sig, p.proname
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    IF r.proname IN ('coupon_claim', 'member_welcome_claim', 'voucher_by_token',
                     'verify_cashier_pin', 'verify_terminal_pin',
                     'terminal_token_status', 'terminal_token_heartbeat') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated', r.sig);
    ELSIF r.proname IN ('current_app_user', 'list_app_users', 'list_cashiers',
                        'upsert_cashier', 'delete_cashier', 'set_cashier_permissions',
                        'upsert_terminal_user', 'delete_terminal_user', 'set_terminal_active',
                        'set_app_user_profile', 'set_app_user_permissions',
                        'coupon_issue_manual', 'voucher_redeem', 'voucher_set_status',
                        'stock_transfer_receive', 'terminal_token_claim',
                        'security_selfcheck', 'security_set_finding_status') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
    END IF;
    -- every other routine (internal helpers, trigger bodies) stays owner-only
  END LOOP;
END $grants$;

-- ---------- verification ----------
SELECT 'branch isolation' AS check, count(*) AS policies
  FROM pg_policies WHERE schemaname = 'public' AND qual LIKE '%store_visible%';

-- ============================================================
-- Server-side enforcement of per-staff permission switches and
-- strict branch isolation (added in the permissions hardening pass).
-- ============================================================

CREATE OR REPLACE FUNCTION public.has_perm(_flag text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN (SELECT auth.uid()) IS NULL THEN false
    WHEN public.is_app_supervisor() THEN true
    ELSE coalesce((
      SELECT (a.permissions ->> _flag)::boolean
        FROM public.app_users a
       WHERE a.is_active
         AND (a.auth_user_id = (SELECT auth.uid())
              OR lower(a.email) = lower(coalesce((SELECT auth.jwt()) ->> 'email', '')))
       LIMIT 1), false)
  END
$$;
GRANT EXECUTE ON FUNCTION public.has_perm(text) TO authenticated, service_role;

-- Unassigned staff no longer see every branch; only supervisors do.
CREATE OR REPLACE FUNCTION public.store_visible(_store_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.is_supervisor_now()
      OR coalesce(btrim(_store_id), '') = ''
      OR btrim(_store_id) = public.user_store_id()
$$;

-- Discount / refund / price / loyalty guards run in the database, so a
-- direct PostgREST call cannot bypass the UI permission toggles.
-- (See the matching migration for the full trigger bodies:
--  enforce_sale_permissions, enforce_sale_item_permissions,
--  enforce_booking_permissions, enforce_product_price_permissions,
--  enforce_member_points_permissions.)
