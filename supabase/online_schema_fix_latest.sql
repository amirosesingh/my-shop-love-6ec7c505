-- ============================================================================
-- Northwind POS — online_schema_fix_latest.sql
-- Paste into the SQL editor of the database this POS points at and press Run.
-- Idempotent: running it twice changes nothing.
-- ============================================================================

-- Migration: complete POS schema and RPC fix (2026-08-16)
-- Apply with: npx supabase db push

-- ---------------------------------------------------------------------------
-- Complete POS schema & RPC repair
--
-- Idempotent. Brings the trading tables up to the exact shapes the till writes
-- and installs the relationship check the health screens call. Nothing is
-- dropped and no data is altered.
-- ---------------------------------------------------------------------------

/* 1. Split-tender ledger ---------------------------------------------------*/
CREATE TABLE IF NOT EXISTS public.payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type text NOT NULL DEFAULT 'sale',
  sale_id uuid,
  booking_id uuid,
  order_id uuid,
  member_id uuid,
  store_id text,
  shift_id text,
  terminal_id text,
  amount numeric NOT NULL DEFAULT 0,
  method text NOT NULL DEFAULT 'cash',
  payment_method text,
  kind text NOT NULL DEFAULT 'payment',
  status text NOT NULL DEFAULT 'completed',
  reference text,
  transaction_reference text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  cashier_id text,
  cashier_name text,
  note text NOT NULL DEFAULT '',
  paid_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  row_version integer NOT NULL DEFAULT 1
);

ALTER TABLE public.payment_transactions ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'sale';
ALTER TABLE public.payment_transactions ADD COLUMN IF NOT EXISTS sale_id uuid;
ALTER TABLE public.payment_transactions ADD COLUMN IF NOT EXISTS booking_id uuid;
ALTER TABLE public.payment_transactions ADD COLUMN IF NOT EXISTS order_id uuid;
ALTER TABLE public.payment_transactions ADD COLUMN IF NOT EXISTS member_id uuid;
ALTER TABLE public.payment_transactions ADD COLUMN IF NOT EXISTS store_id text;
ALTER TABLE public.payment_transactions ADD COLUMN IF NOT EXISTS shift_id text;
ALTER TABLE public.payment_transactions ADD COLUMN IF NOT EXISTS terminal_id text;
ALTER TABLE public.payment_transactions ADD COLUMN IF NOT EXISTS amount numeric NOT NULL DEFAULT 0;
ALTER TABLE public.payment_transactions ADD COLUMN IF NOT EXISTS method text NOT NULL DEFAULT 'cash';
ALTER TABLE public.payment_transactions ADD COLUMN IF NOT EXISTS payment_method text;
ALTER TABLE public.payment_transactions ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'payment';
ALTER TABLE public.payment_transactions ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'completed';
ALTER TABLE public.payment_transactions ADD COLUMN IF NOT EXISTS reference text;
ALTER TABLE public.payment_transactions ADD COLUMN IF NOT EXISTS transaction_reference text;
ALTER TABLE public.payment_transactions ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.payment_transactions ADD COLUMN IF NOT EXISTS cashier_id text;
ALTER TABLE public.payment_transactions ADD COLUMN IF NOT EXISTS cashier_name text;
ALTER TABLE public.payment_transactions ADD COLUMN IF NOT EXISTS note text NOT NULL DEFAULT '';
ALTER TABLE public.payment_transactions ADD COLUMN IF NOT EXISTS paid_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.payment_transactions ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.payment_transactions ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.payment_transactions ADD COLUMN IF NOT EXISTS row_version integer NOT NULL DEFAULT 1;

/* 2. Item movement per sold line ------------------------------------------*/
CREATE TABLE IF NOT EXISTS public.item_activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid,
  item_id uuid,
  sale_id uuid,
  transfer_id uuid,
  product_name text,
  sku text,
  barcode text,
  store_id text,
  terminal_id text,
  activity_type text NOT NULL,
  reference text,
  quantity_delta integer NOT NULL DEFAULT 0,
  quantity integer,
  stock_before integer,
  stock_after integer,
  unit_cost numeric NOT NULL DEFAULT 0,
  staff_id text,
  staff_name text,
  created_by text,
  role text,
  note text NOT NULL DEFAULT '',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  row_version integer NOT NULL DEFAULT 1
);

ALTER TABLE public.item_activity_logs ADD COLUMN IF NOT EXISTS product_id uuid;
ALTER TABLE public.item_activity_logs ADD COLUMN IF NOT EXISTS item_id uuid;
ALTER TABLE public.item_activity_logs ADD COLUMN IF NOT EXISTS sale_id uuid;
ALTER TABLE public.item_activity_logs ADD COLUMN IF NOT EXISTS transfer_id uuid;
ALTER TABLE public.item_activity_logs ADD COLUMN IF NOT EXISTS product_name text;
ALTER TABLE public.item_activity_logs ADD COLUMN IF NOT EXISTS sku text;
ALTER TABLE public.item_activity_logs ADD COLUMN IF NOT EXISTS barcode text;
ALTER TABLE public.item_activity_logs ADD COLUMN IF NOT EXISTS store_id text;
ALTER TABLE public.item_activity_logs ADD COLUMN IF NOT EXISTS terminal_id text;
ALTER TABLE public.item_activity_logs ADD COLUMN IF NOT EXISTS activity_type text;
ALTER TABLE public.item_activity_logs ADD COLUMN IF NOT EXISTS reference text;
ALTER TABLE public.item_activity_logs ADD COLUMN IF NOT EXISTS quantity_delta integer NOT NULL DEFAULT 0;
ALTER TABLE public.item_activity_logs ADD COLUMN IF NOT EXISTS quantity integer;
ALTER TABLE public.item_activity_logs ADD COLUMN IF NOT EXISTS stock_before integer;
ALTER TABLE public.item_activity_logs ADD COLUMN IF NOT EXISTS stock_after integer;
ALTER TABLE public.item_activity_logs ADD COLUMN IF NOT EXISTS unit_cost numeric NOT NULL DEFAULT 0;
ALTER TABLE public.item_activity_logs ADD COLUMN IF NOT EXISTS staff_id text;
ALTER TABLE public.item_activity_logs ADD COLUMN IF NOT EXISTS staff_name text;
ALTER TABLE public.item_activity_logs ADD COLUMN IF NOT EXISTS created_by text;
ALTER TABLE public.item_activity_logs ADD COLUMN IF NOT EXISTS role text;
ALTER TABLE public.item_activity_logs ADD COLUMN IF NOT EXISTS note text NOT NULL DEFAULT '';
ALTER TABLE public.item_activity_logs ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.item_activity_logs ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.item_activity_logs ADD COLUMN IF NOT EXISTS row_version integer NOT NULL DEFAULT 1;

/* 3. Booking columns the racket / service card writes ----------------------*/
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS charges jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS tag_id text;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS intake_note text;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS string_origin text;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS string_source_product_id uuid;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS grip_product_id uuid;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS technician text;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS liability_accepted boolean NOT NULL DEFAULT false;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS incident_note text;

/* 4. Foreign keys ----------------------------------------------------------*/
DO $$
BEGIN
  IF to_regclass('public.sales') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_transactions_sale_id_fkey') THEN
    ALTER TABLE public.payment_transactions
      ADD CONSTRAINT payment_transactions_sale_id_fkey
      FOREIGN KEY (sale_id) REFERENCES public.sales(id) ON DELETE SET NULL;
  END IF;
  IF to_regclass('public.bookings') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_transactions_booking_id_fkey') THEN
    ALTER TABLE public.payment_transactions
      ADD CONSTRAINT payment_transactions_booking_id_fkey
      FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE SET NULL;
  END IF;
  IF to_regclass('public.members') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_transactions_member_id_fkey') THEN
    ALTER TABLE public.payment_transactions
      ADD CONSTRAINT payment_transactions_member_id_fkey
      FOREIGN KEY (member_id) REFERENCES public.members(id) ON DELETE SET NULL;
  END IF;
  IF to_regclass('public.products') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'item_activity_logs_product_id_fkey') THEN
    ALTER TABLE public.item_activity_logs
      ADD CONSTRAINT item_activity_logs_product_id_fkey
      FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;
  END IF;
  IF to_regclass('public.products') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bookings_string_source_product_id_fkey') THEN
    ALTER TABLE public.bookings
      ADD CONSTRAINT bookings_string_source_product_id_fkey
      FOREIGN KEY (string_source_product_id) REFERENCES public.products(id) ON DELETE SET NULL;
  END IF;
  IF to_regclass('public.products') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bookings_grip_product_id_fkey') THEN
    ALTER TABLE public.bookings
      ADD CONSTRAINT bookings_grip_product_id_fkey
      FOREIGN KEY (grip_product_id) REFERENCES public.products(id) ON DELETE SET NULL;
  END IF;
END $$;

/* 5. Indexes ---------------------------------------------------------------*/
CREATE INDEX IF NOT EXISTS payment_transactions_sale_id_idx ON public.payment_transactions(sale_id);
CREATE INDEX IF NOT EXISTS payment_transactions_booking_id_idx ON public.payment_transactions(booking_id);
CREATE INDEX IF NOT EXISTS payment_transactions_member_id_idx ON public.payment_transactions(member_id);
CREATE INDEX IF NOT EXISTS payment_transactions_store_id_idx ON public.payment_transactions(store_id);
CREATE INDEX IF NOT EXISTS payment_transactions_paid_at_idx ON public.payment_transactions(paid_at DESC);
CREATE INDEX IF NOT EXISTS item_activity_logs_product_id_idx ON public.item_activity_logs(product_id);
CREATE INDEX IF NOT EXISTS item_activity_logs_store_id_idx ON public.item_activity_logs(store_id);
CREATE INDEX IF NOT EXISTS item_activity_logs_created_at_idx ON public.item_activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS bookings_tag_id_idx ON public.bookings(tag_id);

/* 6. updated_at bookkeeping ------------------------------------------------*/
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payment_transactions_touch ON public.payment_transactions;
CREATE TRIGGER payment_transactions_touch
  BEFORE UPDATE ON public.payment_transactions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

/* 7. Grants + row level security ------------------------------------------*/
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_transactions TO authenticated;
GRANT ALL ON public.payment_transactions TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.item_activity_logs TO authenticated;
GRANT ALL ON public.item_activity_logs TO service_role;

ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_activity_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
                 AND tablename = 'payment_transactions' AND policyname = 'payments_staff_read') THEN
    CREATE POLICY payments_staff_read ON public.payment_transactions
      FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
                 AND tablename = 'payment_transactions' AND policyname = 'payments_staff_write') THEN
    CREATE POLICY payments_staff_write ON public.payment_transactions
      FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
                 AND tablename = 'payment_transactions' AND policyname = 'payments_staff_update') THEN
    CREATE POLICY payments_staff_update ON public.payment_transactions
      FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
                 AND tablename = 'item_activity_logs' AND policyname = 'item_activity_staff_read') THEN
    CREATE POLICY item_activity_staff_read ON public.item_activity_logs
      FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
                 AND tablename = 'item_activity_logs' AND policyname = 'item_activity_staff_write') THEN
    CREATE POLICY item_activity_staff_write ON public.item_activity_logs
      FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
                 AND tablename = 'item_activity_logs' AND policyname = 'item_activity_staff_update') THEN
    CREATE POLICY item_activity_staff_update ON public.item_activity_logs
      FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

/* 8. Relationship check ----------------------------------------------------*/
CREATE OR REPLACE FUNCTION public.operational_relational_health()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  op_tables text[] := ARRAY[
    'sales','sale_items','bookings','booking_payments','payment_transactions',
    'products','product_barcodes','product_categories','members','membership_tiers',
    'purchase_orders','purchase_order_items','stock_transfers','stock_transfer_items',
    'promotions','coupon_campaigns','issued_vouchers','stock_adjustments','item_activity_logs',
    'held_orders','shifts','suppliers'
  ];
  t text;
  rec record;
  row_count bigint;
  orphans bigint;
  links jsonb;
  out_tables jsonb := '[]'::jsonb;
BEGIN
  FOREACH t IN ARRAY op_tables LOOP
    CONTINUE WHEN to_regclass('public.' || t) IS NULL;
    EXECUTE format('SELECT count(*) FROM public.%I', t) INTO row_count;
    links := '[]'::jsonb;

    FOR rec IN
      SELECT
        att.attname::text                AS column_name,
        parent.relname::text             AS parent_table,
        patt.attname::text               AS parent_column
      FROM pg_constraint c
      JOIN pg_class child  ON child.oid = c.conrelid
      JOIN pg_class parent ON parent.oid = c.confrelid
      JOIN pg_namespace n  ON n.oid = child.relnamespace
      JOIN unnest(c.conkey)  WITH ORDINALITY AS ck(attnum, ord)  ON true
      JOIN unnest(c.confkey) WITH ORDINALITY AS pk(attnum, ord2) ON pk.ord2 = ck.ord
      JOIN pg_attribute att  ON att.attrelid = child.oid  AND att.attnum = ck.attnum
      JOIN pg_attribute patt ON patt.attrelid = parent.oid AND patt.attnum = pk.attnum
      WHERE c.contype = 'f' AND n.nspname = 'public' AND child.relname = t
    LOOP
      EXECUTE format(
        'SELECT count(*) FROM public.%I ch WHERE ch.%I IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM public.%I pa WHERE pa.%I = ch.%I)',
        t, rec.column_name, rec.parent_table, rec.parent_column, rec.column_name
      ) INTO orphans;

      links := links || jsonb_build_object(
        'column', rec.column_name,
        'parent_table', rec.parent_table,
        'parent_column', rec.parent_column,
        'orphans', orphans
      );
    END LOOP;

    out_tables := out_tables || jsonb_build_object('table', t, 'rows', row_count, 'links', links);
  END LOOP;

  RETURN jsonb_build_object('at', now(), 'tables', out_tables);
END;
$$;

REVOKE ALL ON FUNCTION public.operational_relational_health() FROM public;
GRANT EXECUTE ON FUNCTION public.operational_relational_health() TO authenticated;
GRANT EXECUTE ON FUNCTION public.operational_relational_health() TO service_role;


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

-- ---------------------------------------------------------------------------
-- 20260816170000 — payload defaults for split tenders and coupon campaigns
-- ---------------------------------------------------------------------------
ALTER TABLE public.payment_transactions ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE public.payment_transactions ADD COLUMN IF NOT EXISTS metadata jsonb;
UPDATE public.payment_transactions SET status = 'completed' WHERE status IS NULL;
UPDATE public.payment_transactions SET metadata = '{}'::jsonb WHERE metadata IS NULL;
ALTER TABLE public.payment_transactions ALTER COLUMN status SET DEFAULT 'completed';
ALTER TABLE public.payment_transactions ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;

ALTER TABLE public.coupon_campaigns ADD COLUMN IF NOT EXISTS claims_count integer;
UPDATE public.coupon_campaigns SET claims_count = 0 WHERE claims_count IS NULL;
ALTER TABLE public.coupon_campaigns ALTER COLUMN claims_count SET DEFAULT 0;
ALTER TABLE public.coupon_campaigns ALTER COLUMN claims_count SET NOT NULL;

-- ---------------------------------------------------------------------------
-- 20260816180000 — telemetry, audit, payment types, integrations & member OTP
-- Idempotent. Safe to run repeatedly.
-- ---------------------------------------------------------------------------

/* Branch telemetry ---------------------------------------------------------*/
CREATE TABLE IF NOT EXISTS public.branch_telemetry (
  terminal_id text PRIMARY KEY,
  store_id text,
  terminal_name text,
  staff_name text,
  staff_role text,
  db_mode text NOT NULL DEFAULT 'cloud',
  connection_status text NOT NULL DEFAULT 'online',
  storage_engine text NOT NULL DEFAULT 'cloud',
  pending_count integer NOT NULL DEFAULT 0,
  conflict_count integer NOT NULL DEFAULT 0,
  last_synced_at timestamptz,
  app_version text,
  platform text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.branch_telemetry ADD COLUMN IF NOT EXISTS branch_id text;
ALTER TABLE public.branch_telemetry ADD COLUMN IF NOT EXISTS pending_queue_count integer;
ALTER TABLE public.branch_telemetry ADD COLUMN IF NOT EXISTS last_ping timestamptz;
ALTER TABLE public.branch_telemetry ADD COLUMN IF NOT EXISTS status text;
GRANT SELECT, INSERT, UPDATE ON public.branch_telemetry TO authenticated;
GRANT ALL ON public.branch_telemetry TO service_role;
ALTER TABLE public.branch_telemetry ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='branch_telemetry' AND policyname='branch_telemetry_staff_read') THEN
    CREATE POLICY branch_telemetry_staff_read ON public.branch_telemetry FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='branch_telemetry' AND policyname='branch_telemetry_staff_write') THEN
    CREATE POLICY branch_telemetry_staff_write ON public.branch_telemetry FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='branch_telemetry' AND policyname='branch_telemetry_staff_update') THEN
    CREATE POLICY branch_telemetry_staff_update ON public.branch_telemetry FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

/* Payment types ------------------------------------------------------------*/
CREATE TABLE IF NOT EXISTS public.payment_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type_code text NOT NULL,
  requires_reference boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  icon text NOT NULL DEFAULT 'wallet',
  sort_order integer NOT NULL DEFAULT 0,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  row_version integer NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX IF NOT EXISTS payment_types_code_idx ON public.payment_types (type_code);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_types TO authenticated;
GRANT ALL ON public.payment_types TO service_role;
ALTER TABLE public.payment_types ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='payment_types' AND policyname='payment_types_staff_read') THEN
    CREATE POLICY payment_types_staff_read ON public.payment_types FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='payment_types' AND policyname='payment_types_staff_write') THEN
    CREATE POLICY payment_types_staff_write ON public.payment_types FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

/* Human readable audit log -------------------------------------------------*/
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_name text,
  action_category text NOT NULL DEFAULT 'general',
  action_name text NOT NULL DEFAULT 'change',
  target_module text,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS user_id text;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS action text;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS entity text;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS before_state jsonb;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS after_state jsonb;
CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON public.audit_logs (created_at DESC);
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='audit_logs' AND policyname='audit_logs_staff_read') THEN
    CREATE POLICY audit_logs_staff_read ON public.audit_logs FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='audit_logs' AND policyname='audit_logs_staff_insert') THEN
    CREATE POLICY audit_logs_staff_insert ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
END $$;

/* Communication & verification gateway -------------------------------------*/
CREATE TABLE IF NOT EXISTS public.integration_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_name text NOT NULL,
  api_keys_encrypted jsonb NOT NULL DEFAULT '{}'::jsonb,
  verification_channel text NOT NULL DEFAULT 'whatsapp',
  strict_verification boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  updated_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS integration_settings_provider_idx ON public.integration_settings (provider_name);
GRANT SELECT, INSERT, UPDATE ON public.integration_settings TO authenticated;
GRANT ALL ON public.integration_settings TO service_role;
ALTER TABLE public.integration_settings ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='integration_settings' AND policyname='integration_settings_supervisor') THEN
    CREATE POLICY integration_settings_supervisor ON public.integration_settings FOR ALL TO authenticated
      USING (public.is_app_supervisor()) WITH CHECK (public.is_app_supervisor());
  END IF;
END $$;

/* Member OTP verification --------------------------------------------------*/
CREATE TABLE IF NOT EXISTS public.member_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid,
  phone text,
  email text,
  channel text NOT NULL DEFAULT 'whatsapp',
  otp_code text,
  attempts integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  sent_by text,
  store_id text,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '10 minutes',
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS member_verifications_member_idx ON public.member_verifications (member_id);
CREATE INDEX IF NOT EXISTS member_verifications_created_idx ON public.member_verifications (created_at DESC);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_member_verifications_member') THEN
    DELETE FROM public.member_verifications v
     WHERE v.member_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.members m WHERE m.id = v.member_id);
    ALTER TABLE public.member_verifications
      ADD CONSTRAINT fk_member_verifications_member
      FOREIGN KEY (member_id) REFERENCES public.members(id) ON DELETE CASCADE;
  END IF;
END $$;
GRANT SELECT, INSERT, UPDATE ON public.member_verifications TO authenticated;
GRANT ALL ON public.member_verifications TO service_role;
ALTER TABLE public.member_verifications ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='member_verifications' AND policyname='member_verifications_staff_read') THEN
    -- the one-time code itself is never selected by the client; staff read the log
    CREATE POLICY member_verifications_staff_read ON public.member_verifications FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='member_verifications' AND policyname='member_verifications_staff_write') THEN
    CREATE POLICY member_verifications_staff_write ON public.member_verifications FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='member_verifications' AND policyname='member_verifications_staff_update') THEN
    CREATE POLICY member_verifications_staff_update ON public.member_verifications FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

ALTER TABLE public.members ADD COLUMN IF NOT EXISTS is_verified boolean NOT NULL DEFAULT false;
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS verified_at timestamptz;
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS verified_channel text;

/* Receipt designer + branding ---------------------------------------------*/
ALTER TABLE public.pos_settings ADD COLUMN IF NOT EXISTS logo_data_url text;
ALTER TABLE public.pos_settings ADD COLUMN IF NOT EXISTS receipt_design jsonb NOT NULL DEFAULT '{}'::jsonb;

/* Live schema reader used by the dynamic health scanner --------------------*/
CREATE OR REPLACE FUNCTION public.schema_inventory()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'at', now(),
    'tables', COALESCE((
      SELECT jsonb_agg(t ORDER BY t->>'table')
      FROM (
        SELECT jsonb_build_object(
          'table', c.relname,
          'rls', c.relrowsecurity,
          'policies', (SELECT count(*) FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=c.relname),
          'columns', (
            SELECT jsonb_agg(jsonb_build_object(
              'name', a.attname,
              'type', format_type(a.atttypid, a.atttypmod),
              'notnull', a.attnotnull,
              'has_default', a.atthasdef
            ) ORDER BY a.attnum)
            FROM pg_attribute a
            WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
          ),
          'indexes', (SELECT count(*) FROM pg_index i WHERE i.indrelid = c.oid),
          'foreign_keys', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('name', con.conname, 'definition', pg_get_constraintdef(con.oid)))
            FROM pg_constraint con WHERE con.conrelid = c.oid AND con.contype = 'f'
          ), '[]'::jsonb)
        ) AS t
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'
      ) s
    ), '[]'::jsonb),
    'functions', COALESCE((
      SELECT jsonb_agg(p.proname ORDER BY p.proname)
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
    ), '[]'::jsonb)
  );
$$;
REVOKE ALL ON FUNCTION public.schema_inventory() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.schema_inventory() TO authenticated, service_role;


-- ---------------------------------------------------------------------------
-- Terminal remote commands (Sync Now / Refresh catalog) -- needed by the
-- terminal health scan, which reports the table as missing without it.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.terminal_commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  terminal_id text NOT NULL,
  store_id text,
  command text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  note text,
  result text,
  issued_by text,
  issued_role text,
  picked_up_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS terminal_commands_pending_idx
  ON public.terminal_commands (terminal_id, status, created_at);
GRANT SELECT, INSERT, UPDATE ON public.terminal_commands TO authenticated;
GRANT ALL ON public.terminal_commands TO service_role;
ALTER TABLE public.terminal_commands ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='terminal_commands' AND policyname='terminal_commands_staff_read') THEN
    CREATE POLICY terminal_commands_staff_read ON public.terminal_commands FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='terminal_commands' AND policyname='terminal_commands_staff_write') THEN
    CREATE POLICY terminal_commands_staff_write ON public.terminal_commands FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='terminal_commands' AND policyname='terminal_commands_staff_update') THEN
    CREATE POLICY terminal_commands_staff_update ON public.terminal_commands FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
