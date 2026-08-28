ALTER TABLE public.stock_count_drafts ADD COLUMN IF NOT EXISTS reference text;
ALTER TABLE public.stock_count_drafts ADD COLUMN IF NOT EXISTS store_code text;

WITH numbered AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn
  FROM public.stock_count_drafts
  WHERE reference IS NULL
)
UPDATE public.stock_count_drafts d
SET reference = 'SO-LEGACY-' || lpad(n.rn::text, 4, '0')
FROM numbered n
WHERE d.id = n.id;

CREATE UNIQUE INDEX IF NOT EXISTS stock_count_drafts_reference_uidx
  ON public.stock_count_drafts (reference) WHERE reference IS NOT NULL;

CREATE INDEX IF NOT EXISTS stock_count_drafts_store_status_idx
  ON public.stock_count_drafts (store_id, status, created_at DESC);