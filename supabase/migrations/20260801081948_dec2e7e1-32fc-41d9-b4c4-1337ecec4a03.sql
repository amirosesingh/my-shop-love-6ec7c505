-- Restrict SELECT to staff only
DROP POLICY IF EXISTS "Signed-in staff can read" ON public.members;
CREATE POLICY "Staff can read members" ON public.members FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Signed-in staff can read" ON public.products;
CREATE POLICY "Staff can read products" ON public.products FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Signed-in staff can read" ON public.sales;
CREATE POLICY "Staff can read sales" ON public.sales FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Signed-in staff can read" ON public.sale_items;
CREATE POLICY "Staff can read sale items" ON public.sale_items FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Signed-in staff can read" ON public.promotions;
CREATE POLICY "Staff can read promotions" ON public.promotions FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Signed-in staff can read" ON public.pos_settings;
CREATE POLICY "Staff can read pos settings" ON public.pos_settings FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Signed-in staff can read" ON public.membership_tiers;
CREATE POLICY "Staff can read membership tiers" ON public.membership_tiers FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Signed-in staff can read" ON public.purchase_orders;
CREATE POLICY "Staff can read purchase orders" ON public.purchase_orders FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Signed-in staff can read" ON public.purchase_order_items;
CREATE POLICY "Staff can read purchase order items" ON public.purchase_order_items FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff can read audit logs" ON public.audit_logs;
CREATE POLICY "Staff can read audit logs" ON public.audit_logs FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

-- Internal role-check helpers must not be directly callable from the Data API
REVOKE EXECUTE ON FUNCTION public.is_staff(uuid) FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM authenticated, anon, public;