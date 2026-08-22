-- ---------------------------------------------------------------------------
-- 0105_compare_indexes.sql        (LOCAL SHOP DATABASE — SQLite)
--
-- Feature: Stage 4 — Server vs. shop data comparison.
--
-- No column is added. The comparison filters and orders each synced table by
-- its newest change stamp; these indexes keep that fast. Every statement is
-- IF NOT EXISTS, and a table that does not exist on this till simply errors on
-- that one line — skip it and continue.
--
-- Optional but recommended. Not applied automatically.
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS stores_stamp_idx                ON stores (updated_at DESC);
CREATE INDEX IF NOT EXISTS membership_tiers_stamp_idx      ON membership_tiers (updated_at DESC);
CREATE INDEX IF NOT EXISTS products_stamp_idx              ON products (updated_at DESC);
CREATE INDEX IF NOT EXISTS product_barcodes_stamp_idx      ON product_barcodes (updated_at DESC);
CREATE INDEX IF NOT EXISTS product_categories_stamp_idx    ON product_categories (updated_at DESC);
CREATE INDEX IF NOT EXISTS uom_units_stamp_idx             ON uom_units (updated_at DESC);
CREATE INDEX IF NOT EXISTS members_stamp_idx               ON members (updated_at DESC);
CREATE INDEX IF NOT EXISTS promotions_stamp_idx            ON promotions (updated_at DESC);
CREATE INDEX IF NOT EXISTS pos_settings_stamp_idx          ON pos_settings (updated_at DESC);
CREATE INDEX IF NOT EXISTS suppliers_stamp_idx             ON suppliers (updated_at DESC);
CREATE INDEX IF NOT EXISTS shifts_stamp_idx                ON shifts (updated_at DESC);
CREATE INDEX IF NOT EXISTS sales_stamp_idx                 ON sales (updated_at DESC);
CREATE INDEX IF NOT EXISTS sale_items_stamp_idx            ON sale_items (updated_at DESC);
CREATE INDEX IF NOT EXISTS payment_transactions_stamp_idx  ON payment_transactions (updated_at DESC);
CREATE INDEX IF NOT EXISTS item_activity_logs_stamp_idx    ON item_activity_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS purchase_orders_stamp_idx       ON purchase_orders (updated_at DESC);
CREATE INDEX IF NOT EXISTS purchase_order_items_stamp_idx  ON purchase_order_items (updated_at DESC);
CREATE INDEX IF NOT EXISTS bookings_stamp_idx              ON bookings (updated_at DESC);
CREATE INDEX IF NOT EXISTS booking_payments_stamp_idx      ON booking_payments (updated_at DESC);
CREATE INDEX IF NOT EXISTS stock_transfers_stamp_idx       ON stock_transfers (updated_at DESC);
CREATE INDEX IF NOT EXISTS stock_transfer_items_stamp_idx  ON stock_transfer_items (updated_at DESC);
CREATE INDEX IF NOT EXISTS stock_adjustments_stamp_idx     ON stock_adjustments (created_at DESC);
CREATE INDEX IF NOT EXISTS held_orders_stamp_idx           ON held_orders (updated_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_stamp_idx            ON audit_logs (created_at DESC);

-- ---------------------------------- DOWN ----------------------------------
-- DROP INDEX IF EXISTS <name>;  for each index above.
-- ---------------------------------------------------------------------------
