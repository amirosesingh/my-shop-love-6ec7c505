CREATE TABLE IF NOT EXISTS public.payment_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type_code text NOT NULL UNIQUE,
  requires_reference boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  icon text NOT NULL DEFAULT 'Wallet',
  sort_order integer NOT NULL DEFAULT 0,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  row_version integer NOT NULL DEFAULT 1
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_types TO authenticated;
GRANT SELECT ON public.payment_types TO anon;
GRANT ALL ON public.payment_types TO service_role;

ALTER TABLE public.payment_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payment_types_read" ON public.payment_types;
CREATE POLICY "payment_types_read" ON public.payment_types
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "payment_types_write" ON public.payment_types;
CREATE POLICY "payment_types_write" ON public.payment_types
  FOR ALL TO authenticated
  USING (public.is_supervisor_now())
  WITH CHECK (public.is_supervisor_now());

DROP TRIGGER IF EXISTS payment_types_touch ON public.payment_types;
CREATE TRIGGER payment_types_touch
  BEFORE UPDATE ON public.payment_types
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS payment_types_version ON public.payment_types;
CREATE TRIGGER payment_types_version
  BEFORE UPDATE ON public.payment_types
  FOR EACH ROW EXECUTE FUNCTION public.bump_row_version();

INSERT INTO public.payment_types (name, type_code, requires_reference, icon, sort_order, is_system)
VALUES
  ('Cash', 'cash', false, 'Banknote', 10, true),
  ('Card', 'card', false, 'CreditCard', 20, true),
  ('Wallet', 'wallet', false, 'Wallet', 30, true),
  ('Points', 'points', false, 'Star', 40, true),
  ('Bank transfer', 'bank_transfer', true, 'Landmark', 50, true),
  ('Government voucher', 'gov_voucher', true, 'Ticket', 60, false)
ON CONFLICT (type_code) DO NOTHING;