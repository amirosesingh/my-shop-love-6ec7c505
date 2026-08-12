CREATE TABLE IF NOT EXISTS public.activity_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type text NOT NULL,
  severity text NOT NULL DEFAULT 'info',
  title text NOT NULL,
  message text NOT NULL DEFAULT '',
  actor_id text,
  actor_name text,
  actor_role text,
  terminal_id text,
  terminal_name text,
  store_id text,
  entity_type text,
  entity_id text,
  amount numeric,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  whatsapp_status text NOT NULL DEFAULT 'skipped',
  whatsapp_error text,
  client_event_id text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS activity_events_client_event_id_key
  ON public.activity_events (client_event_id) WHERE client_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS activity_events_created_idx ON public.activity_events (created_at DESC);
CREATE INDEX IF NOT EXISTS activity_events_type_idx ON public.activity_events (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS activity_events_store_idx ON public.activity_events (store_id, created_at DESC);

GRANT SELECT ON public.activity_events TO authenticated;
GRANT ALL ON public.activity_events TO service_role;

ALTER TABLE public.activity_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Supervisors read activity events" ON public.activity_events;
CREATE POLICY "Supervisors read activity events"
  ON public.activity_events FOR SELECT TO authenticated
  USING (public.is_app_supervisor());

CREATE OR REPLACE FUNCTION public.activity_events_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'activity_events rows cannot be % ', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS activity_events_no_update ON public.activity_events;
CREATE TRIGGER activity_events_no_update
  BEFORE UPDATE OR DELETE ON public.activity_events
  FOR EACH ROW EXECUTE FUNCTION public.activity_events_immutable();

ALTER TABLE public.pos_settings
  ADD COLUMN IF NOT EXISTS notification_settings jsonb NOT NULL DEFAULT '{}'::jsonb;