ALTER TABLE public.payment_transactions ADD COLUMN IF NOT EXISTS client_transaction_id text;

CREATE INDEX IF NOT EXISTS payment_transactions_client_txn_idx
  ON public.payment_transactions (client_transaction_id)
  WHERE client_transaction_id IS NOT NULL;