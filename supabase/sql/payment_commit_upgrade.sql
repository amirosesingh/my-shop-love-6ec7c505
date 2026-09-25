-- Retail POS payment commit repair for an existing Supabase database.
-- Use this file only for a manual SQL Editor deployment. Supabase CLI users
-- should deploy the matching migration instead.
BEGIN;

ALTER TABLE public.payment_transactions
  ADD COLUMN IF NOT EXISTS client_transaction_id text;

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS authorization_request_id uuid,
  ADD COLUMN IF NOT EXISTS authorized_by text,
  ADD COLUMN IF NOT EXISTS authorized_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS rounding_adjustment numeric(18,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rounding_label text;

UPDATE public.sales
SET rounding_adjustment = 0
WHERE rounding_adjustment IS NULL;

ALTER TABLE public.sales
  ALTER COLUMN rounding_adjustment SET DEFAULT 0,
  ALTER COLUMN rounding_adjustment SET NOT NULL;

DROP INDEX IF EXISTS public.payment_transactions_client_txn_idx;

CREATE UNIQUE INDEX payment_transactions_client_txn_idx
  ON public.payment_transactions (client_transaction_id)
  WHERE client_transaction_id IS NOT NULL;

COMMIT;
