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
NOTIFY pgrst, 'reload schema';