CREATE OR REPLACE FUNCTION public.product_delete_guard(_product_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'exists', EXISTS (SELECT 1 FROM public.products p WHERE p.id = _product_id),
    'archived', COALESCE((SELECT p.is_archived FROM public.products p WHERE p.id = _product_id), false),
    'sales', EXISTS (SELECT 1 FROM public.sale_items si WHERE si.product_id = _product_id),
    'purchases', EXISTS (SELECT 1 FROM public.purchase_order_items poi WHERE poi.product_id = _product_id),
    'transfers', EXISTS (SELECT 1 FROM public.stock_transfer_items sti WHERE sti.product_id = _product_id),
    'adjustments', EXISTS (SELECT 1 FROM public.stock_adjustments sa WHERE sa.product_id = _product_id),
    'promotions', EXISTS (SELECT 1 FROM public.promotions pr WHERE pr.foc_product_id = _product_id)
  );
$$;

REVOKE ALL ON FUNCTION public.product_delete_guard(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.product_delete_guard(uuid) TO authenticated, service_role;

CREATE INDEX IF NOT EXISTS sale_items_product_id_idx ON public.sale_items (product_id);
CREATE INDEX IF NOT EXISTS purchase_order_items_product_id_idx ON public.purchase_order_items (product_id);
CREATE INDEX IF NOT EXISTS stock_transfer_items_product_id_idx ON public.stock_transfer_items (product_id);
CREATE INDEX IF NOT EXISTS stock_adjustments_product_id_idx ON public.stock_adjustments (product_id);
CREATE INDEX IF NOT EXISTS promotions_foc_product_id_idx ON public.promotions (foc_product_id);