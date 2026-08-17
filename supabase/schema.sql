-- ============================================================
-- supabase/schema.sql — additive cloud schema top-up
-- ============================================================
-- Safe to run on a live database, as many times as you like:
--   * tables are only created when they are absent
--   * columns are only added when they are absent
--   * indexes are only created when they are absent
-- Nothing here drops, recreates, truncates or rewrites a row.
-- ============================================================

-- ---------- locations: stores, warehouses and warehouse levels ----------
CREATE TABLE IF NOT EXISTS public.stores (
  id          text PRIMARY KEY,
  code        text NOT NULL DEFAULT '',
  name        text NOT NULL DEFAULT '',
  address     text,
  phone       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS group_id      text NOT NULL DEFAULT 'default';
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS location_type text NOT NULL DEFAULT 'store';
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS parent_id     text;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS is_central    boolean NOT NULL DEFAULT false;
-- The sub-warehouse level stock is picked from first.
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS is_primary_sub boolean NOT NULL DEFAULT false;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS building_name text;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS floor_label   text;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS is_active     boolean NOT NULL DEFAULT true;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS archived_at   timestamptz;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS row_version   integer NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_stores_parent_id     ON public.stores (parent_id);
CREATE INDEX IF NOT EXISTS idx_stores_location_type ON public.stores (location_type);

-- A level must hang off a real location. Added only when it is missing, and
-- only when no orphan rows exist, so live data can never block an upgrade.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'stores_parent_id_fkey'
  ) AND NOT EXISTS (
    SELECT 1 FROM public.stores c
     WHERE c.parent_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.stores p WHERE p.id = c.parent_id)
  ) THEN
    ALTER TABLE public.stores
      ADD CONSTRAINT stores_parent_id_fkey
      FOREIGN KEY (parent_id) REFERENCES public.stores (id) ON DELETE SET NULL;
  END IF;
END $$;

-- ---------- lookup indexes used by receiving and transfers ----------
CREATE INDEX IF NOT EXISTS idx_stock_transfer_items_transfer ON public.stock_transfer_items (transfer_id);
CREATE INDEX IF NOT EXISTS idx_stock_transfer_items_product  ON public.stock_transfer_items (product_id);
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_order    ON public.purchase_order_items (purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_stock_adjustments_product     ON public.stock_adjustments (product_id);

-- ---------- access ----------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stores TO authenticated;
GRANT ALL ON public.stores TO service_role;
