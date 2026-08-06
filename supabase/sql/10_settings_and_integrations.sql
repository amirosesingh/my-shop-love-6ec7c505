-- ============================================================
-- 10_settings_and_integrations.sql — POS settings, encrypted secrets and the WhatsApp outbox
-- Lucky Charms POS. Safe to run repeatedly: nothing is dropped.
-- Requires: 00_extensions_and_enums.sql, then 02_staff_and_access.sql
-- (row level security policies below call is_staff() / is_app_supervisor()).
-- ============================================================

-- ---------- tables, columns and indexes ----------
CREATE TABLE IF NOT EXISTS public.pos_settings (
  id integer DEFAULT 1 NOT NULL,
  tax_percentage numeric DEFAULT 0 NOT NULL,
  enable_tax boolean DEFAULT true NOT NULL,
  tax_mode text DEFAULT 'exclusive'::text NOT NULL,
  paper_size text DEFAULT '80mm'::text NOT NULL,
  header_text text,
  footer_text text,
  show_logo boolean DEFAULT true NOT NULL,
  show_points boolean DEFAULT true NOT NULL,
  show_barcode boolean DEFAULT true NOT NULL,
  show_tax_details boolean DEFAULT true NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  company_name text DEFAULT 'NORTHWIND & CO.'::text NOT NULL,
  tax_number text,
  reg_number text,
  phone text,
  website text,
  fonts jsonb DEFAULT '{}'::jsonb NOT NULL,
  custom_lines jsonb DEFAULT '[]'::jsonb NOT NULL,
  qr jsonb DEFAULT '{}'::jsonb NOT NULL,
  review_max_voids integer DEFAULT 5 NOT NULL,
  review_max_refunds integer DEFAULT 3 NOT NULL,
  review_max_refund_value numeric DEFAULT 200 NOT NULL,
  review_max_nosale integer DEFAULT 5 NOT NULL,
  review_max_discount_pct numeric DEFAULT 15 NOT NULL,
  day_start_time text DEFAULT '09:00'::text NOT NULL,
  day_end_time text DEFAULT '22:00'::text NOT NULL,
  max_shift_hours numeric DEFAULT 12 NOT NULL,
  shift_reminder_minutes integer DEFAULT 30 NOT NULL,
  ui_visibility jsonb DEFAULT '{"hidden": {}}'::jsonb NOT NULL,
  integration_settings jsonb DEFAULT '{}'::jsonb NOT NULL,
  region_country text DEFAULT ''::text NOT NULL,
  time_zone text DEFAULT ''::text NOT NULL,
  date_format text DEFAULT 'dd/MM/yyyy'::text NOT NULL,
  time_format text DEFAULT '24h'::text NOT NULL,
  booking_slip jsonb DEFAULT '{}'::jsonb NOT NULL,
  PRIMARY KEY (id)
);

ALTER TABLE public.pos_settings ADD COLUMN IF NOT EXISTS id integer DEFAULT 1;

ALTER TABLE public.pos_settings ADD COLUMN IF NOT EXISTS tax_percentage numeric DEFAULT 0;

ALTER TABLE public.pos_settings ADD COLUMN IF NOT EXISTS enable_tax boolean DEFAULT true;

ALTER TABLE public.pos_settings ADD COLUMN IF NOT EXISTS tax_mode text DEFAULT 'exclusive'::text;

ALTER TABLE public.pos_settings ADD COLUMN IF NOT EXISTS paper_size text DEFAULT '80mm'::text;

ALTER TABLE public.pos_settings ADD COLUMN IF NOT EXISTS header_text text;

ALTER TABLE public.pos_settings ADD COLUMN IF NOT EXISTS footer_text text;

ALTER TABLE public.pos_settings ADD COLUMN IF NOT EXISTS show_logo boolean DEFAULT true;

ALTER TABLE public.pos_settings ADD COLUMN IF NOT EXISTS show_points boolean DEFAULT true;

ALTER TABLE public.pos_settings ADD COLUMN IF NOT EXISTS show_barcode boolean DEFAULT true;

ALTER TABLE public.pos_settings ADD COLUMN IF NOT EXISTS show_tax_details boolean DEFAULT true;

ALTER TABLE public.pos_settings ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();

ALTER TABLE public.pos_settings ADD COLUMN IF NOT EXISTS company_name text DEFAULT 'NORTHWIND & CO.'::text;

ALTER TABLE public.pos_settings ADD COLUMN IF NOT EXISTS tax_number text;

ALTER TABLE public.pos_settings ADD COLUMN IF NOT EXISTS reg_number text;

ALTER TABLE public.pos_settings ADD COLUMN IF NOT EXISTS phone text;

ALTER TABLE public.pos_settings ADD COLUMN IF NOT EXISTS website text;

ALTER TABLE public.pos_settings ADD COLUMN IF NOT EXISTS fonts jsonb DEFAULT '{}'::jsonb;

ALTER TABLE public.pos_settings ADD COLUMN IF NOT EXISTS custom_lines jsonb DEFAULT '[]'::jsonb;

ALTER TABLE public.pos_settings ADD COLUMN IF NOT EXISTS qr jsonb DEFAULT '{}'::jsonb;

ALTER TABLE public.pos_settings ADD COLUMN IF NOT EXISTS review_max_voids integer DEFAULT 5;

ALTER TABLE public.pos_settings ADD COLUMN IF NOT EXISTS review_max_refunds integer DEFAULT 3;

ALTER TABLE public.pos_settings ADD COLUMN IF NOT EXISTS review_max_refund_value numeric DEFAULT 200;

ALTER TABLE public.pos_settings ADD COLUMN IF NOT EXISTS review_max_nosale integer DEFAULT 5;

ALTER TABLE public.pos_settings ADD COLUMN IF NOT EXISTS review_max_discount_pct numeric DEFAULT 15;

ALTER TABLE public.pos_settings ADD COLUMN IF NOT EXISTS day_start_time text DEFAULT '09:00'::text;

ALTER TABLE public.pos_settings ADD COLUMN IF NOT EXISTS day_end_time text DEFAULT '22:00'::text;

ALTER TABLE public.pos_settings ADD COLUMN IF NOT EXISTS max_shift_hours numeric DEFAULT 12;

ALTER TABLE public.pos_settings ADD COLUMN IF NOT EXISTS shift_reminder_minutes integer DEFAULT 30;

ALTER TABLE public.pos_settings ADD COLUMN IF NOT EXISTS ui_visibility jsonb DEFAULT '{"hidden": {}}'::jsonb;

ALTER TABLE public.pos_settings ADD COLUMN IF NOT EXISTS integration_settings jsonb DEFAULT '{}'::jsonb;

ALTER TABLE public.pos_settings ADD COLUMN IF NOT EXISTS region_country text DEFAULT ''::text;

ALTER TABLE public.pos_settings ADD COLUMN IF NOT EXISTS time_zone text DEFAULT ''::text;

ALTER TABLE public.pos_settings ADD COLUMN IF NOT EXISTS date_format text DEFAULT 'dd/MM/yyyy'::text;

ALTER TABLE public.pos_settings ADD COLUMN IF NOT EXISTS time_format text DEFAULT '24h'::text;

ALTER TABLE public.pos_settings ADD COLUMN IF NOT EXISTS booking_slip jsonb DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS pos_settings_pkey ON public.pos_settings USING btree (id);

CREATE TABLE IF NOT EXISTS public.secure_settings (
  key text NOT NULL,
  ciphertext text NOT NULL,
  hint text,
  updated_by text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (key)
);

ALTER TABLE public.secure_settings ADD COLUMN IF NOT EXISTS key text;

ALTER TABLE public.secure_settings ADD COLUMN IF NOT EXISTS ciphertext text;

ALTER TABLE public.secure_settings ADD COLUMN IF NOT EXISTS hint text;

ALTER TABLE public.secure_settings ADD COLUMN IF NOT EXISTS updated_by text;

ALTER TABLE public.secure_settings ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();

ALTER TABLE public.secure_settings ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS secure_settings_pkey ON public.secure_settings USING btree (key);

CREATE TABLE IF NOT EXISTS public.whatsapp_queue (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  phone_number_id text DEFAULT ''::text NOT NULL,
  recipient text NOT NULL,
  body text DEFAULT ''::text NOT NULL,
  reference text,
  store_id text,
  status text DEFAULT 'QUEUED'::text NOT NULL,
  error text,
  queued_at timestamp with time zone DEFAULT now() NOT NULL,
  sent_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

ALTER TABLE public.whatsapp_queue ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();

ALTER TABLE public.whatsapp_queue ADD COLUMN IF NOT EXISTS phone_number_id text DEFAULT ''::text;

ALTER TABLE public.whatsapp_queue ADD COLUMN IF NOT EXISTS recipient text;

ALTER TABLE public.whatsapp_queue ADD COLUMN IF NOT EXISTS body text DEFAULT ''::text;

ALTER TABLE public.whatsapp_queue ADD COLUMN IF NOT EXISTS reference text;

ALTER TABLE public.whatsapp_queue ADD COLUMN IF NOT EXISTS store_id text;

ALTER TABLE public.whatsapp_queue ADD COLUMN IF NOT EXISTS status text DEFAULT 'QUEUED'::text;

ALTER TABLE public.whatsapp_queue ADD COLUMN IF NOT EXISTS error text;

ALTER TABLE public.whatsapp_queue ADD COLUMN IF NOT EXISTS queued_at timestamp with time zone DEFAULT now();

ALTER TABLE public.whatsapp_queue ADD COLUMN IF NOT EXISTS sent_at timestamp with time zone;

ALTER TABLE public.whatsapp_queue ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();

ALTER TABLE public.whatsapp_queue ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_queue_pkey ON public.whatsapp_queue USING btree (id);

-- ---------- triggers ----------
DROP TRIGGER IF EXISTS update_secure_settings_updated_at ON public.secure_settings;

CREATE TRIGGER update_secure_settings_updated_at BEFORE UPDATE ON public.secure_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS whatsapp_queue_touch_updated_at ON public.whatsapp_queue;

CREATE TRIGGER whatsapp_queue_touch_updated_at BEFORE UPDATE ON public.whatsapp_queue FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ---------- grants (Data API access) ----------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pos_settings TO authenticated;
GRANT ALL ON public.pos_settings TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.secure_settings TO authenticated;
GRANT ALL ON public.secure_settings TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_queue TO authenticated;
GRANT ALL ON public.whatsapp_queue TO service_role;

-- ---------- row level security ----------
ALTER TABLE public.pos_settings ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.secure_settings ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.whatsapp_queue ENABLE ROW LEVEL SECURITY;

-- ---------- policies ----------
DROP POLICY IF EXISTS "Staff can delete" ON public.pos_settings;

CREATE POLICY "Staff can delete" ON public.pos_settings FOR DELETE TO authenticated USING (is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff can insert" ON public.pos_settings;

CREATE POLICY "Staff can insert" ON public.pos_settings FOR INSERT TO authenticated WITH CHECK (is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff can read pos settings" ON public.pos_settings;

CREATE POLICY "Staff can read pos settings" ON public.pos_settings FOR SELECT TO authenticated USING (is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff can update" ON public.pos_settings;

CREATE POLICY "Staff can update" ON public.pos_settings FOR UPDATE TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));

DROP POLICY IF EXISTS "Service role manages secure settings" ON public.secure_settings;

CREATE POLICY "Service role manages secure settings" ON public.secure_settings FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Staff manage whatsapp queue" ON public.whatsapp_queue;

CREATE POLICY "Staff manage whatsapp queue" ON public.whatsapp_queue FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- ---------- verification ----------
SELECT t.name AS table_name,
       CASE WHEN to_regclass('public.' || t.name) IS NULL THEN 'MISSING' ELSE 'OK' END AS status
FROM (VALUES ('pos_settings'),('secure_settings'),('whatsapp_queue')) AS t(name);
