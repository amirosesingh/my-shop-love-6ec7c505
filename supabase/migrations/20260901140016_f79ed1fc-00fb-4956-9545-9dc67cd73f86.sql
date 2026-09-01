-- Tombstones: a deletion needs a row to travel on, so nothing is hard-deleted.
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.product_categories ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.product_barcodes ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.uom_units ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.membership_tiers ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Tombstones ride down on the ordinary updated_at watermark.
CREATE INDEX IF NOT EXISTS products_deleted_idx ON public.products (updated_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS product_categories_deleted_idx ON public.product_categories (updated_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS product_barcodes_deleted_idx ON public.product_barcodes (updated_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS uom_units_deleted_idx ON public.uom_units (updated_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS suppliers_deleted_idx ON public.suppliers (updated_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS promotions_deleted_idx ON public.promotions (updated_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS membership_tiers_deleted_idx ON public.membership_tiers (updated_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS stores_deleted_idx ON public.stores (updated_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS members_deleted_idx ON public.members (updated_at) WHERE deleted_at IS NOT NULL;

-- Staff and till reads deliberately still see tombstoned rows: that is how a
-- till learns to drop its own copy. Only the public barcode lookup hides them.
DROP POLICY IF EXISTS product_barcodes_read ON public.product_barcodes;
CREATE POLICY product_barcodes_read ON public.product_barcodes
  FOR SELECT TO anon, authenticated
  USING (deleted_at IS NULL);
