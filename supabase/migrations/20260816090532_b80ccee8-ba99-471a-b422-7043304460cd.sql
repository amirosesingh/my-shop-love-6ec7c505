ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS counted_card numeric;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS counted_digital numeric;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS expected_card numeric;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS expected_digital numeric;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS variance_cash numeric;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS variance_card numeric;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS variance_digital numeric;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS variance_total numeric;