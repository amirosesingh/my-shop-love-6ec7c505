-- ---------------------------------------------------------------------------
-- 99_reset_local_sqlite.sql        (DESKTOP TILL — local SQLite file)
--
-- DESTRUCTIVE. Empties this till's own copy of every trading record so it can
-- start fresh. There is no undo. Close the till app first and copy the
-- database file somewhere safe before running.
--
-- Run this AFTER the central database has been cleared, otherwise the till
-- pulls the old rows straight back down.
--
-- KEPT: staff profiles, roles and PINs, all settings, this store and its
--       registered terminals, payment methods.
-- ---------------------------------------------------------------------------

BEGIN;

DELETE FROM sale_items;
DELETE FROM payment_transactions;
DELETE FROM booking_payments;
DELETE FROM bookings;
DELETE FROM sales;
DELETE FROM held_orders;
DELETE FROM drawer_events;
DELETE FROM shifts;
DELETE FROM shift_sessions;

DELETE FROM stock_delta_applied;
DELETE FROM stock_adjustments;
DELETE FROM stock_count_drafts;
DELETE FROM stock_transfer_items;
DELETE FROM stock_transfers;
DELETE FROM purchase_order_items;
DELETE FROM purchase_orders;

DELETE FROM coupon_events;
DELETE FROM issued_vouchers;
DELETE FROM coupon_campaigns;
DELETE FROM member_verifications;
DELETE FROM members;
DELETE FROM membership_tiers;
DELETE FROM promotions;

DELETE FROM product_barcodes;
DELETE FROM products;
DELETE FROM product_categories;
DELETE FROM uom_units;
DELETE FROM suppliers;

DELETE FROM item_activity_logs;
DELETE FROM sku_audit;
DELETE FROM record_edits;
DELETE FROM authorization_actions;
DELETE FROM authorization_log;
DELETE FROM authorization_requests;
DELETE FROM activity_events;
DELETE FROM audit_logs;
DELETE FROM system_audit_logs;
DELETE FROM offline_sync_audit_log;
DELETE FROM security_findings;
DELETE FROM whatsapp_queue;
DELETE FROM branch_telemetry;
DELETE FROM terminal_commands;

-- Nothing queued from the old data, and no stale "last synced" marker.
DELETE FROM offline_sync_queue;
DELETE FROM outbox;
DELETE FROM mirror;
DELETE FROM sync_audit;
DELETE FROM sync_metadata;

COMMIT;

VACUUM;
