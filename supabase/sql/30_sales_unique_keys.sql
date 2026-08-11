-- 30_sales_unique_keys.sql
-- Collision-free receipts.
--
--   * every bill number appears once
--   * every checkout attempt (client_transaction_id) appears once, so a retry
--     or a double click updates instead of billing twice
--
-- Safe to run more than once.

ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS client_transaction_id text;

-- Rename historical duplicates so the unique index can be created.
WITH dupes AS (
  SELECT id, bill_number,
         row_number() OVER (PARTITION BY bill_number ORDER BY created_at, id) AS rn
  FROM public.sales
)
UPDATE public.sales s
SET bill_number = s.bill_number || '-D' || d.rn
FROM dupes d
WHERE d.id = s.id AND d.rn > 1;

DO $$ BEGIN
  ALTER TABLE public.sales ADD CONSTRAINT sales_bill_number_key UNIQUE (bill_number);
EXCEPTION WHEN others THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS sales_client_transaction_id_uidx
  ON public.sales (client_transaction_id)
  WHERE client_transaction_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
