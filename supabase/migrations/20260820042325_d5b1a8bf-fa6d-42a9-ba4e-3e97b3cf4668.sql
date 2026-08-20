ALTER TABLE public.branch_telemetry
  ADD COLUMN IF NOT EXISTS device_name text,
  ADD COLUMN IF NOT EXISTS device_type text,
  ADD COLUMN IF NOT EXISTS location_name text,
  ADD COLUMN IF NOT EXISTS session_status text,
  ADD COLUMN IF NOT EXISTS last_heartbeat_at timestamptz;

ALTER TABLE public.pos_settings
  ADD COLUMN IF NOT EXISTS receipt_css text NOT NULL DEFAULT '';