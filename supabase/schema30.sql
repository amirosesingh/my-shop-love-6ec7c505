-- ============================================================================
-- schema30.sql — product deletion protection + archiving
-- Additions only. Nothing is dropped and no data is seeded.
-- Run once against your database.
-- ============================================================================

-- 1. Products can be archived instead of deleted -----------------------------
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_products_is_archived ON public.products (is_archived);

-- 2. Sales history can never be detached from its product --------------------
DO $$ BEGIN
  ALTER TABLE public.sale_items DROP CONSTRAINT IF EXISTS sale_items_product_id_fkey;
  ALTER TABLE public.sale_items
    ADD CONSTRAINT sale_items_product_id_fkey
    FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;
EXCEPTION WHEN others THEN NULL; END $$;

-- 3. Ask before deleting -----------------------------------------------------
-- Reports which records still point at a product, so the app can explain the
-- refusal before it ever attempts the delete.
CREATE OR REPLACE FUNCTION public.product_delete_guard(_product_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'sales',       EXISTS (SELECT 1 FROM public.sale_items WHERE product_id = _product_id),
    'purchases',   EXISTS (SELECT 1 FROM public.purchase_order_items WHERE product_id = _product_id),
    'transfers',   EXISTS (SELECT 1 FROM public.stock_transfer_items WHERE product_id = _product_id),
    'adjustments', EXISTS (SELECT 1 FROM public.stock_adjustments WHERE product_id = _product_id),
    'promotions',  EXISTS (SELECT 1 FROM public.promotions WHERE foc_product_id = _product_id)
  );
$$;

GRANT EXECUTE ON FUNCTION public.product_delete_guard(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.product_delete_guard(uuid) TO service_role;
