-- Schema 25 — terminal platform column (PC vs mobile terminals).
--
-- Terminal registration writes `platform` so PC tills and Android terminals can
-- be managed separately. Older databases predate the column and PostgREST
-- rejects the insert with "could not find the platform column of
-- terminal_tokens in the schema cache". Run this once; it is safe to re-run.

ALTER TABLE public.terminal_tokens
  ADD COLUMN IF NOT EXISTS platform text NOT NULL DEFAULT 'pc';

ALTER TABLE public.terminal_tokens
  ADD COLUMN IF NOT EXISTS claimed_by_device text,
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reissued_at timestamptz,
  ADD COLUMN IF NOT EXISTS replaced_by uuid;

UPDATE public.terminal_tokens SET platform = 'pc' WHERE platform IS NULL OR platform = '';

NOTIFY pgrst, 'reload schema';