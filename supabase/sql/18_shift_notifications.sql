-- ============================================================
-- 18_shift_notifications.sql — day-end shift summaries pushed to phones
-- Lucky Charms POS. Safe to run repeatedly: nothing is dropped.
-- Requires: 02_staff_and_access.sql (is_staff()).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.shift_notifications (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  shift_id text NOT NULL,
  store_id text NOT NULL,
  store_name text,
  terminal_id text,
  terminal_name text,
  closed_by text,
  opened_at timestamp with time zone,
  closed_at timestamp with time zone DEFAULT now() NOT NULL,
  total_sales numeric DEFAULT 0 NOT NULL,
  transactions integer DEFAULT 0 NOT NULL,
  discounts numeric DEFAULT 0 NOT NULL,
  refunds numeric DEFAULT 0 NOT NULL,
  expected_cash numeric DEFAULT 0 NOT NULL,
  counted_cash numeric DEFAULT 0 NOT NULL,
  payment_breakdown jsonb DEFAULT '{}'::jsonb NOT NULL,
  summary text DEFAULT '' NOT NULL,
  channels jsonb DEFAULT '[]'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

ALTER TABLE public.shift_notifications ADD COLUMN IF NOT EXISTS store_name text;
ALTER TABLE public.shift_notifications ADD COLUMN IF NOT EXISTS terminal_name text;
ALTER TABLE public.shift_notifications ADD COLUMN IF NOT EXISTS channels jsonb DEFAULT '[]'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS shift_notifications_shift_idx
  ON public.shift_notifications USING btree (shift_id);

CREATE INDEX IF NOT EXISTS shift_notifications_store_idx
  ON public.shift_notifications USING btree (store_id, closed_at DESC);

-- ---------- access ----------
GRANT SELECT, INSERT ON public.shift_notifications TO authenticated;
GRANT ALL ON public.shift_notifications TO service_role;

ALTER TABLE public.shift_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can read shift notifications" ON public.shift_notifications;
CREATE POLICY "Staff can read shift notifications" ON public.shift_notifications
  FOR SELECT TO authenticated USING (is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff can raise shift notifications" ON public.shift_notifications;
CREATE POLICY "Staff can raise shift notifications" ON public.shift_notifications
  FOR INSERT TO authenticated WITH CHECK (is_staff(auth.uid()));

-- ---------- verification ----------
SELECT 'shift_notifications' AS table_name,
       (SELECT count(*) FROM pg_policies
         WHERE schemaname = 'public' AND tablename = 'shift_notifications') AS policies;
