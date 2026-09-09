/* Retail offline SQL Server additive upgrade. Run in the existing POS_LOCAL database. */
SET NOCOUNT ON;
GO
IF OBJECT_ID('dbo.shifts', 'U') IS NOT NULL BEGIN
 IF COL_LENGTH('dbo.shifts','state') IS NULL ALTER TABLE dbo.shifts ADD state NVARCHAR(40) NOT NULL CONSTRAINT DF_shifts_state_retail DEFAULT N'ACTIVE';
 IF COL_LENGTH('dbo.shifts','close_reason') IS NULL ALTER TABLE dbo.shifts ADD close_reason NVARCHAR(400) NULL;
 IF COL_LENGTH('dbo.shifts','closing_started_at') IS NULL ALTER TABLE dbo.shifts ADD closing_started_at DATETIME2(3) NULL;
 IF COL_LENGTH('dbo.shifts','closing_started_by') IS NULL ALTER TABLE dbo.shifts ADD closing_started_by NVARCHAR(200) NULL;
 IF COL_LENGTH('dbo.shifts','counted_card') IS NULL ALTER TABLE dbo.shifts ADD counted_card DECIMAL(18,4) NULL;
 IF COL_LENGTH('dbo.shifts','counted_digital') IS NULL ALTER TABLE dbo.shifts ADD counted_digital DECIMAL(18,4) NULL;
 IF COL_LENGTH('dbo.shifts','variance_status') IS NULL ALTER TABLE dbo.shifts ADD variance_status NVARCHAR(40) NULL;
END
GO
IF OBJECT_ID('dbo.shift_cash_counts','U') IS NULL CREATE TABLE dbo.shift_cash_counts (
 id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(), shift_id NVARCHAR(80) NOT NULL,
 store_id NVARCHAR(60) NOT NULL, terminal_id NVARCHAR(120) NULL, kind NVARCHAR(20) NOT NULL DEFAULT N'ORIGINAL',
 counted_cash DECIMAL(18,4) NOT NULL CHECK(counted_cash>=0), counted_card DECIMAL(18,4) NULL,
 counted_digital DECIMAL(18,4) NULL, reason NVARCHAR(400) NULL, counted_by_name NVARCHAR(200) NULL,
 client_key NVARCHAR(160) NULL, reconcile_state NVARCHAR(20) NOT NULL DEFAULT N'pending',
 is_synced BIT NOT NULL DEFAULT 0, sync_status NVARCHAR(20) NOT NULL DEFAULT N'pending',
 created_at DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(), updated_at DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME());
GO
IF OBJECT_ID('dbo.shift_reconciliations','U') IS NULL CREATE TABLE dbo.shift_reconciliations (
 id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(), shift_id NVARCHAR(80) NOT NULL, store_id NVARCHAR(60) NOT NULL,
 count_id NVARCHAR(80) NULL, expected_cash DECIMAL(18,4) NOT NULL, expected_card DECIMAL(18,4) NULL,
 expected_digital DECIMAL(18,4) NULL, counted_cash DECIMAL(18,4) NOT NULL, counted_card DECIMAL(18,4) NULL,
 counted_digital DECIMAL(18,4) NULL, variance_cash DECIMAL(18,4) NOT NULL, variance_card DECIMAL(18,4) NULL,
 variance_digital DECIMAL(18,4) NULL, variance_total DECIMAL(18,4) NOT NULL, variance_status NVARCHAR(40) NOT NULL,
 is_synced BIT NOT NULL DEFAULT 0, sync_status NVARCHAR(20) NOT NULL DEFAULT N'pending', created_at DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME());
GO
IF OBJECT_ID('dbo.shift_close_events','U') IS NULL CREATE TABLE dbo.shift_close_events (
 id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(), shift_id NVARCHAR(80) NOT NULL, store_id NVARCHAR(60) NOT NULL,
 terminal_id NVARCHAR(120) NULL, event NVARCHAR(60) NOT NULL, from_state NVARCHAR(40) NULL, to_state NVARCHAR(40) NULL,
 detail NVARCHAR(MAX) NULL, actor_name NVARCHAR(200) NULL, is_synced BIT NOT NULL DEFAULT 0,
 sync_status NVARCHAR(20) NOT NULL DEFAULT N'pending', created_at DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME());
GO
IF OBJECT_ID('dbo.shift_variance_alerts','U') IS NULL CREATE TABLE dbo.shift_variance_alerts (
 id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(), shift_id NVARCHAR(80) NOT NULL, store_id NVARCHAR(60) NOT NULL,
 reconciliation_id NVARCHAR(80) NOT NULL, variance_total DECIMAL(18,4) NOT NULL, variance_status NVARCHAR(40) NOT NULL,
 severity NVARCHAR(40) NOT NULL, message NVARCHAR(MAX) NOT NULL, acknowledged_at DATETIME2(3) NULL,
 is_synced BIT NOT NULL DEFAULT 0, sync_status NVARCHAR(20) NOT NULL DEFAULT N'pending', created_at DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME());
GO
IF OBJECT_ID('dbo.pos_store_settings','U') IS NOT NULL BEGIN
 IF COL_LENGTH('dbo.pos_store_settings','row_version') IS NULL ALTER TABLE dbo.pos_store_settings ADD row_version INT NOT NULL CONSTRAINT DF_pos_rules_version_retail DEFAULT 1;
 IF COL_LENGTH('dbo.pos_store_settings','base_version') IS NULL ALTER TABLE dbo.pos_store_settings ADD base_version INT NULL;
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_shift_cash_counts_shift' AND object_id=OBJECT_ID('dbo.shift_cash_counts')) CREATE INDEX IX_shift_cash_counts_shift ON dbo.shift_cash_counts(shift_id,created_at);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='UX_shift_variance_reconciliation' AND object_id=OBJECT_ID('dbo.shift_variance_alerts')) CREATE UNIQUE INDEX UX_shift_variance_reconciliation ON dbo.shift_variance_alerts(reconciliation_id);
GO
