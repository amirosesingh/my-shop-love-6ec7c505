ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS branch_id text;
ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS branch_id text;
ALTER TABLE public.activity_events ADD COLUMN IF NOT EXISTS branch_id text;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS booking_ref text;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS receipt_prefix text;
CREATE INDEX IF NOT EXISTS idx_sales_branch_id ON public.sales (branch_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_branch_id ON public.sale_items (branch_id);
CREATE INDEX IF NOT EXISTS idx_bookings_booking_ref ON public.bookings (booking_ref);