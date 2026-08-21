ALTER TABLE public.branch_telemetry
  ADD COLUMN IF NOT EXISTS branch_id text,
  ADD COLUMN IF NOT EXISTS pending_queue_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_ping timestamptz,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS device_name text,
  ADD COLUMN IF NOT EXISTS device_type text,
  ADD COLUMN IF NOT EXISTS location_name text,
  ADD COLUMN IF NOT EXISTS session_status text,
  ADD COLUMN IF NOT EXISTS last_heartbeat_at timestamptz;

GRANT SELECT, INSERT, UPDATE ON public.branch_telemetry TO authenticated;
GRANT ALL ON public.branch_telemetry TO service_role;

NOTIFY pgrst, 'reload schema';