CREATE TABLE IF NOT EXISTS public.bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref text NOT NULL,
  store_id text,
  shift_id text,
  customer_name text NOT NULL DEFAULT '',
  customer_phone text NOT NULL DEFAULT '',
  member_id uuid REFERENCES public.members(id) ON DELETE SET NULL,
  service_type_id text,
  service_name text,
  service_fee numeric NOT NULL DEFAULT 0,
  payment_timing text,
  lines jsonb NOT NULL DEFAULT '[]'::jsonb,
  subtotal numeric NOT NULL DEFAULT 0,
  discount numeric NOT NULL DEFAULT 0,
  tax numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  paid numeric NOT NULL DEFAULT 0,
  due_date date,
  note text NOT NULL DEFAULT '',
  cashier text,
  status text NOT NULL DEFAULT 'active',
  sale_receipt_no text,
  closed_at timestamptz,
  racket_model text,
  string_type text,
  tension_main numeric,
  tension_cross numeric,
  tension_unit text NOT NULL DEFAULT 'lb',
  grommet_notes text,
  job_notes text,
  dropped_off_at timestamptz,
  promised_at timestamptz,
  job_status text NOT NULL DEFAULT 'received',
  job_status_by text,
  job_status_at timestamptz,
  notify_whatsapp boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS bookings_ref_key ON public.bookings (ref);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bookings TO authenticated;
GRANT ALL ON public.bookings TO service_role;

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read bookings" ON public.bookings
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()) OR public.is_app_supervisor());
CREATE POLICY "Staff can create bookings" ON public.bookings
  FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()) OR public.is_app_supervisor());
CREATE POLICY "Staff can update bookings" ON public.bookings
  FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()) OR public.is_app_supervisor())
  WITH CHECK (public.is_staff(auth.uid()) OR public.is_app_supervisor());

CREATE TRIGGER bookings_set_updated_at BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.booking_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  amount numeric NOT NULL DEFAULT 0,
  method text NOT NULL DEFAULT 'cash',
  cashier text,
  paid_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.booking_payments TO authenticated;
GRANT ALL ON public.booking_payments TO service_role;

ALTER TABLE public.booking_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read booking payments" ON public.booking_payments
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()) OR public.is_app_supervisor());
CREATE POLICY "Staff can add booking payments" ON public.booking_payments
  FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()) OR public.is_app_supervisor());

ALTER TABLE public.terminal_tokens
  ADD COLUMN IF NOT EXISTS platform text NOT NULL DEFAULT 'unknown';