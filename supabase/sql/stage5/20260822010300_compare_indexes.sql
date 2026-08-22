-- ---------------------------------------------------------------------------
-- 20260822010300_compare_indexes.sql  (CENTRAL SERVER — PostgreSQL)
--
-- Feature: Stage 4 — Server vs. shop data comparison.
-- Status:  OPTIONAL, performance only. No column or table is changed.
--
-- The server half of the comparison runs a branch-scoped exact count and a
-- max(updated_at) per table, then pages ids ordered by that stamp. These
-- indexes keep that cheap as the sales history grows.
--
-- Idempotent. Not applied automatically.
-- ---------------------------------------------------------------------------

create index if not exists sales_store_updated_idx
  on public.sales (store_id, updated_at desc);
create index if not exists sale_items_updated_idx
  on public.sale_items (updated_at desc);
create index if not exists payment_transactions_updated_idx
  on public.payment_transactions (updated_at desc);
create index if not exists shifts_store_updated_idx
  on public.shifts (store_id, updated_at desc);
create index if not exists bookings_store_updated_idx
  on public.bookings (store_id, updated_at desc);
create index if not exists booking_payments_updated_idx
  on public.booking_payments (updated_at desc);
create index if not exists stock_adjustments_created_idx
  on public.stock_adjustments (created_at desc);
create index if not exists stock_transfers_updated_idx
  on public.stock_transfers (updated_at desc);
create index if not exists stock_transfer_items_updated_idx
  on public.stock_transfer_items (updated_at desc);
create index if not exists purchase_orders_updated_idx
  on public.purchase_orders (updated_at desc);
create index if not exists purchase_order_items_updated_idx
  on public.purchase_order_items (updated_at desc);
create index if not exists held_orders_updated_idx
  on public.held_orders (updated_at desc);
create index if not exists products_updated_idx
  on public.products (updated_at desc);
create index if not exists members_updated_idx
  on public.members (updated_at desc);

-- ---------------------------------- DOWN ----------------------------------
-- drop index if exists public.<name>;   for each index above.
-- ---------------------------------------------------------------------------
