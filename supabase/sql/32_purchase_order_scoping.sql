-- ============================================================
-- 32_purchase_order_scoping.sql — Branch scoping for receiving orders
-- Safe to run repeatedly. Requires 02_staff_and_access.sql and 06_inventory_ops.sql.
-- ============================================================

-- ---------- columns (folded in from supabase/schema32.sql) ----------
-- Older databases built only from the numbered files do not have these yet.
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS store_id text;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS store_code text;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS invoice_date date;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS invoice_entry_date timestamp with time zone DEFAULT now();
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone NOT NULL DEFAULT now();

UPDATE public.purchase_orders
   SET invoice_entry_date = COALESCE(invoice_entry_date, created_at, now())
 WHERE invoice_entry_date IS NULL;

ALTER TABLE public.purchase_order_items ADD COLUMN IF NOT EXISTS sku text;
ALTER TABLE public.purchase_order_items ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone NOT NULL DEFAULT now();

-- Shared touch trigger function, in case 99_fix_grants_and_helpers.sql has not run.
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS purchase_orders_touch_updated_at ON public.purchase_orders;
CREATE TRIGGER purchase_orders_touch_updated_at
BEFORE UPDATE ON public.purchase_orders
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS purchase_order_items_touch_updated_at ON public.purchase_order_items;
CREATE TRIGGER purchase_order_items_touch_updated_at
BEFORE UPDATE ON public.purchase_order_items
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------- helper fallbacks ----------
-- The policies below call these; create permissive stand-ins only when missing so
-- the file never fails on an older database. Real definitions live in 02/29.
DO $$
BEGIN
  IF to_regprocedure('public.is_staff(uuid)') IS NULL THEN
    EXECUTE $fn$
      CREATE FUNCTION public.is_staff(_user_id uuid) RETURNS boolean
      LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
      AS 'SELECT _user_id IS NOT NULL';
    $fn$;
  END IF;
  IF to_regprocedure('public.is_app_supervisor()') IS NULL THEN
    EXECUTE $fn$
      CREATE FUNCTION public.is_app_supervisor() RETURNS boolean
      LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
      AS 'SELECT false';
    $fn$;
  END IF;
  IF to_regprocedure('public.store_visible(text)') IS NULL THEN
    EXECUTE $fn$
      CREATE FUNCTION public.store_visible(_store_id text) RETURNS boolean
      LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
      AS 'SELECT true';
    $fn$;
  END IF;
END $$;

-- ---------- indexes ----------
CREATE INDEX IF NOT EXISTS purchase_orders_store_idx
  ON public.purchase_orders USING btree (store_id);

CREATE INDEX IF NOT EXISTS purchase_orders_entry_idx
  ON public.purchase_orders USING btree (invoice_entry_date DESC);

-- ---------- branch aware policies ----------
-- Supervisors and admins see every branch (the master view); a branch account
-- only sees its own store plus legacy rows saved before branches existed.
DROP POLICY IF EXISTS "Staff can read purchase orders" ON public.purchase_orders;
CREATE POLICY "Staff can read purchase orders" ON public.purchase_orders
  FOR SELECT TO authenticated
  USING (
    public.is_staff(auth.uid())
    AND (store_id IS NULL OR public.is_app_supervisor() OR public.store_visible(store_id))
  );

DROP POLICY IF EXISTS "Staff can insert" ON public.purchase_orders;
CREATE POLICY "Staff can insert" ON public.purchase_orders
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_staff(auth.uid())
    AND (store_id IS NULL OR public.is_app_supervisor() OR public.store_visible(store_id))
  );

DROP POLICY IF EXISTS "Staff can update" ON public.purchase_orders;
CREATE POLICY "Staff can update" ON public.purchase_orders
  FOR UPDATE TO authenticated
  USING (
    public.is_staff(auth.uid())
    AND (store_id IS NULL OR public.is_app_supervisor() OR public.store_visible(store_id))
  )
  WITH CHECK (
    public.is_staff(auth.uid())
    AND (store_id IS NULL OR public.is_app_supervisor() OR public.store_visible(store_id))
  );

-- Lines follow their parent invoice.
DROP POLICY IF EXISTS "Staff can read purchase order items" ON public.purchase_order_items;
CREATE POLICY "Staff can read purchase order items" ON public.purchase_order_items
  FOR SELECT TO authenticated
  USING (
    public.is_staff(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.purchase_orders po
       WHERE po.id = purchase_order_items.po_id
         AND (po.store_id IS NULL OR public.is_app_supervisor() OR public.store_visible(po.store_id))
    )
  );

DROP POLICY IF EXISTS "Staff can insert" ON public.purchase_order_items;
CREATE POLICY "Staff can insert" ON public.purchase_order_items
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_staff(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.purchase_orders po
       WHERE po.id = purchase_order_items.po_id
         AND (po.store_id IS NULL OR public.is_app_supervisor() OR public.store_visible(po.store_id))
    )
  );

DROP POLICY IF EXISTS "Staff can update" ON public.purchase_order_items;
CREATE POLICY "Staff can update" ON public.purchase_order_items
  FOR UPDATE TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

-- ---------- grants (unchanged, restated for a clean re-run) ----------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_orders TO authenticated;
GRANT ALL ON public.purchase_orders TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_order_items TO authenticated;
GRANT ALL ON public.purchase_order_items TO service_role;
