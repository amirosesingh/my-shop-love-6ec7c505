-- schema14.sql — run once on the POS database.
-- Adds the no-sale cash drawer log plus the split-payment and review-threshold
-- columns introduced after the last schema run. Safe to re-run.

CREATE TABLE IF NOT EXISTS public.drawer_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id text,
  terminal_id text,
  shift_id text,
  staff_id text,
  staff_name text,
  role text,
  reason text NOT NULL,
  note text,
  approved_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.drawer_events TO authenticated;
GRANT ALL ON public.drawer_events TO service_role;

ALTER TABLE public.drawer_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can read drawer events" ON public.drawer_events;
CREATE POLICY "Staff can read drawer events" ON public.drawer_events
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff can append drawer events" ON public.drawer_events;
CREATE POLICY "Staff can append drawer events" ON public.drawer_events
  FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));

CREATE INDEX IF NOT EXISTS drawer_events_created_at_idx
  ON public.drawer_events (created_at DESC);

-- Split-payment breakdown on sales.
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS payments jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Suspicious-activity review thresholds.
ALTER TABLE public.pos_settings
  ADD COLUMN IF NOT EXISTS review_max_voids integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS review_max_refunds integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS review_max_refund_value numeric NOT NULL DEFAULT 200,
  ADD COLUMN IF NOT EXISTS review_max_nosale integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS review_max_discount_pct numeric NOT NULL DEFAULT 15;

NOTIFY pgrst, 'reload schema';
