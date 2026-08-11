ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS client_transaction_id text;

-- Make any historical duplicates unique before the index goes on.
WITH dupes AS (
  SELECT id, bill_number,
         row_number() OVER (PARTITION BY bill_number ORDER BY created_at, id) AS rn
  FROM public.sales
)
UPDATE public.sales s
SET bill_number = s.bill_number || '-D' || d.rn
FROM dupes d
WHERE d.id = s.id AND d.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS sales_client_transaction_id_uidx
  ON public.sales (client_transaction_id)
  WHERE client_transaction_id IS NOT NULL;