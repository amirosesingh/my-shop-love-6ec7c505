-- ============================================================
-- 32_purchase_order_scoping.sql — Branch scoping for receiving orders
-- Safe to run repeatedly. Requires 02_staff_and_access.sql and 06_inventory_ops.sql.
-- ============================================================

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
