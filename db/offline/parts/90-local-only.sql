/* ---- the queue the sync engine drains, and its bookkeeping ---- */
IF OBJECT_ID('dbo.offline_sync_queue', 'U') IS NULL
CREATE TABLE dbo.offline_sync_queue (
  id                    UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
  table_name            NVARCHAR(80)  NOT NULL,
  record_id             NVARCHAR(120) NULL,
  action_type           NVARCHAR(10)  NOT NULL DEFAULT N'INSERT'
    CONSTRAINT CK_offline_sync_queue_action
    CHECK (action_type IN (N'INSERT', N'UPDATE', N'DELETE')),
  payload_json          NVARCHAR(MAX) NOT NULL,
  status                NVARCHAR(20)  NOT NULL DEFAULT N'pending'
    CONSTRAINT CK_offline_sync_queue_status
    CHECK (status IN (N'pending', N'failed', N'dead_letter')),
  error_message         NVARCHAR(MAX) NULL,
  attempts              INT           NOT NULL DEFAULT 0,
  last_attempt_at       DATETIME2(3)  NULL,
  client_transaction_id NVARCHAR(120) NULL,
  created_at            DATETIME2(3)  NOT NULL DEFAULT SYSUTCDATETIME()
);
GO
IF OBJECT_ID('dbo.offline_sync_queue', 'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_offline_sync_queue_status')
  CREATE INDEX IX_offline_sync_queue_status
    ON dbo.offline_sync_queue (status, created_at);
GO

/* pos_store_settings — the branch trading rules (blank store_id = the
   business-wide row). A till keeps its own copy so the register obeys the
   same rules with no connection, and a change made here is queued upward. */
IF OBJECT_ID('dbo.pos_store_settings', 'U') IS NULL
CREATE TABLE dbo.pos_store_settings (
  /* local key: the branch id, or 'global' for the business-wide row */
  [id] NVARCHAR(120) NOT NULL PRIMARY KEY,
  [store_id] NVARCHAR(400),
  [block_shift_close_on_hold] BIT,
  [require_daily_sales_for_shift_close] BIT,
  [require_counted_cash_on_close] BIT,
  [require_opening_float_count] BIT,
  [enable_blind_cash_count] BIT,
  [max_drawer_cash_limit] DECIMAL(18,4),
  [require_reason_for_payout] BIT,
  [allow_multiple_shifts_per_terminal] BIT,
  [enable_cashier_x_report] BIT,
  [show_opening_float_at_close] BIT,
  [show_expected_totals_at_close] BIT,
  [show_live_variance_at_close] BIT,
  [show_itemized_tender_breakdown] BIT,
  [require_manager_pin_on_variance] BIT,
  [variance_pin_threshold] DECIMAL(18,4),
  [max_cashier_discount_percent] DECIMAL(18,4),
  [max_cart_discount_amount] DECIMAL(18,4),
  [allow_discount_stacking] BIT,
  [require_reason_for_price_override] BIT,
  [prevent_below_cost_sale] BIT,
  [allow_tax_exemption] BIT,
  [prevent_negative_stock_sale] BIT,
  [require_receipt_for_refund] BIT,
  [require_manager_pin_for_refund] BIT,
  [max_refund_days_limit] DECIMAL(18,4),
  [track_item_voids] BIT,
  [auto_lock_timeout_seconds] DECIMAL(18,4),
  [require_manager_pin_for_cash_drawer_open] BIT,
  [enable_manager_pin_audit_log] BIT,
  [require_pin_void_cart] BIT,
  [require_pin_void_line] BIT,
  [require_pin_reduce_qty] BIT,
  [require_pin_manual_discount] BIT,
  [require_pin_price_override] BIT,
  [require_pin_stock_adjustment] BIT,
  [require_pin_shift_close] BIT,
  [require_pin_edit_tenders] BIT,
  [require_pin_terminal_reset] BIT,
  [row_version] INT,
  [base_version] INT,
  [updated_by] NVARCHAR(MAX),
  [updated_at] DATETIME2(3),
  [allow_offline_approvals] BIT,
  [offline_approval_requires_pin] BIT,
  [online_only_void_cart] BIT,
  [online_only_void_line] BIT,
  [online_only_reduce_qty] BIT,
  [online_only_manual_discount] BIT,
  [online_only_price_override] BIT,
  [online_only_stock_adjustment] BIT,
  [online_only_shift_close] BIT,
  [online_only_edit_tenders] BIT,
  [online_only_terminal_reset] BIT,
  [online_only_refund] BIT
);
GO

IF OBJECT_ID('dbo.pos_store_settings', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.pos_store_settings', 'id') IS NULL ALTER TABLE dbo.pos_store_settings ADD [id] NVARCHAR(120);
  IF COL_LENGTH('dbo.pos_store_settings', 'store_id') IS NULL ALTER TABLE dbo.pos_store_settings ADD [store_id] NVARCHAR(400);
  IF COL_LENGTH('dbo.pos_store_settings', 'block_shift_close_on_hold') IS NULL ALTER TABLE dbo.pos_store_settings ADD [block_shift_close_on_hold] BIT;
  IF COL_LENGTH('dbo.pos_store_settings', 'require_daily_sales_for_shift_close') IS NULL ALTER TABLE dbo.pos_store_settings ADD [require_daily_sales_for_shift_close] BIT;
  IF COL_LENGTH('dbo.pos_store_settings', 'require_counted_cash_on_close') IS NULL ALTER TABLE dbo.pos_store_settings ADD [require_counted_cash_on_close] BIT;
  IF COL_LENGTH('dbo.pos_store_settings', 'require_opening_float_count') IS NULL ALTER TABLE dbo.pos_store_settings ADD [require_opening_float_count] BIT;
  IF COL_LENGTH('dbo.pos_store_settings', 'enable_blind_cash_count') IS NULL ALTER TABLE dbo.pos_store_settings ADD [enable_blind_cash_count] BIT;
  IF COL_LENGTH('dbo.pos_store_settings', 'max_drawer_cash_limit') IS NULL ALTER TABLE dbo.pos_store_settings ADD [max_drawer_cash_limit] DECIMAL(18,4);
  IF COL_LENGTH('dbo.pos_store_settings', 'require_reason_for_payout') IS NULL ALTER TABLE dbo.pos_store_settings ADD [require_reason_for_payout] BIT;
  IF COL_LENGTH('dbo.pos_store_settings', 'allow_multiple_shifts_per_terminal') IS NULL ALTER TABLE dbo.pos_store_settings ADD [allow_multiple_shifts_per_terminal] BIT;
  IF COL_LENGTH('dbo.pos_store_settings', 'enable_cashier_x_report') IS NULL ALTER TABLE dbo.pos_store_settings ADD [enable_cashier_x_report] BIT;
  IF COL_LENGTH('dbo.pos_store_settings', 'show_opening_float_at_close') IS NULL ALTER TABLE dbo.pos_store_settings ADD [show_opening_float_at_close] BIT;
  IF COL_LENGTH('dbo.pos_store_settings', 'show_expected_totals_at_close') IS NULL ALTER TABLE dbo.pos_store_settings ADD [show_expected_totals_at_close] BIT;
  IF COL_LENGTH('dbo.pos_store_settings', 'show_live_variance_at_close') IS NULL ALTER TABLE dbo.pos_store_settings ADD [show_live_variance_at_close] BIT;
  IF COL_LENGTH('dbo.pos_store_settings', 'show_itemized_tender_breakdown') IS NULL ALTER TABLE dbo.pos_store_settings ADD [show_itemized_tender_breakdown] BIT;
  IF COL_LENGTH('dbo.pos_store_settings', 'require_manager_pin_on_variance') IS NULL ALTER TABLE dbo.pos_store_settings ADD [require_manager_pin_on_variance] BIT;
  IF COL_LENGTH('dbo.pos_store_settings', 'variance_pin_threshold') IS NULL ALTER TABLE dbo.pos_store_settings ADD [variance_pin_threshold] DECIMAL(18,4);
  IF COL_LENGTH('dbo.pos_store_settings', 'max_cashier_discount_percent') IS NULL ALTER TABLE dbo.pos_store_settings ADD [max_cashier_discount_percent] DECIMAL(18,4);
  IF COL_LENGTH('dbo.pos_store_settings', 'max_cart_discount_amount') IS NULL ALTER TABLE dbo.pos_store_settings ADD [max_cart_discount_amount] DECIMAL(18,4);
  IF COL_LENGTH('dbo.pos_store_settings', 'allow_discount_stacking') IS NULL ALTER TABLE dbo.pos_store_settings ADD [allow_discount_stacking] BIT;
  IF COL_LENGTH('dbo.pos_store_settings', 'require_reason_for_price_override') IS NULL ALTER TABLE dbo.pos_store_settings ADD [require_reason_for_price_override] BIT;
  IF COL_LENGTH('dbo.pos_store_settings', 'prevent_below_cost_sale') IS NULL ALTER TABLE dbo.pos_store_settings ADD [prevent_below_cost_sale] BIT;
  IF COL_LENGTH('dbo.pos_store_settings', 'allow_tax_exemption') IS NULL ALTER TABLE dbo.pos_store_settings ADD [allow_tax_exemption] BIT;
  IF COL_LENGTH('dbo.pos_store_settings', 'prevent_negative_stock_sale') IS NULL ALTER TABLE dbo.pos_store_settings ADD [prevent_negative_stock_sale] BIT;
  IF COL_LENGTH('dbo.pos_store_settings', 'require_receipt_for_refund') IS NULL ALTER TABLE dbo.pos_store_settings ADD [require_receipt_for_refund] BIT;
  IF COL_LENGTH('dbo.pos_store_settings', 'require_manager_pin_for_refund') IS NULL ALTER TABLE dbo.pos_store_settings ADD [require_manager_pin_for_refund] BIT;
  IF COL_LENGTH('dbo.pos_store_settings', 'max_refund_days_limit') IS NULL ALTER TABLE dbo.pos_store_settings ADD [max_refund_days_limit] DECIMAL(18,4);
  IF COL_LENGTH('dbo.pos_store_settings', 'track_item_voids') IS NULL ALTER TABLE dbo.pos_store_settings ADD [track_item_voids] BIT;
  IF COL_LENGTH('dbo.pos_store_settings', 'auto_lock_timeout_seconds') IS NULL ALTER TABLE dbo.pos_store_settings ADD [auto_lock_timeout_seconds] DECIMAL(18,4);
  IF COL_LENGTH('dbo.pos_store_settings', 'require_manager_pin_for_cash_drawer_open') IS NULL ALTER TABLE dbo.pos_store_settings ADD [require_manager_pin_for_cash_drawer_open] BIT;
  IF COL_LENGTH('dbo.pos_store_settings', 'enable_manager_pin_audit_log') IS NULL ALTER TABLE dbo.pos_store_settings ADD [enable_manager_pin_audit_log] BIT;
  IF COL_LENGTH('dbo.pos_store_settings', 'require_pin_void_cart') IS NULL ALTER TABLE dbo.pos_store_settings ADD [require_pin_void_cart] BIT;
  IF COL_LENGTH('dbo.pos_store_settings', 'require_pin_void_line') IS NULL ALTER TABLE dbo.pos_store_settings ADD [require_pin_void_line] BIT;
  IF COL_LENGTH('dbo.pos_store_settings', 'require_pin_reduce_qty') IS NULL ALTER TABLE dbo.pos_store_settings ADD [require_pin_reduce_qty] BIT;
  IF COL_LENGTH('dbo.pos_store_settings', 'require_pin_manual_discount') IS NULL ALTER TABLE dbo.pos_store_settings ADD [require_pin_manual_discount] BIT;
  IF COL_LENGTH('dbo.pos_store_settings', 'require_pin_price_override') IS NULL ALTER TABLE dbo.pos_store_settings ADD [require_pin_price_override] BIT;
  IF COL_LENGTH('dbo.pos_store_settings', 'require_pin_stock_adjustment') IS NULL ALTER TABLE dbo.pos_store_settings ADD [require_pin_stock_adjustment] BIT;
  IF COL_LENGTH('dbo.pos_store_settings', 'require_pin_shift_close') IS NULL ALTER TABLE dbo.pos_store_settings ADD [require_pin_shift_close] BIT;
  IF COL_LENGTH('dbo.pos_store_settings', 'require_pin_edit_tenders') IS NULL ALTER TABLE dbo.pos_store_settings ADD [require_pin_edit_tenders] BIT;
  IF COL_LENGTH('dbo.pos_store_settings', 'require_pin_terminal_reset') IS NULL ALTER TABLE dbo.pos_store_settings ADD [require_pin_terminal_reset] BIT;
  IF COL_LENGTH('dbo.pos_store_settings', 'row_version') IS NULL ALTER TABLE dbo.pos_store_settings ADD [row_version] INT;
  IF COL_LENGTH('dbo.pos_store_settings', 'base_version') IS NULL ALTER TABLE dbo.pos_store_settings ADD [base_version] INT;
  IF COL_LENGTH('dbo.pos_store_settings', 'updated_by') IS NULL ALTER TABLE dbo.pos_store_settings ADD [updated_by] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.pos_store_settings', 'updated_at') IS NULL ALTER TABLE dbo.pos_store_settings ADD [updated_at] DATETIME2(3);
  IF COL_LENGTH('dbo.pos_store_settings', 'allow_offline_approvals') IS NULL ALTER TABLE dbo.pos_store_settings ADD [allow_offline_approvals] BIT;
  IF COL_LENGTH('dbo.pos_store_settings', 'offline_approval_requires_pin') IS NULL ALTER TABLE dbo.pos_store_settings ADD [offline_approval_requires_pin] BIT;
  IF COL_LENGTH('dbo.pos_store_settings', 'online_only_void_cart') IS NULL ALTER TABLE dbo.pos_store_settings ADD [online_only_void_cart] BIT;
  IF COL_LENGTH('dbo.pos_store_settings', 'online_only_void_line') IS NULL ALTER TABLE dbo.pos_store_settings ADD [online_only_void_line] BIT;
  IF COL_LENGTH('dbo.pos_store_settings', 'online_only_reduce_qty') IS NULL ALTER TABLE dbo.pos_store_settings ADD [online_only_reduce_qty] BIT;
  IF COL_LENGTH('dbo.pos_store_settings', 'online_only_manual_discount') IS NULL ALTER TABLE dbo.pos_store_settings ADD [online_only_manual_discount] BIT;
  IF COL_LENGTH('dbo.pos_store_settings', 'online_only_price_override') IS NULL ALTER TABLE dbo.pos_store_settings ADD [online_only_price_override] BIT;
  IF COL_LENGTH('dbo.pos_store_settings', 'online_only_stock_adjustment') IS NULL ALTER TABLE dbo.pos_store_settings ADD [online_only_stock_adjustment] BIT;
  IF COL_LENGTH('dbo.pos_store_settings', 'online_only_shift_close') IS NULL ALTER TABLE dbo.pos_store_settings ADD [online_only_shift_close] BIT;
  IF COL_LENGTH('dbo.pos_store_settings', 'online_only_edit_tenders') IS NULL ALTER TABLE dbo.pos_store_settings ADD [online_only_edit_tenders] BIT;
  IF COL_LENGTH('dbo.pos_store_settings', 'online_only_terminal_reset') IS NULL ALTER TABLE dbo.pos_store_settings ADD [online_only_terminal_reset] BIT;
  IF COL_LENGTH('dbo.pos_store_settings', 'online_only_refund') IS NULL ALTER TABLE dbo.pos_store_settings ADD [online_only_refund] BIT;
END
GO
