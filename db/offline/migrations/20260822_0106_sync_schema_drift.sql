-- ============================================================================
-- 0106 — Sync schema drift repair (additive, idempotent)
-- Columns the central database gained after tills shipped. Without them the
-- local write layer silently drops the data (idempotency keys, racket job
-- cards, X/Z report counts) and pushes of payment rows fail centrally.
-- Safe to re-run: every statement is guarded by COL_LENGTH.
-- Applied automatically on next launch via "Check & apply updates"; can also
-- be pasted into SQL Server Management Studio manually.
-- ============================================================================
   cards, X/Z report counts) and pushes of payment rows fail centrally.
   Safe to re-run: every statement is guarded by COL_LENGTH.
   ========================================================================= */
IF OBJECT_ID('dbo.sales', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.sales', 'client_transaction_id') IS NULL ALTER TABLE dbo.sales ADD [client_transaction_id] NVARCHAR(120) NULL;
  IF COL_LENGTH('dbo.sales', 'cashier_id') IS NULL ALTER TABLE dbo.sales ADD [cashier_id] NVARCHAR(60) NULL;
  IF COL_LENGTH('dbo.sales', 'payments') IS NULL ALTER TABLE dbo.sales ADD [payments] NVARCHAR(MAX) NULL;
  IF COL_LENGTH('dbo.sales', 'coupon_code') IS NULL ALTER TABLE dbo.sales ADD [coupon_code] NVARCHAR(60) NULL;
  IF COL_LENGTH('dbo.sales', 'coupon_discount') IS NULL ALTER TABLE dbo.sales ADD [coupon_discount] DECIMAL(18, 4) NULL;
  IF COL_LENGTH('dbo.sales', 'coupon_promo_id') IS NULL ALTER TABLE dbo.sales ADD [coupon_promo_id] NVARCHAR(60) NULL;
  IF COL_LENGTH('dbo.sales', 'coupon_scope') IS NULL ALTER TABLE dbo.sales ADD [coupon_scope] NVARCHAR(40) NULL;
  IF COL_LENGTH('dbo.sales', 'store_name_snapshot') IS NULL ALTER TABLE dbo.sales ADD [store_name_snapshot] NVARCHAR(200) NULL;
  IF COL_LENGTH('dbo.sales', 'store_address_snapshot') IS NULL ALTER TABLE dbo.sales ADD [store_address_snapshot] NVARCHAR(400) NULL;
  IF COL_LENGTH('dbo.sales', 'created_by') IS NULL ALTER TABLE dbo.sales ADD [created_by] NVARCHAR(120) NULL;
  IF COL_LENGTH('dbo.sales', 'updated_by') IS NULL ALTER TABLE dbo.sales ADD [updated_by] NVARCHAR(120) NULL;
END
GO
IF OBJECT_ID('dbo.sale_items', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.sale_items', 'coupon_code') IS NULL ALTER TABLE dbo.sale_items ADD [coupon_code] NVARCHAR(60) NULL;
  IF COL_LENGTH('dbo.sale_items', 'coupon_discount') IS NULL ALTER TABLE dbo.sale_items ADD [coupon_discount] DECIMAL(18, 4) NULL;
  IF COL_LENGTH('dbo.sale_items', 'unit_cost') IS NULL ALTER TABLE dbo.sale_items ADD [unit_cost] DECIMAL(18, 4) NULL;
END
GO
IF OBJECT_ID('dbo.payment_transactions', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.payment_transactions', 'client_transaction_id') IS NULL ALTER TABLE dbo.payment_transactions ADD [client_transaction_id] NVARCHAR(120) NULL;
  IF COL_LENGTH('dbo.payment_transactions', 'status') IS NULL ALTER TABLE dbo.payment_transactions ADD [status] NVARCHAR(30) NULL;
  IF COL_LENGTH('dbo.payment_transactions', 'metadata') IS NULL ALTER TABLE dbo.payment_transactions ADD [metadata] NVARCHAR(MAX) NULL;
  IF COL_LENGTH('dbo.payment_transactions', 'cashier_id') IS NULL ALTER TABLE dbo.payment_transactions ADD [cashier_id] NVARCHAR(60) NULL;
END
GO
IF OBJECT_ID('dbo.bookings', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.bookings', 'ref') IS NULL ALTER TABLE dbo.bookings ADD [ref] NVARCHAR(40) NULL;
  IF COL_LENGTH('dbo.bookings', 'cashier') IS NULL ALTER TABLE dbo.bookings ADD [cashier] NVARCHAR(120) NULL;
  IF COL_LENGTH('dbo.bookings', 'service_type_id') IS NULL ALTER TABLE dbo.bookings ADD [service_type_id] NVARCHAR(60) NULL;
  IF COL_LENGTH('dbo.bookings', 'service_name') IS NULL ALTER TABLE dbo.bookings ADD [service_name] NVARCHAR(160) NULL;
  IF COL_LENGTH('dbo.bookings', 'service_fee') IS NULL ALTER TABLE dbo.bookings ADD [service_fee] DECIMAL(18, 4) NULL;
  IF COL_LENGTH('dbo.bookings', 'payment_timing') IS NULL ALTER TABLE dbo.bookings ADD [payment_timing] NVARCHAR(30) NULL;
  IF COL_LENGTH('dbo.bookings', 'sale_receipt_no') IS NULL ALTER TABLE dbo.bookings ADD [sale_receipt_no] NVARCHAR(60) NULL;
  IF COL_LENGTH('dbo.bookings', 'closed_at') IS NULL ALTER TABLE dbo.bookings ADD [closed_at] DATETIME2(3) NULL;
  IF COL_LENGTH('dbo.bookings', 'racket_model') IS NULL ALTER TABLE dbo.bookings ADD [racket_model] NVARCHAR(160) NULL;
  IF COL_LENGTH('dbo.bookings', 'string_type') IS NULL ALTER TABLE dbo.bookings ADD [string_type] NVARCHAR(160) NULL;
  IF COL_LENGTH('dbo.bookings', 'tension_main') IS NULL ALTER TABLE dbo.bookings ADD [tension_main] DECIMAL(9, 2) NULL;
  IF COL_LENGTH('dbo.bookings', 'tension_cross') IS NULL ALTER TABLE dbo.bookings ADD [tension_cross] DECIMAL(9, 2) NULL;
  IF COL_LENGTH('dbo.bookings', 'tension_unit') IS NULL ALTER TABLE dbo.bookings ADD [tension_unit] NVARCHAR(10) NULL;
  IF COL_LENGTH('dbo.bookings', 'grommet_notes') IS NULL ALTER TABLE dbo.bookings ADD [grommet_notes] NVARCHAR(MAX) NULL;
  IF COL_LENGTH('dbo.bookings', 'job_notes') IS NULL ALTER TABLE dbo.bookings ADD [job_notes] NVARCHAR(MAX) NULL;
  IF COL_LENGTH('dbo.bookings', 'dropped_off_at') IS NULL ALTER TABLE dbo.bookings ADD [dropped_off_at] DATETIME2(3) NULL;
  IF COL_LENGTH('dbo.bookings', 'promised_at') IS NULL ALTER TABLE dbo.bookings ADD [promised_at] DATETIME2(3) NULL;
  IF COL_LENGTH('dbo.bookings', 'job_status') IS NULL ALTER TABLE dbo.bookings ADD [job_status] NVARCHAR(40) NULL;
  IF COL_LENGTH('dbo.bookings', 'job_status_by') IS NULL ALTER TABLE dbo.bookings ADD [job_status_by] NVARCHAR(120) NULL;
  IF COL_LENGTH('dbo.bookings', 'job_status_at') IS NULL ALTER TABLE dbo.bookings ADD [job_status_at] DATETIME2(3) NULL;
  IF COL_LENGTH('dbo.bookings', 'notify_whatsapp') IS NULL ALTER TABLE dbo.bookings ADD [notify_whatsapp] BIT NULL;
  IF COL_LENGTH('dbo.bookings', 'tag_id') IS NULL ALTER TABLE dbo.bookings ADD [tag_id] NVARCHAR(60) NULL;
  IF COL_LENGTH('dbo.bookings', 'intake_note') IS NULL ALTER TABLE dbo.bookings ADD [intake_note] NVARCHAR(MAX) NULL;
  IF COL_LENGTH('dbo.bookings', 'string_origin') IS NULL ALTER TABLE dbo.bookings ADD [string_origin] NVARCHAR(40) NULL;
  IF COL_LENGTH('dbo.bookings', 'string_source_product_id') IS NULL ALTER TABLE dbo.bookings ADD [string_source_product_id] NVARCHAR(60) NULL;
  IF COL_LENGTH('dbo.bookings', 'grip_product_id') IS NULL ALTER TABLE dbo.bookings ADD [grip_product_id] NVARCHAR(60) NULL;
  IF COL_LENGTH('dbo.bookings', 'charges') IS NULL ALTER TABLE dbo.bookings ADD [charges] NVARCHAR(MAX) NULL;
  IF COL_LENGTH('dbo.bookings', 'technician') IS NULL ALTER TABLE dbo.bookings ADD [technician] NVARCHAR(120) NULL;
  IF COL_LENGTH('dbo.bookings', 'liability_accepted') IS NULL ALTER TABLE dbo.bookings ADD [liability_accepted] BIT NULL;
  IF COL_LENGTH('dbo.bookings', 'incident_note') IS NULL ALTER TABLE dbo.bookings ADD [incident_note] NVARCHAR(MAX) NULL;
END
GO
IF OBJECT_ID('dbo.shifts', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.shifts', 'status') IS NULL ALTER TABLE dbo.shifts ADD [status] NVARCHAR(20) NULL;
  IF COL_LENGTH('dbo.shifts', 'terminal_id') IS NULL ALTER TABLE dbo.shifts ADD [terminal_id] NVARCHAR(60) NULL;
  IF COL_LENGTH('dbo.shifts', 'terminal_name') IS NULL ALTER TABLE dbo.shifts ADD [terminal_name] NVARCHAR(120) NULL;
  IF COL_LENGTH('dbo.shifts', 'user_id') IS NULL ALTER TABLE dbo.shifts ADD [user_id] NVARCHAR(60) NULL;
  IF COL_LENGTH('dbo.shifts', 'opened_by_name') IS NULL ALTER TABLE dbo.shifts ADD [opened_by_name] NVARCHAR(120) NULL;
  IF COL_LENGTH('dbo.shifts', 'opened_by_staff_id') IS NULL ALTER TABLE dbo.shifts ADD [opened_by_staff_id] NVARCHAR(60) NULL;
  IF COL_LENGTH('dbo.shifts', 'opened_by_role') IS NULL ALTER TABLE dbo.shifts ADD [opened_by_role] NVARCHAR(40) NULL;
  IF COL_LENGTH('dbo.shifts', 'closed_by_name') IS NULL ALTER TABLE dbo.shifts ADD [closed_by_name] NVARCHAR(120) NULL;
  IF COL_LENGTH('dbo.shifts', 'closed_by_staff_id') IS NULL ALTER TABLE dbo.shifts ADD [closed_by_staff_id] NVARCHAR(60) NULL;
  IF COL_LENGTH('dbo.shifts', 'closed_by_role') IS NULL ALTER TABLE dbo.shifts ADD [closed_by_role] NVARCHAR(40) NULL;
  IF COL_LENGTH('dbo.shifts', 'closing_float') IS NULL ALTER TABLE dbo.shifts ADD [closing_float] DECIMAL(18, 4) NULL;
  IF COL_LENGTH('dbo.shifts', 'expected_cash') IS NULL ALTER TABLE dbo.shifts ADD [expected_cash] DECIMAL(18, 4) NULL;
  IF COL_LENGTH('dbo.shifts', 'expected_card') IS NULL ALTER TABLE dbo.shifts ADD [expected_card] DECIMAL(18, 4) NULL;
  IF COL_LENGTH('dbo.shifts', 'counted_card') IS NULL ALTER TABLE dbo.shifts ADD [counted_card] DECIMAL(18, 4) NULL;
  IF COL_LENGTH('dbo.shifts', 'expected_digital') IS NULL ALTER TABLE dbo.shifts ADD [expected_digital] DECIMAL(18, 4) NULL;
  IF COL_LENGTH('dbo.shifts', 'counted_digital') IS NULL ALTER TABLE dbo.shifts ADD [counted_digital] DECIMAL(18, 4) NULL;
  IF COL_LENGTH('dbo.shifts', 'variance_cash') IS NULL ALTER TABLE dbo.shifts ADD [variance_cash] DECIMAL(18, 4) NULL;
  IF COL_LENGTH('dbo.shifts', 'variance_card') IS NULL ALTER TABLE dbo.shifts ADD [variance_card] DECIMAL(18, 4) NULL;
  IF COL_LENGTH('dbo.shifts', 'variance_digital') IS NULL ALTER TABLE dbo.shifts ADD [variance_digital] DECIMAL(18, 4) NULL;
  IF COL_LENGTH('dbo.shifts', 'variance_total') IS NULL ALTER TABLE dbo.shifts ADD [variance_total] DECIMAL(18, 4) NULL;
  IF COL_LENGTH('dbo.shifts', 'overdue') IS NULL ALTER TABLE dbo.shifts ADD [overdue] BIT NULL;
END
GO
IF OBJECT_ID('dbo.products', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.products', 'stock_quantity') IS NULL ALTER TABLE dbo.products ADD [stock_quantity] INT NULL;
  IF COL_LENGTH('dbo.products', 'is_archived') IS NULL ALTER TABLE dbo.products ADD [is_archived] BIT NULL;
  IF COL_LENGTH('dbo.products', 'archived_at') IS NULL ALTER TABLE dbo.products ADD [archived_at] DATETIME2(3) NULL;
  IF COL_LENGTH('dbo.products', 'brand') IS NULL ALTER TABLE dbo.products ADD [brand] NVARCHAR(120) NULL;
  IF COL_LENGTH('dbo.products', 'product_group') IS NULL ALTER TABLE dbo.products ADD [product_group] NVARCHAR(120) NULL;
  IF COL_LENGTH('dbo.products', 'barcode_variants') IS NULL ALTER TABLE dbo.products ADD [barcode_variants] NVARCHAR(MAX) NULL;
  IF COL_LENGTH('dbo.products', 'landing_pct') IS NULL ALTER TABLE dbo.products ADD [landing_pct] DECIMAL(9, 4) NULL;
  IF COL_LENGTH('dbo.products', 'sub_category') IS NULL ALTER TABLE dbo.products ADD [sub_category] NVARCHAR(120) NULL;
  IF COL_LENGTH('dbo.products', 'unit') IS NULL ALTER TABLE dbo.products ADD [unit] NVARCHAR(40) NULL;
  IF COL_LENGTH('dbo.products', 'packs') IS NULL ALTER TABLE dbo.products ADD [packs] NVARCHAR(MAX) NULL;
  IF COL_LENGTH('dbo.products', 'barcode_aliases') IS NULL ALTER TABLE dbo.products ADD [barcode_aliases] NVARCHAR(MAX) NULL;
END
GO
IF OBJECT_ID('dbo.members', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.members', 'is_verified') IS NULL ALTER TABLE dbo.members ADD [is_verified] BIT NULL;
  IF COL_LENGTH('dbo.members', 'verified_at') IS NULL ALTER TABLE dbo.members ADD [verified_at] DATETIME2(3) NULL;
  IF COL_LENGTH('dbo.members', 'verified_channel') IS NULL ALTER TABLE dbo.members ADD [verified_channel] NVARCHAR(30) NULL;
END
GO
