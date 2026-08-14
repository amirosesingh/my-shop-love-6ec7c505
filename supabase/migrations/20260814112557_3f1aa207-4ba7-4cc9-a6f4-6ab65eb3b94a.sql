-- ============================================================
-- Schema v2 (safe, additive) — new tables + performance indexes
-- ============================================================

-- ---------- product_barcodes -------------------------------------------
CREATE TABLE IF NOT EXISTS public.product_barcodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  barcode text NOT NULL,
  label text,
  pack_size numeric NOT NULL DEFAULT 1,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_barcodes_barcode_key UNIQUE (barcode)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_barcodes TO authenticated;
GRANT SELECT ON public.product_barcodes TO anon;
GRANT ALL ON public.product_barcodes TO service_role;

ALTER TABLE public.product_barcodes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS product_barcodes_read ON public.product_barcodes;
CREATE POLICY product_barcodes_read ON public.product_barcodes
  FOR SELECT TO authenticated, anon USING (true);

DROP POLICY IF EXISTS product_barcodes_write ON public.product_barcodes;
CREATE POLICY product_barcodes_write ON public.product_barcodes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS product_barcodes_product_idx ON public.product_barcodes (product_id);

-- ---------- payment_transactions ---------------------------------------
CREATE TABLE IF NOT EXISTS public.payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type text NOT NULL CHECK (source_type IN ('sale', 'booking')),
  sale_id uuid REFERENCES public.sales(id) ON DELETE CASCADE,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE CASCADE,
  member_id uuid REFERENCES public.members(id) ON DELETE SET NULL,
  store_id text,
  shift_id text,
  terminal_id text,
  amount numeric NOT NULL DEFAULT 0,
  method text NOT NULL DEFAULT 'cash',
  kind text NOT NULL DEFAULT 'payment' CHECK (kind IN ('deposit', 'payment', 'settlement', 'refund', 'change')),
  reference text,
  cashier_id text,
  cashier_name text,
  note text NOT NULL DEFAULT '',
  paid_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_transactions TO authenticated;
GRANT ALL ON public.payment_transactions TO service_role;

ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_transactions_read ON public.payment_transactions;
CREATE POLICY payment_transactions_read ON public.payment_transactions
  FOR SELECT TO authenticated USING (store_id IS NULL OR public.store_visible(store_id));

DROP POLICY IF EXISTS payment_transactions_write ON public.payment_transactions;
CREATE POLICY payment_transactions_write ON public.payment_transactions
  FOR INSERT TO authenticated WITH CHECK (store_id IS NULL OR public.store_visible(store_id));

DROP POLICY IF EXISTS payment_transactions_update ON public.payment_transactions;
CREATE POLICY payment_transactions_update ON public.payment_transactions
  FOR UPDATE TO authenticated
  USING (store_id IS NULL OR public.store_visible(store_id))
  WITH CHECK (store_id IS NULL OR public.store_visible(store_id));

CREATE INDEX IF NOT EXISTS payment_transactions_sale_idx ON public.payment_transactions (sale_id);
CREATE INDEX IF NOT EXISTS payment_transactions_booking_idx ON public.payment_transactions (booking_id);
CREATE INDEX IF NOT EXISTS payment_transactions_created_idx ON public.payment_transactions (created_at DESC);
CREATE INDEX IF NOT EXISTS payment_transactions_store_idx ON public.payment_transactions (store_id, created_at DESC);

-- ---------- item_activity_logs -----------------------------------------
CREATE TABLE IF NOT EXISTS public.item_activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  product_name text,
  sku text,
  barcode text,
  store_id text,
  terminal_id text,
  activity_type text NOT NULL CHECK (activity_type IN ('sale', 'return', 'receive', 'transfer_in', 'transfer_out', 'adjustment', 'count', 'archive')),
  reference text,
  quantity_delta integer NOT NULL DEFAULT 0,
  stock_before integer,
  stock_after integer,
  unit_cost numeric NOT NULL DEFAULT 0,
  staff_id text,
  staff_name text,
  role text,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.item_activity_logs TO authenticated;
GRANT ALL ON public.item_activity_logs TO service_role;

ALTER TABLE public.item_activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS item_activity_logs_read ON public.item_activity_logs;
CREATE POLICY item_activity_logs_read ON public.item_activity_logs
  FOR SELECT TO authenticated USING (store_id IS NULL OR public.store_visible(store_id));

DROP POLICY IF EXISTS item_activity_logs_insert ON public.item_activity_logs;
CREATE POLICY item_activity_logs_insert ON public.item_activity_logs
  FOR INSERT TO authenticated WITH CHECK (store_id IS NULL OR public.store_visible(store_id));

CREATE INDEX IF NOT EXISTS item_activity_logs_product_idx ON public.item_activity_logs (product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS item_activity_logs_created_idx ON public.item_activity_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS item_activity_logs_store_idx ON public.item_activity_logs (store_id, created_at DESC);

-- ---------- offline_sync_audit_log --------------------------------------
CREATE TABLE IF NOT EXISTS public.offline_sync_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  terminal_id text,
  store_id text,
  direction text NOT NULL CHECK (direction IN ('push', 'pull')),
  table_name text NOT NULL,
  record_id text,
  records integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'failed', 'partial', 'skipped')),
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.offline_sync_audit_log TO authenticated;
GRANT ALL ON public.offline_sync_audit_log TO service_role;

ALTER TABLE public.offline_sync_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS offline_sync_audit_read ON public.offline_sync_audit_log;
CREATE POLICY offline_sync_audit_read ON public.offline_sync_audit_log
  FOR SELECT TO authenticated USING (store_id IS NULL OR public.store_visible(store_id));

DROP POLICY IF EXISTS offline_sync_audit_insert ON public.offline_sync_audit_log;
CREATE POLICY offline_sync_audit_insert ON public.offline_sync_audit_log
  FOR INSERT TO authenticated WITH CHECK (store_id IS NULL OR public.store_visible(store_id));

CREATE INDEX IF NOT EXISTS offline_sync_audit_created_idx ON public.offline_sync_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS offline_sync_audit_terminal_idx ON public.offline_sync_audit_log (terminal_id, created_at DESC);

-- ---------- updated_at triggers ------------------------------------------
DROP TRIGGER IF EXISTS product_barcodes_touch ON public.product_barcodes;
CREATE TRIGGER product_barcodes_touch BEFORE UPDATE ON public.product_barcodes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS payment_transactions_touch ON public.payment_transactions;
CREATE TRIGGER payment_transactions_touch BEFORE UPDATE ON public.payment_transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- backfill product_barcodes from existing product data ---------
INSERT INTO public.product_barcodes (product_id, barcode, is_primary)
SELECT p.id, p.barcode, true
FROM public.products p
WHERE coalesce(p.barcode, '') <> ''
ON CONFLICT (barcode) DO NOTHING;

INSERT INTO public.product_barcodes (product_id, barcode, is_primary)
SELECT p.id, a.code, false
FROM public.products p
CROSS JOIN LATERAL unnest(coalesce(p.barcode_aliases, ARRAY[]::text[])) AS a(code)
WHERE coalesce(a.code, '') <> ''
ON CONFLICT (barcode) DO NOTHING;

-- ---------- performance indexes on existing hot columns ------------------
CREATE INDEX IF NOT EXISTS products_barcode_idx ON public.products (barcode);
CREATE INDEX IF NOT EXISTS products_sku_idx ON public.products (sku);
CREATE INDEX IF NOT EXISTS products_name_idx ON public.products (lower(name));
CREATE INDEX IF NOT EXISTS members_phone_idx ON public.members (phone);
CREATE INDEX IF NOT EXISTS members_code_idx ON public.members (member_code);
CREATE INDEX IF NOT EXISTS sales_bill_number_idx ON public.sales (bill_number);
CREATE INDEX IF NOT EXISTS sales_created_idx ON public.sales (created_at DESC);
CREATE INDEX IF NOT EXISTS sales_store_created_idx ON public.sales (store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS sale_items_sale_idx ON public.sale_items (sale_id);
CREATE INDEX IF NOT EXISTS bookings_ref_idx ON public.bookings (ref);
CREATE INDEX IF NOT EXISTS bookings_status_idx ON public.bookings (job_status, created_at DESC);
CREATE INDEX IF NOT EXISTS bookings_phone_idx ON public.bookings (customer_phone);
CREATE INDEX IF NOT EXISTS activity_events_created_idx ON public.activity_events (created_at DESC);
CREATE INDEX IF NOT EXISTS stock_adjustments_product_idx ON public.stock_adjustments (product_id, created_at DESC);