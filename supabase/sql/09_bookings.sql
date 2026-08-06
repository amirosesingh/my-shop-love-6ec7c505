-- ============================================================
-- 09_bookings.sql — Bookings, deposits and racket stringing job cards
-- Lucky Charms POS. Safe to run repeatedly: nothing is dropped.
-- Requires: 00_extensions_and_enums.sql, then 02_staff_and_access.sql
-- (row level security policies below call is_staff() / is_app_supervisor()).
-- ============================================================

-- ---------- tables, columns and indexes ----------
CREATE TABLE IF NOT EXISTS public.booking_payments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  booking_id uuid NOT NULL,
  amount numeric DEFAULT 0 NOT NULL,
  method text DEFAULT 'cash'::text NOT NULL,
  cashier text,
  paid_at timestamp with time zone DEFAULT now() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

ALTER TABLE public.booking_payments ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();

ALTER TABLE public.booking_payments ADD COLUMN IF NOT EXISTS booking_id uuid;

ALTER TABLE public.booking_payments ADD COLUMN IF NOT EXISTS amount numeric DEFAULT 0;

ALTER TABLE public.booking_payments ADD COLUMN IF NOT EXISTS method text DEFAULT 'cash'::text;

ALTER TABLE public.booking_payments ADD COLUMN IF NOT EXISTS cashier text;

ALTER TABLE public.booking_payments ADD COLUMN IF NOT EXISTS paid_at timestamp with time zone DEFAULT now();

ALTER TABLE public.booking_payments ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();

DO $$ BEGIN ALTER TABLE public.booking_payments ADD CONSTRAINT booking_payments_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE; EXCEPTION WHEN others THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS booking_payments_pkey ON public.booking_payments USING btree (id);

CREATE TABLE IF NOT EXISTS public.bookings (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ref text NOT NULL,
  store_id text,
  shift_id text,
  customer_name text DEFAULT ''::text NOT NULL,
  customer_phone text DEFAULT ''::text NOT NULL,
  member_id uuid,
  service_type_id text,
  service_name text,
  service_fee numeric DEFAULT 0 NOT NULL,
  payment_timing text,
  lines jsonb DEFAULT '[]'::jsonb NOT NULL,
  subtotal numeric DEFAULT 0 NOT NULL,
  discount numeric DEFAULT 0 NOT NULL,
  tax numeric DEFAULT 0 NOT NULL,
  total numeric DEFAULT 0 NOT NULL,
  paid numeric DEFAULT 0 NOT NULL,
  due_date date,
  note text DEFAULT ''::text NOT NULL,
  cashier text,
  status text DEFAULT 'active'::text NOT NULL,
  sale_receipt_no text,
  closed_at timestamp with time zone,
  racket_model text,
  string_type text,
  tension_main numeric,
  tension_cross numeric,
  tension_unit text DEFAULT 'lb'::text NOT NULL,
  grommet_notes text,
  job_notes text,
  dropped_off_at timestamp with time zone,
  promised_at timestamp with time zone,
  job_status text DEFAULT 'received'::text NOT NULL,
  job_status_by text,
  job_status_at timestamp with time zone,
  notify_whatsapp boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS ref text;

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS store_id text;

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS shift_id text;

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS customer_name text DEFAULT ''::text;

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS customer_phone text DEFAULT ''::text;

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS member_id uuid;

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS service_type_id text;

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS service_name text;

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS service_fee numeric DEFAULT 0;

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS payment_timing text;

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS lines jsonb DEFAULT '[]'::jsonb;

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS subtotal numeric DEFAULT 0;

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS discount numeric DEFAULT 0;

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS tax numeric DEFAULT 0;

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS total numeric DEFAULT 0;

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS paid numeric DEFAULT 0;

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS due_date date;

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS note text DEFAULT ''::text;

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS cashier text;

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS status text DEFAULT 'active'::text;

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS sale_receipt_no text;

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS closed_at timestamp with time zone;

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS racket_model text;

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS string_type text;

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS tension_main numeric;

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS tension_cross numeric;

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS tension_unit text DEFAULT 'lb'::text;

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS grommet_notes text;

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS job_notes text;

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS dropped_off_at timestamp with time zone;

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS promised_at timestamp with time zone;

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS job_status text DEFAULT 'received'::text;

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS job_status_by text;

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS job_status_at timestamp with time zone;

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS notify_whatsapp boolean DEFAULT false;

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();

DO $$ BEGIN ALTER TABLE public.bookings ADD CONSTRAINT bookings_member_id_fkey FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE SET NULL; EXCEPTION WHEN others THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS bookings_ref_key ON public.bookings USING btree (ref);

CREATE UNIQUE INDEX IF NOT EXISTS bookings_pkey ON public.bookings USING btree (id);

-- ---------- triggers ----------
DROP TRIGGER IF EXISTS bookings_set_updated_at ON public.bookings;

CREATE TRIGGER bookings_set_updated_at BEFORE UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------- grants (Data API access) ----------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bookings TO authenticated;
GRANT ALL ON public.bookings TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.booking_payments TO authenticated;
GRANT ALL ON public.booking_payments TO service_role;

-- ---------- row level security ----------
ALTER TABLE public.booking_payments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

-- ---------- policies ----------
DROP POLICY IF EXISTS "Staff can add booking payments" ON public.booking_payments;

CREATE POLICY "Staff can add booking payments" ON public.booking_payments FOR INSERT TO authenticated WITH CHECK ((is_staff(auth.uid()) OR is_app_supervisor()));

DROP POLICY IF EXISTS "Staff can delete booking payments" ON public.booking_payments;

CREATE POLICY "Staff can delete booking payments" ON public.booking_payments FOR DELETE TO authenticated USING (is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff can read booking payments" ON public.booking_payments;

CREATE POLICY "Staff can read booking payments" ON public.booking_payments FOR SELECT TO authenticated USING ((is_staff(auth.uid()) OR is_app_supervisor()));

DROP POLICY IF EXISTS "Staff can update booking payments" ON public.booking_payments;

CREATE POLICY "Staff can update booking payments" ON public.booking_payments FOR UPDATE TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff can create bookings" ON public.bookings;

CREATE POLICY "Staff can create bookings" ON public.bookings FOR INSERT TO authenticated WITH CHECK ((is_staff(auth.uid()) OR is_app_supervisor()));

DROP POLICY IF EXISTS "Staff can delete bookings" ON public.bookings;

CREATE POLICY "Staff can delete bookings" ON public.bookings FOR DELETE TO authenticated USING (is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff can read bookings" ON public.bookings;

CREATE POLICY "Staff can read bookings" ON public.bookings FOR SELECT TO authenticated USING ((is_staff(auth.uid()) OR is_app_supervisor()));

DROP POLICY IF EXISTS "Staff can update bookings" ON public.bookings;

CREATE POLICY "Staff can update bookings" ON public.bookings FOR UPDATE TO authenticated USING ((is_staff(auth.uid()) OR is_app_supervisor())) WITH CHECK ((is_staff(auth.uid()) OR is_app_supervisor()));

-- ---------- verification ----------
SELECT t.name AS table_name,
       CASE WHEN to_regclass('public.' || t.name) IS NULL THEN 'MISSING' ELSE 'OK' END AS status
FROM (VALUES ('bookings'),('booking_payments')) AS t(name);
