ALTER TABLE public.terminal_tokens
  ADD COLUMN IF NOT EXISTS app_version text,
  ADD COLUMN IF NOT EXISTS last_sync_at timestamp with time zone;

CREATE OR REPLACE FUNCTION public.terminal_token_heartbeat(
  p_token_id uuid,
  p_activate boolean DEFAULT false,
  p_version text DEFAULT NULL,
  p_synced boolean DEFAULT false
) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  UPDATE public.terminal_tokens
  SET last_seen_at = now(),
      app_version = coalesce(nullif(btrim(p_version), ''), app_version),
      last_sync_at = CASE WHEN p_synced THEN now() ELSE last_sync_at END,
      activated_at = CASE WHEN p_activate THEN coalesce(activated_at, now()) ELSE activated_at END
  WHERE id = p_token_id AND status IN ('active', 'used')
$$;

GRANT EXECUTE ON FUNCTION public.terminal_token_heartbeat(uuid, boolean, text, boolean) TO anon, authenticated, service_role;
