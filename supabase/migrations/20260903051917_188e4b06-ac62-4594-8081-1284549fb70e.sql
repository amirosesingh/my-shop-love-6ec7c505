CREATE TABLE IF NOT EXISTS public.terminal_recovery_secrets (
  terminal_token_id uuid PRIMARY KEY,
  sealed_secret text NOT NULL,
  fingerprint text NOT NULL,
  platform text NOT NULL DEFAULT 'unknown',
  device_name text,
  utc_offset_minutes integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.terminal_recovery_secrets TO service_role;
ALTER TABLE public.terminal_recovery_secrets ENABLE ROW LEVEL SECURITY;