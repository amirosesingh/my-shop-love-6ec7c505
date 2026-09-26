-- Idempotent live-parity repair. Existing rows keep their values and receive
-- the same safe defaults already declared in the canonical schema.
ALTER TABLE public.pos_store_settings
  ADD COLUMN IF NOT EXISTS offline_approval_requires_pin boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS online_only_void_cart boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS online_only_void_line boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS online_only_reduce_qty boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS online_only_manual_discount boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS online_only_price_override boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS online_only_stock_adjustment boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS online_only_shift_close boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS online_only_edit_tenders boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS online_only_terminal_reset boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS online_only_refund boolean NOT NULL DEFAULT false;
