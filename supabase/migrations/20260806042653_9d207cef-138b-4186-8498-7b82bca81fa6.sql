DROP POLICY IF EXISTS "Staff can update booking payments" ON public.booking_payments;
CREATE POLICY "Staff can update booking payments" ON public.booking_payments
  FOR UPDATE TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff can delete booking payments" ON public.booking_payments;
CREATE POLICY "Staff can delete booking payments" ON public.booking_payments
  FOR DELETE TO authenticated
  USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff can delete bookings" ON public.bookings;
CREATE POLICY "Staff can delete bookings" ON public.bookings
  FOR DELETE TO authenticated
  USING (public.is_staff(auth.uid()));

ALTER TABLE public.sale_items
  ADD COLUMN IF NOT EXISTS unit_cost numeric NOT NULL DEFAULT 0;