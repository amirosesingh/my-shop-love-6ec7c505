ALTER TABLE public.authorization_requests
  ADD COLUMN IF NOT EXISTS requested_amount numeric,
  ADD COLUMN IF NOT EXISTS approved_amount numeric,
  ADD COLUMN IF NOT EXISTS approved_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS bill_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS snapshot_hash text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS held_order_id text,
  ADD COLUMN IF NOT EXISTS notified_at timestamptz;

CREATE INDEX IF NOT EXISTS authorization_requests_requester_idx
  ON public.authorization_requests (requested_by, created_at DESC);

ALTER TABLE public.held_orders
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'held',
  ADD COLUMN IF NOT EXISTS pending_request_id uuid;

CREATE INDEX IF NOT EXISTS held_orders_status_idx ON public.held_orders (status);

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS authorization_request_id uuid,
  ADD COLUMN IF NOT EXISTS authorized_by text,
  ADD COLUMN IF NOT EXISTS authorized_at timestamptz;

ALTER TABLE public.activity_events
  ADD COLUMN IF NOT EXISTS cleared_by text[] NOT NULL DEFAULT '{}'::text[];

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'authorization_requests'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.authorization_requests';
  END IF;
END $$;