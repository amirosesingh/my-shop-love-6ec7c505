-- ---------------------------------------------------------------------------
-- 99_reset_data.sql            (CENTRAL DATABASE — Postgres / Supabase)
--
-- DESTRUCTIVE. Empties every trading record so the shop can start fresh.
-- There is no undo. Take a backup first.
--
-- CLEARED : sales, sale lines, payments, refunds, held orders, drawer events,
--           shifts and all shift paperwork, bookings and booking payments,
--           products, categories, barcodes, units, suppliers, promotions,
--           purchase orders, transfers, stock adjustments and counts,
--           members, tiers, verifications, coupons and vouchers,
--           every log and history table, telemetry, queued messages,
--           sync watermarks.
--
-- KEPT    : login accounts (auth schema is never touched), staff profiles,
--           roles and PINs, all settings, branches, groups, registered
--           terminals, payment methods.
-- ---------------------------------------------------------------------------

BEGIN;

DELETE FROM public.sale_items;
DELETE FROM public.payment_transactions;
DELETE FROM public.booking_payments;
DELETE FROM public.bookings;
DELETE FROM public.sales;
DELETE FROM public.held_orders;
DELETE FROM public.drawer_events;

DELETE FROM public.shift_variance_alerts;
DELETE FROM public.shift_reconciliations;
DELETE FROM public.shift_close_events;
DELETE FROM public.shift_cash_counts;
DELETE FROM public.shifts;
DELETE FROM public.shift_sessions;

DELETE FROM public.stock_delta_applied;
DELETE FROM public.stock_adjustments;
DELETE FROM public.stock_count_drafts;
DELETE FROM public.stock_transfer_items;
DELETE FROM public.stock_transfers;
DELETE FROM public.purchase_order_items;
DELETE FROM public.purchase_orders;

DELETE FROM public.coupon_events;
DELETE FROM public.issued_vouchers;
DELETE FROM public.coupon_campaigns;
DELETE FROM public.member_verifications;
DELETE FROM public.members;
DELETE FROM public.membership_tiers;
DELETE FROM public.promotions;

DELETE FROM public.product_barcodes;
DELETE FROM public.products;
DELETE FROM public.product_categories;
DELETE FROM public.uom_units;
DELETE FROM public.suppliers;

DELETE FROM public.item_activity_logs;
DELETE FROM public.sku_audit;
DELETE FROM public.record_edits;
DELETE FROM public.entity_status_history;
DELETE FROM public.authorization_actions;
DELETE FROM public.authorization_log;
DELETE FROM public.authorization_requests;
DELETE FROM public.activity_events;
DELETE FROM public.audit_logs;
DELETE FROM public.system_audit_logs;
DELETE FROM public.offline_sync_audit_log;
DELETE FROM public.security_findings;
DELETE FROM public.whatsapp_queue;
DELETE FROM public.branch_telemetry;
DELETE FROM public.terminal_commands;

-- Sync watermarks: a cleared database must not look "already up to date".
DELETE FROM public.sync_metadata;

COMMIT;

-- Nothing left behind?
SELECT 'sales' AS table_name, count(*) FROM public.sales
UNION ALL SELECT 'products', count(*) FROM public.products
UNION ALL SELECT 'members', count(*) FROM public.members
UNION ALL SELECT 'shifts', count(*) FROM public.shifts;
