-- 1. Permission helper -------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_perm(_flag text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
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

-- 2. Branch isolation: no branch assigned means no cross-branch reads ----
CREATE OR REPLACE FUNCTION public.store_visible(_store_id text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.is_supervisor_now()
      OR coalesce(btrim(_store_id), '') = ''
      OR btrim(_store_id) = public.user_store_id()
$$;

-- 3. Discount / refund permission checks on money rows -------------------
CREATE OR REPLACE FUNCTION public.enforce_sale_permissions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RETURN NEW; END IF;

  IF coalesce(NEW.discount_amount, 0) > 0 OR coalesce(NEW.coupon_discount, 0) > 0 THEN
    IF NOT public.has_perm('can_give_discount') THEN
      RAISE EXCEPTION 'PERMISSION_DENIED_DISCOUNT';
    END IF;
  END IF;

  IF coalesce(NEW.is_refunded, false) THEN
    IF NOT public.has_perm('can_process_refund') THEN
      RAISE EXCEPTION 'PERMISSION_DENIED_REFUND';
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS sales_enforce_permissions ON public.sales;
CREATE TRIGGER sales_enforce_permissions
  BEFORE INSERT OR UPDATE ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.enforce_sale_permissions();

CREATE OR REPLACE FUNCTION public.enforce_sale_item_permissions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RETURN NEW; END IF;

  IF coalesce(NEW.discount_percent, 0) > 0
     OR coalesce(NEW.discount_amount, 0) > 0
     OR coalesce(NEW.coupon_discount, 0) > 0 THEN
    IF NOT public.has_perm('can_give_discount') THEN
      RAISE EXCEPTION 'PERMISSION_DENIED_DISCOUNT';
    END IF;
  END IF;

  IF coalesce(NEW.is_return, false) OR coalesce(NEW.quantity, 0) < 0 THEN
    IF NOT public.has_perm('can_process_refund') THEN
      RAISE EXCEPTION 'PERMISSION_DENIED_REFUND';
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS sale_items_enforce_permissions ON public.sale_items;
CREATE TRIGGER sale_items_enforce_permissions
  BEFORE INSERT OR UPDATE ON public.sale_items
  FOR EACH ROW EXECUTE FUNCTION public.enforce_sale_item_permissions();

CREATE OR REPLACE FUNCTION public.enforce_booking_permissions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RETURN NEW; END IF;

  IF coalesce(NEW.discount, 0) > 0
     AND (TG_OP = 'INSERT' OR coalesce(NEW.discount, 0) <> coalesce(OLD.discount, 0)) THEN
    IF NOT public.has_perm('can_give_discount') THEN
      RAISE EXCEPTION 'PERMISSION_DENIED_DISCOUNT';
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS bookings_enforce_permissions ON public.bookings;
CREATE TRIGGER bookings_enforce_permissions
  BEFORE INSERT OR UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.enforce_booking_permissions();

-- 4. Product price changes ----------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_product_price_permissions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RETURN NEW; END IF;

  IF TG_OP = 'UPDATE'
     AND (coalesce(NEW.selling_price, 0) <> coalesce(OLD.selling_price, 0)
       OR coalesce(NEW.cost_price, 0)    <> coalesce(OLD.cost_price, 0)
       OR coalesce(NEW.ecom_price, -1)   IS DISTINCT FROM coalesce(OLD.ecom_price, -1)) THEN
    IF NOT public.has_perm('can_edit_product_price') THEN
      RAISE EXCEPTION 'PERMISSION_DENIED_PRICE';
    END IF;
  END IF;

  IF TG_OP = 'INSERT' AND NOT public.has_perm('can_add_new_product') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED_PRODUCT';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS products_enforce_permissions ON public.products;
CREATE TRIGGER products_enforce_permissions
  BEFORE INSERT OR UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.enforce_product_price_permissions();

-- 5. Member loyalty edits ------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_member_points_permissions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RETURN NEW; END IF;

  IF TG_OP = 'UPDATE'
     AND (coalesce(NEW.loyalty_points, 0) <> coalesce(OLD.loyalty_points, 0)
       OR coalesce(NEW.total_spent, 0)    <> coalesce(OLD.total_spent, 0)
       OR NEW.tier_id IS DISTINCT FROM OLD.tier_id) THEN
    IF NOT public.has_perm('can_edit_member_points') THEN
      RAISE EXCEPTION 'PERMISSION_DENIED_MEMBER_POINTS';
    END IF;
  END IF;

  IF TG_OP = 'INSERT' AND NOT public.has_perm('can_add_member') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED_MEMBER';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS members_enforce_permissions ON public.members;
CREATE TRIGGER members_enforce_permissions
  BEFORE INSERT OR UPDATE ON public.members
  FOR EACH ROW EXECUTE FUNCTION public.enforce_member_points_permissions();

-- 6. Least-privilege execute rights on privileged routines ---------------
DO $grants$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig, p.proname
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);

    IF r.proname IN ('coupon_claim', 'member_welcome_claim', 'voucher_by_token',
                     'verify_cashier_pin', 'verify_terminal_pin',
                     'terminal_token_heartbeat', 'terminal_token_status') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated', r.sig);
    ELSIF r.proname NOT IN ('coupon_log', 'has_role', 'is_staff', 'member_join',
                            'sync_auth_user_to_public', 'security_report_findings',
                            'enforce_sale_permissions', 'enforce_sale_item_permissions',
                            'enforce_booking_permissions',
                            'enforce_product_price_permissions',
                            'enforce_member_points_permissions') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
    END IF;
  END LOOP;
END $grants$;