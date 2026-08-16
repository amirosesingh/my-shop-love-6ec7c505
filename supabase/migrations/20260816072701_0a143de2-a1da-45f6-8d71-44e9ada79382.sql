ALTER TABLE public.payment_transactions ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE public.payment_transactions ADD COLUMN IF NOT EXISTS metadata jsonb;
UPDATE public.payment_transactions SET status = 'completed' WHERE status IS NULL;
UPDATE public.payment_transactions SET metadata = '{}'::jsonb WHERE metadata IS NULL;
ALTER TABLE public.payment_transactions ALTER COLUMN status SET DEFAULT 'completed';
ALTER TABLE public.payment_transactions ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;

ALTER TABLE public.coupon_campaigns ADD COLUMN IF NOT EXISTS claims_count integer;
UPDATE public.coupon_campaigns SET claims_count = 0 WHERE claims_count IS NULL;
ALTER TABLE public.coupon_campaigns ALTER COLUMN claims_count SET DEFAULT 0;
ALTER TABLE public.coupon_campaigns ALTER COLUMN claims_count SET NOT NULL;