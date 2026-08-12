ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS cashier_id text;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS created_by text;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS updated_by text;
CREATE INDEX IF NOT EXISTS sales_cashier_id_idx ON public.sales (cashier_id);

CREATE OR REPLACE FUNCTION public.app_users_require_store()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.store_id IS NULL AND NEW.role NOT IN ('admin', 'manager') THEN
    RAISE EXCEPTION 'A till account must be assigned to a branch';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS app_users_require_store ON public.app_users;
CREATE TRIGGER app_users_require_store
BEFORE INSERT OR UPDATE ON public.app_users
FOR EACH ROW EXECUTE FUNCTION public.app_users_require_store();

DROP POLICY IF EXISTS "Branch staff insert sale items" ON public.sale_items;
CREATE POLICY "Branch staff insert sale items" ON public.sale_items
FOR INSERT TO authenticated
WITH CHECK (
  (SELECT public.is_staff_now()) AND EXISTS (
    SELECT 1 FROM public.sales s
    WHERE s.id = sale_items.sale_id AND public.user_has_store_access(s.store_id)
  )
);

DROP POLICY IF EXISTS "Branch staff insert booking payments" ON public.booking_payments;
CREATE POLICY "Branch staff insert booking payments" ON public.booking_payments
FOR INSERT TO authenticated
WITH CHECK (
  (SELECT public.is_staff_now()) AND EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.id = booking_payments.booking_id AND public.user_has_store_access(b.store_id)
  )
);

DROP POLICY IF EXISTS "Branch staff write transfer items" ON public.stock_transfer_items;
CREATE POLICY "Branch staff write transfer items" ON public.stock_transfer_items
FOR ALL TO authenticated
USING (
  (SELECT public.is_staff_now()) AND EXISTS (
    SELECT 1 FROM public.stock_transfers t
    WHERE t.id = stock_transfer_items.transfer_id
      AND (public.user_has_store_access(t.from_store_id) OR public.user_has_store_access(t.to_store_id))
  )
)
WITH CHECK (
  (SELECT public.is_staff_now()) AND EXISTS (
    SELECT 1 FROM public.stock_transfers t
    WHERE t.id = stock_transfer_items.transfer_id
      AND (public.user_has_store_access(t.from_store_id) OR public.user_has_store_access(t.to_store_id))
  )
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales, public.sale_items,
  public.booking_payments, public.stock_transfer_items TO authenticated;
GRANT ALL ON public.sales, public.sale_items, public.booking_payments,
  public.stock_transfer_items TO service_role;