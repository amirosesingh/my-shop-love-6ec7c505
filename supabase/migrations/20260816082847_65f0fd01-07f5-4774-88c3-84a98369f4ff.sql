CREATE TABLE IF NOT EXISTS public.branch_telemetry (
  terminal_id text PRIMARY KEY,
  store_id text,
  terminal_name text,
  staff_name text,
  staff_role text,
  db_mode text NOT NULL DEFAULT 'online',
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

GRANT SELECT, INSERT, UPDATE ON public.branch_telemetry TO authenticated;
GRANT ALL ON public.branch_telemetry TO service_role;
ALTER TABLE public.branch_telemetry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read telemetry" ON public.branch_telemetry
  FOR SELECT TO authenticated USING (public.is_staff_now());
CREATE POLICY "Staff report telemetry" ON public.branch_telemetry
  FOR INSERT TO authenticated WITH CHECK (public.is_staff_now());
CREATE POLICY "Staff refresh telemetry" ON public.branch_telemetry
  FOR UPDATE TO authenticated USING (public.is_staff_now()) WITH CHECK (public.is_staff_now());

CREATE TRIGGER branch_telemetry_touch BEFORE UPDATE ON public.branch_telemetry
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

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

CREATE POLICY "Staff read commands" ON public.terminal_commands
  FOR SELECT TO authenticated USING (public.is_staff_now());
CREATE POLICY "Supervisors issue commands" ON public.terminal_commands
  FOR INSERT TO authenticated WITH CHECK (public.is_supervisor_now());
CREATE POLICY "Staff complete commands" ON public.terminal_commands
  FOR UPDATE TO authenticated USING (public.is_staff_now()) WITH CHECK (public.is_staff_now());

CREATE TRIGGER terminal_commands_touch BEFORE UPDATE ON public.terminal_commands
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();