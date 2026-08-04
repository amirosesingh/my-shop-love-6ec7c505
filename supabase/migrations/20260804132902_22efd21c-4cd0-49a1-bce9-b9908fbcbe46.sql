CREATE TABLE IF NOT EXISTS public.shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id text NOT NULL,
  terminal_id text,
  terminal_name text,
  opened_by_name text NOT NULL DEFAULT 'Cashier',
  opened_by_staff_id text,
  opened_by_role text,
  closed_by_name text,
  closed_by_staff_id text,
  closed_by_role text,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  opening_float numeric NOT NULL DEFAULT 0,
  counted_cash numeric,
  expected_cash numeric,
  note text NOT NULL DEFAULT '',
  overdue boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.shifts TO authenticated;
GRANT ALL ON public.shifts TO service_role;

ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can read shifts" ON public.shifts;
CREATE POLICY "Staff can read shifts" ON public.shifts
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff can open shifts" ON public.shifts;
CREATE POLICY "Staff can open shifts" ON public.shifts
  FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff can update shifts" ON public.shifts;
CREATE POLICY "Staff can update shifts" ON public.shifts
  FOR UPDATE TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

DROP TRIGGER IF EXISTS shifts_set_updated_at ON public.shifts;
CREATE TRIGGER shifts_set_updated_at BEFORE UPDATE ON public.shifts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS shifts_open_by_store ON public.shifts (store_id) WHERE closed_at IS NULL;

ALTER TABLE public.pos_settings
  ADD COLUMN IF NOT EXISTS day_start_time text NOT NULL DEFAULT '09:00',
  ADD COLUMN IF NOT EXISTS day_end_time text NOT NULL DEFAULT '22:00',
  ADD COLUMN IF NOT EXISTS max_shift_hours numeric NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS shift_reminder_minutes integer NOT NULL DEFAULT 30;