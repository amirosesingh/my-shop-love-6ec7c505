-- ============================================================================
-- Product catalogue columns, barcode table, payload defaults and FK links.
-- Fully idempotent: safe to run repeatedly.
-- ============================================================================

-- 1. products ---------------------------------------------------------------
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS product_group text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS brand text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS barcode_variants jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 2. product_barcodes -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.product_barcodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  barcode text NOT NULL,
  label text,
  unit_label text,
  pack_size numeric NOT NULL DEFAULT 1,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  row_version integer NOT NULL DEFAULT 1
);
ALTER TABLE public.product_barcodes ADD COLUMN IF NOT EXISTS unit_label text;
ALTER TABLE public.product_barcodes ADD COLUMN IF NOT EXISTS pack_size numeric NOT NULL DEFAULT 1;
CREATE UNIQUE INDEX IF NOT EXISTS product_barcodes_barcode_key ON public.product_barcodes (barcode);
CREATE INDEX IF NOT EXISTS product_barcodes_product_idx ON public.product_barcodes (product_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_barcodes TO authenticated;
GRANT ALL ON public.product_barcodes TO service_role;
ALTER TABLE public.product_barcodes ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='product_barcodes') THEN
    CREATE POLICY product_barcodes_staff_access ON public.product_barcodes
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 3. product_categories -----------------------------------------------------
ALTER TABLE public.product_categories ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'standard';
ALTER TABLE public.product_categories ALTER COLUMN kind SET DEFAULT 'standard';

-- 4. bookings payload defaults ---------------------------------------------
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS tension_unit text;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS job_status text;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS notify_whatsapp boolean;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS liability_accepted boolean;

UPDATE public.bookings SET tension_unit = 'lbs' WHERE tension_unit IS NULL;
UPDATE public.bookings SET job_status = 'received' WHERE job_status IS NULL;
UPDATE public.bookings SET notify_whatsapp = false WHERE notify_whatsapp IS NULL;
UPDATE public.bookings SET liability_accepted = false WHERE liability_accepted IS NULL;

ALTER TABLE public.bookings ALTER COLUMN tension_unit SET DEFAULT 'lbs';
ALTER TABLE public.bookings ALTER COLUMN tension_unit DROP NOT NULL;
ALTER TABLE public.bookings ALTER COLUMN job_status SET DEFAULT 'received';
ALTER TABLE public.bookings ALTER COLUMN job_status DROP NOT NULL;
ALTER TABLE public.bookings ALTER COLUMN notify_whatsapp SET DEFAULT false;
ALTER TABLE public.bookings ALTER COLUMN notify_whatsapp DROP NOT NULL;
ALTER TABLE public.bookings ALTER COLUMN liability_accepted SET DEFAULT false;
ALTER TABLE public.bookings ALTER COLUMN liability_accepted DROP NOT NULL;

-- 5. payment_transactions payload defaults ----------------------------------
ALTER TABLE public.payment_transactions ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE public.payment_transactions ADD COLUMN IF NOT EXISTS metadata jsonb;
UPDATE public.payment_transactions SET status = 'completed' WHERE status IS NULL;
UPDATE public.payment_transactions SET metadata = '{}'::jsonb WHERE metadata IS NULL;
ALTER TABLE public.payment_transactions ALTER COLUMN status SET DEFAULT 'completed';
ALTER TABLE public.payment_transactions ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;

-- 6. Missing foreign key links ---------------------------------------------
-- Orphans are cleared first so the constraints can be validated.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_product_barcodes_product') THEN
    DELETE FROM public.product_barcodes ch
     WHERE ch.product_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.id = ch.product_id);
    ALTER TABLE public.product_barcodes
      ADD CONSTRAINT fk_product_barcodes_product
      FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;
  END IF;

  IF to_regclass('public.stock_transfer_items') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_stock_transfer_items_transfer') THEN
    DELETE FROM public.stock_transfer_items ch
     WHERE ch.transfer_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.stock_transfers t WHERE t.id = ch.transfer_id);
    ALTER TABLE public.stock_transfer_items
      ADD CONSTRAINT fk_stock_transfer_items_transfer
      FOREIGN KEY (transfer_id) REFERENCES public.stock_transfers(id) ON DELETE CASCADE;
  END IF;

  IF to_regclass('public.booking_payments') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_booking_payments_booking') THEN
    DELETE FROM public.booking_payments ch
     WHERE ch.booking_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = ch.booking_id);
    ALTER TABLE public.booking_payments
      ADD CONSTRAINT fk_booking_payments_booking
      FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS stock_transfer_items_transfer_idx ON public.stock_transfer_items (transfer_id);
CREATE INDEX IF NOT EXISTS booking_payments_booking_idx ON public.booking_payments (booking_id);
