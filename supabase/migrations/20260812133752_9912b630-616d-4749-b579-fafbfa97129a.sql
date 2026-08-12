-- Branch access helper: supervisors everywhere, everyone else their own branch.
CREATE OR REPLACE FUNCTION public.user_has_store_access(_store_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN _store_id IS NULL THEN public.is_staff_now()
    WHEN public.is_app_supervisor() THEN true
    ELSE EXISTS (
      SELECT 1 FROM public.app_users u
      WHERE u.auth_user_id = (SELECT auth.uid())
        AND u.is_active
        AND u.store_id = _store_id
    )
  END
$$;

REVOKE EXECUTE ON FUNCTION public.user_has_store_access(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.user_has_store_access(text) TO authenticated, service_role;

-- Sale lines: the written sale_id must also be in a visible branch.
DROP POLICY IF EXISTS "Branch staff update sale items" ON public.sale_items;
CREATE POLICY "Branch staff update sale items" ON public.sale_items
FOR UPDATE TO authenticated
USING (
  (SELECT public.is_staff_now()) AND EXISTS (
    SELECT 1 FROM public.sales s WHERE s.id = sale_items.sale_id AND public.store_visible(s.store_id)
  )
)
WITH CHECK (
  (SELECT public.is_staff_now()) AND EXISTS (
    SELECT 1 FROM public.sales s WHERE s.id = sale_items.sale_id AND public.store_visible(s.store_id)
  )
);

-- Booking payments: same rule on the written booking_id.
DROP POLICY IF EXISTS "Branch staff update booking payments" ON public.booking_payments;
CREATE POLICY "Branch staff update booking payments" ON public.booking_payments
FOR UPDATE TO authenticated
USING (
  (SELECT public.is_staff_now()) AND EXISTS (
    SELECT 1 FROM public.bookings b WHERE b.id = booking_payments.booking_id AND public.store_visible(b.store_id)
  )
)
WITH CHECK (
  (SELECT public.is_staff_now()) AND EXISTS (
    SELECT 1 FROM public.bookings b WHERE b.id = booking_payments.booking_id AND public.store_visible(b.store_id)
  )
);

-- Purchase order lines: edits and removals stay inside a visible order.
DROP POLICY IF EXISTS "Staff can update" ON public.purchase_order_items;
CREATE POLICY "Staff can update" ON public.purchase_order_items
FOR UPDATE TO authenticated
USING (
  (SELECT public.is_staff_now()) AND EXISTS (
    SELECT 1 FROM public.purchase_orders po
    WHERE po.id = purchase_order_items.po_id
      AND (po.store_id IS NULL OR public.is_app_supervisor() OR public.store_visible(po.store_id))
  )
)
WITH CHECK (
  (SELECT public.is_staff_now()) AND EXISTS (
    SELECT 1 FROM public.purchase_orders po
    WHERE po.id = purchase_order_items.po_id
      AND (po.store_id IS NULL OR public.is_app_supervisor() OR public.store_visible(po.store_id))
  )
);

DROP POLICY IF EXISTS "Staff can delete" ON public.purchase_order_items;
CREATE POLICY "Staff can delete" ON public.purchase_order_items
FOR DELETE TO authenticated
USING (
  (SELECT public.is_staff_now()) AND EXISTS (
    SELECT 1 FROM public.purchase_orders po
    WHERE po.id = purchase_order_items.po_id
      AND (po.store_id IS NULL OR public.is_app_supervisor() OR public.store_visible(po.store_id))
  )
);

DROP POLICY IF EXISTS "Staff can delete" ON public.purchase_orders;
CREATE POLICY "Staff can delete" ON public.purchase_orders
FOR DELETE TO authenticated
USING (
  (SELECT public.is_staff_now())
  AND (store_id IS NULL OR public.is_app_supervisor() OR public.store_visible(store_id))
);

-- Row protection stays on for every till table.
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.held_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drawer_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_transfer_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales, public.sale_items, public.shifts,
  public.shift_sessions, public.held_orders, public.bookings, public.booking_payments,
  public.drawer_events, public.stock_adjustments, public.purchase_orders,
  public.purchase_order_items, public.stock_transfers, public.stock_transfer_items,
  public.products, public.members, public.stores TO authenticated;
GRANT ALL ON public.sales, public.sale_items, public.shifts, public.shift_sessions,
  public.held_orders, public.bookings, public.booking_payments, public.drawer_events,
  public.stock_adjustments, public.purchase_orders, public.purchase_order_items,
  public.stock_transfers, public.stock_transfer_items, public.products, public.members,
  public.stores TO service_role;