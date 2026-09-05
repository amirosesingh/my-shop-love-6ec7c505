-- ---------------------------------------------------------------------------
-- 99_reset_local_data.sql          (BRANCH DATABASE — Microsoft SQL Server)
--
-- DESTRUCTIVE. Empties this branch's copy of every trading record so the till
-- can start fresh. There is no undo. Take a backup first.
--
-- Run this AFTER the central database has been cleared, otherwise the till
-- pulls the old rows straight back down.
--
-- KEPT: staff profiles, roles and PINs, all settings, this store and its
--       registered terminals, payment methods.
-- ---------------------------------------------------------------------------

SET NOCOUNT ON;
BEGIN TRANSACTION;

DELETE FROM dbo.sale_items;
DELETE FROM dbo.payment_transactions;
DELETE FROM dbo.booking_payments;
DELETE FROM dbo.bookings;
DELETE FROM dbo.sales;
DELETE FROM dbo.held_orders;
DELETE FROM dbo.drawer_events;
DELETE FROM dbo.shifts;
DELETE FROM dbo.shift_sessions;

DELETE FROM dbo.stock_delta_applied;
DELETE FROM dbo.stock_adjustments;
DELETE FROM dbo.stock_transfer_items;
DELETE FROM dbo.stock_transfers;
DELETE FROM dbo.purchase_order_items;
DELETE FROM dbo.purchase_orders;

DELETE FROM dbo.coupon_events;
DELETE FROM dbo.issued_vouchers;
DELETE FROM dbo.coupon_campaigns;
DELETE FROM dbo.member_verifications;
DELETE FROM dbo.members;
DELETE FROM dbo.membership_tiers;
DELETE FROM dbo.promotions;

DELETE FROM dbo.product_barcodes;
DELETE FROM dbo.products;
DELETE FROM dbo.product_categories;
DELETE FROM dbo.uom_units;
DELETE FROM dbo.suppliers;

DELETE FROM dbo.item_activity_logs;
DELETE FROM dbo.sku_audit;
DELETE FROM dbo.activity_events;
DELETE FROM dbo.audit_logs;
DELETE FROM dbo.system_audit_logs;
DELETE FROM dbo.offline_sync_audit_log;
DELETE FROM dbo.security_findings;
DELETE FROM dbo.whatsapp_queue;
DELETE FROM dbo.branch_telemetry;
DELETE FROM dbo.terminal_commands;

-- Nothing queued from the old data, and no stale "last synced" marker.
DELETE FROM dbo.offline_sync_queue;
DELETE FROM dbo.sync_metadata;

-- Legacy branch mirror tables, when this database still has them.
IF OBJECT_ID('dbo.BranchSaleItems', 'U') IS NOT NULL DELETE FROM dbo.BranchSaleItems;
IF OBJECT_ID('dbo.BranchSales', 'U') IS NOT NULL DELETE FROM dbo.BranchSales;
IF OBJECT_ID('dbo.shift_notifications', 'U') IS NOT NULL DELETE FROM dbo.shift_notifications;
IF OBJECT_ID('dbo.transfers', 'U') IS NOT NULL DELETE FROM dbo.transfers;
IF OBJECT_ID('dbo.sync_state', 'U') IS NOT NULL DELETE FROM dbo.sync_state;

COMMIT TRANSACTION;
