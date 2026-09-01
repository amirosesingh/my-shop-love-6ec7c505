-- 1. Immutable status-transition history -------------------------------

CREATE TABLE public.entity_status_history (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type         TEXT NOT NULL,
  entity_id           TEXT NOT NULL,
  status_kind         TEXT NOT NULL DEFAULT 'status',
  previous_status     TEXT,
  new_status          TEXT NOT NULL,
  reason              TEXT,
  actor_id            TEXT,
  actor_name          TEXT,
  actor_role          TEXT,
  store_id            TEXT,
  branch_id           TEXT,
  terminal_id         TEXT,
  related_entity_type TEXT,
  related_entity_id   TEXT,
  metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
  client_event_id     TEXT,
  occurred_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  row_version         BIGINT NOT NULL DEFAULT 1
);

GRANT SELECT, INSERT ON public.entity_status_history TO authenticated;
GRANT ALL ON public.entity_status_history TO service_role;

ALTER TABLE public.entity_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read status history for visible stores"
  ON public.entity_status_history FOR SELECT TO authenticated
  USING (store_id IS NULL OR public.store_visible(store_id));

CREATE POLICY "Staff append status history"
  ON public.entity_status_history FOR INSERT TO authenticated
  WITH CHECK (public.is_staff_now());

-- Retries after a dropped connection must not duplicate a transition.
CREATE UNIQUE INDEX entity_status_history_client_event_uidx
  ON public.entity_status_history (client_event_id)
  WHERE client_event_id IS NOT NULL;

CREATE INDEX entity_status_history_entity_idx
  ON public.entity_status_history (entity_type, entity_id, occurred_at DESC);

CREATE INDEX entity_status_history_store_idx
  ON public.entity_status_history (store_id, created_at DESC);

-- History is written once and never rewritten.
CREATE OR REPLACE FUNCTION public.entity_status_history_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'entity_status_history is append-only';
END;
$$;

CREATE TRIGGER entity_status_history_no_update
  BEFORE UPDATE OR DELETE ON public.entity_status_history
  FOR EACH ROW EXECUTE FUNCTION public.entity_status_history_immutable();

-- 2. Make business events say what actually changed ---------------------

ALTER TABLE public.activity_events
  ADD COLUMN IF NOT EXISTS entity_type    TEXT,
  ADD COLUMN IF NOT EXISTS entity_id      TEXT,
  ADD COLUMN IF NOT EXISTS previous_state TEXT,
  ADD COLUMN IF NOT EXISTS new_state      TEXT;

CREATE INDEX IF NOT EXISTS activity_events_entity_idx
  ON public.activity_events (entity_type, entity_id, created_at DESC);

-- 3. Let a rebuilt terminal recover its own branch's audit trail --------

ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS store_id TEXT;

CREATE INDEX IF NOT EXISTS audit_logs_store_idx
  ON public.audit_logs (store_id, created_at DESC);