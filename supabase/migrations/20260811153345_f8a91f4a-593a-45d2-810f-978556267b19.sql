ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS client_transaction_id text;

CREATE UNIQUE INDEX IF NOT EXISTS sales_client_transaction_id_key
  ON public.sales (client_transaction_id)
  WHERE client_transaction_id IS NOT NULL;

DO $$
DECLARE dupes bigint;
BEGIN
  SELECT count(*) INTO dupes FROM (
    SELECT coalesce(store_id, ''), bill_number
    FROM public.sales
    GROUP BY 1, 2
    HAVING count(*) > 1
  ) d;
  IF dupes > 0 THEN
    RAISE NOTICE 'Skipping unique bill number index: % duplicate bill numbers already exist', dupes;
  ELSE
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS sales_store_bill_number_key ON public.sales (coalesce(store_id, ''''), bill_number)';
  END IF;
END $$;