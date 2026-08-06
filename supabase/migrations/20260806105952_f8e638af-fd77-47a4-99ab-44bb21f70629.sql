
-- held_orders: staff only
DROP POLICY IF EXISTS "Staff manage held orders" ON public.held_orders;
CREATE POLICY "Staff manage held orders" ON public.held_orders
  FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- stock_adjustments: staff only
DROP POLICY IF EXISTS "Staff read stock adjustments" ON public.stock_adjustments;
CREATE POLICY "Staff read stock adjustments" ON public.stock_adjustments
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS "Staff add stock adjustments" ON public.stock_adjustments;
CREATE POLICY "Staff add stock adjustments" ON public.stock_adjustments
  FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));

-- whatsapp_queue: staff only
DROP POLICY IF EXISTS "Staff manage whatsapp queue" ON public.whatsapp_queue;
CREATE POLICY "Staff manage whatsapp queue" ON public.whatsapp_queue
  FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- coupon_campaigns: anonymous visitors only see live campaigns
DROP POLICY IF EXISTS "campaigns readable" ON public.coupon_campaigns;
CREATE POLICY "campaigns readable by staff" ON public.coupon_campaigns
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "live campaigns readable by public" ON public.coupon_campaigns
  FOR SELECT TO anon USING (public.campaign_is_live(coupon_campaigns));

-- coupon_events: append-only through security definer routines
REVOKE INSERT, UPDATE, DELETE ON public.coupon_events FROM authenticated;
REVOKE ALL ON public.coupon_events FROM anon;
GRANT SELECT ON public.coupon_events TO authenticated;

-- internal helper: not directly callable by clients
REVOKE EXECUTE ON FUNCTION public.member_join(text, text, text) FROM anon, authenticated;
