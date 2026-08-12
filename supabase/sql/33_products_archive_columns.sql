-- 33: products archive flags (cloud + on-premise parity)
-- Product writes always carry is_archived/archived_at; without these columns
-- the API rejects every product upsert with a 400.

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS archived_at timestamptz;
CREATE INDEX IF NOT EXISTS products_is_archived_idx ON public.products (is_archived);