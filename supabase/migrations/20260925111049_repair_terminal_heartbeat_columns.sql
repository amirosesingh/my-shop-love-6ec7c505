-- The four-argument heartbeat routine records the running application version
-- and the latest successful sync. Older projects can already have the routine
-- without these two additive columns, causing every heartbeat to fail.
ALTER TABLE public.terminal_tokens
  ADD COLUMN IF NOT EXISTS app_version text,
  ADD COLUMN IF NOT EXISTS last_sync_at timestamp with time zone;
