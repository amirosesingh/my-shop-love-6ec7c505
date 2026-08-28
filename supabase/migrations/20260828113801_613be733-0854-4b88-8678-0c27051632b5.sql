ALTER TABLE public.stock_count_drafts
  ADD COLUMN IF NOT EXISTS pending_edit_request_id uuid,
  ADD COLUMN IF NOT EXISTS pending_edit_by text,
  ADD COLUMN IF NOT EXISTS pending_edit_at timestamptz;

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS pending_edit_request_id uuid,
  ADD COLUMN IF NOT EXISTS pending_edit_by text,
  ADD COLUMN IF NOT EXISTS pending_edit_at timestamptz;

CREATE TABLE IF NOT EXISTS public.record_edits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_type text NOT NULL,
  record_id text NOT NULL,
  reference text,
  store_id text,
  terminal_id text,
  action_key text NOT NULL,
  request_id uuid,
  edited_by text,
  edited_by_name text,
  authorized_by text,
  authorized_by_name text,
  mode_used text,
  before_value jsonb NOT NULL DEFAULT '{}'::jsonb,
  after_value jsonb NOT NULL DEFAULT '{}'::jsonb,
  stock_deltas jsonb NOT NULL DEFAULT '{}'::jsonb,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.record_edits TO authenticated;
GRANT ALL ON public.record_edits TO service_role;

ALTER TABLE public.record_edits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff read record edits" ON public.record_edits;
CREATE POLICY "Staff read record edits" ON public.record_edits
  FOR SELECT TO authenticated USING (public.is_staff_now());

DROP POLICY IF EXISTS "Staff write record edits" ON public.record_edits;
CREATE POLICY "Staff write record edits" ON public.record_edits
  FOR INSERT TO authenticated WITH CHECK (public.is_staff_now());

CREATE INDEX IF NOT EXISTS record_edits_record_idx
  ON public.record_edits (record_type, record_id, created_at DESC);
CREATE INDEX IF NOT EXISTS record_edits_store_idx
  ON public.record_edits (store_id, created_at DESC);