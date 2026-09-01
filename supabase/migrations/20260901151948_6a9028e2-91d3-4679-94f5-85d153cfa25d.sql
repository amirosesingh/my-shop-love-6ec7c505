DROP POLICY IF EXISTS "product_barcodes_read" ON public.product_barcodes;
CREATE POLICY "product_barcodes_read" ON public.product_barcodes
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND public.is_staff_now());
REVOKE SELECT ON public.product_barcodes FROM anon;