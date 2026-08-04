CREATE TABLE public.shift_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  shift_id text,
  store_id text NOT NULL,
  terminal_id text,
  terminal_name text,
  staff_id text,
  staff_name text NOT NULL,
  role text,
  signed_in_at timestamp with time zone NOT NULL DEFAULT now(),
  signed_out_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.shift_sessions TO authenticated;
GRANT ALL ON public.shift_sessions TO service_role;

ALTER TABLE public.shift_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read shift sessions" ON public.shift_sessions
  FOR SELECT TO authenticated USING (is_staff(auth.uid()));
CREATE POLICY "Staff can append shift sessions" ON public.shift_sessions
  FOR INSERT TO authenticated WITH CHECK (is_staff(auth.uid()));
CREATE POLICY "Staff can update shift sessions" ON public.shift_sessions
  FOR UPDATE TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));

CREATE INDEX shift_sessions_shift_idx ON public.shift_sessions (shift_id);
CREATE INDEX shift_sessions_store_idx ON public.shift_sessions (store_id, signed_in_at DESC);

CREATE TRIGGER shift_sessions_set_updated_at
  BEFORE UPDATE ON public.shift_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();