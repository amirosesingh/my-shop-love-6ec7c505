-- Generated from supabase/schema.sql. Re-runnable and additive.

SET XACT_ABORT ON;

IF NOT EXISTS (SELECT 1 FROM sys.change_tracking_databases WHERE database_id=DB_ID()) ALTER DATABASE CURRENT SET CHANGE_TRACKING = ON (CHANGE_RETENTION = 7 DAYS, AUTO_CLEANUP = ON);

GO

IF OBJECT_ID(N'dbo.coupon_campaigns', N'U') IS NULL BEGIN CREATE TABLE dbo.[coupon_campaigns] (

  [id] uniqueidentifier NOT NULL CONSTRAINT [DF_coupon_campaigns_id] DEFAULT (NEWID()),
  [name] nvarchar(max) NOT NULL,
  [slug] nvarchar(450) NOT NULL,
  [discount_type] nvarchar(max) NOT NULL CONSTRAINT [DF_coupon_campaigns_discount_type] DEFAULT ('PERCENTAGE'),
  [discount_value] decimal(38,12) NOT NULL CONSTRAINT [DF_coupon_campaigns_discount_value] DEFAULT (0),
  [scope] nvarchar(max) NOT NULL CONSTRAINT [DF_coupon_campaigns_scope] DEFAULT ('BILL'),
  [scope_value] nvarchar(max) NULL,
  [max_claims] int NULL,
  [max_per_member] int NULL CONSTRAINT [DF_coupon_campaigns_max_per_member] DEFAULT (1),
  [claims_count] int NOT NULL CONSTRAINT [DF_coupon_campaigns_claims_count] DEFAULT (0),
  [starts_at] datetimeoffset(7) NULL,
  [expires_at] datetimeoffset(7) NULL,
  [is_active] bit NOT NULL CONSTRAINT [DF_coupon_campaigns_is_active] DEFAULT (1),
  [is_welcome] bit NOT NULL CONSTRAINT [DF_coupon_campaigns_is_welcome] DEFAULT (0),
  [created_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_coupon_campaigns_created_at] DEFAULT (SYSDATETIMEOFFSET()),
  [updated_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_coupon_campaigns_updated_at] DEFAULT (SYSDATETIMEOFFSET()),
  [row_version] int NOT NULL CONSTRAINT [DF_coupon_campaigns_row_version] DEFAULT (1),
  CONSTRAINT [PK_coupon_campaigns] PRIMARY KEY ([id])

); END;

IF OBJECT_ID(N'dbo.coupon_campaigns', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.change_tracking_tables WHERE object_id=OBJECT_ID(N'dbo.coupon_campaigns')) ALTER TABLE dbo.[coupon_campaigns] ENABLE CHANGE_TRACKING;

IF COL_LENGTH(N'dbo.coupon_campaigns', N'id') IS NULL ALTER TABLE dbo.[coupon_campaigns] ADD [id] uniqueidentifier NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.coupon_campaigns') AND c.name=N'id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[coupon_campaigns] ALTER COLUMN [id] uniqueidentifier NOT NULL;

IF COL_LENGTH(N'dbo.coupon_campaigns', N'name') IS NULL ALTER TABLE dbo.[coupon_campaigns] ADD [name] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.coupon_campaigns', N'slug') IS NULL ALTER TABLE dbo.[coupon_campaigns] ADD [slug] nvarchar(450) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.coupon_campaigns') AND c.name=N'slug' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[coupon_campaigns] ALTER COLUMN [slug] nvarchar(450) NOT NULL;

IF COL_LENGTH(N'dbo.coupon_campaigns', N'discount_type') IS NULL ALTER TABLE dbo.[coupon_campaigns] ADD [discount_type] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.coupon_campaigns', N'discount_value') IS NULL ALTER TABLE dbo.[coupon_campaigns] ADD [discount_value] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.coupon_campaigns', N'scope') IS NULL ALTER TABLE dbo.[coupon_campaigns] ADD [scope] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.coupon_campaigns', N'scope_value') IS NULL ALTER TABLE dbo.[coupon_campaigns] ADD [scope_value] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.coupon_campaigns', N'max_claims') IS NULL ALTER TABLE dbo.[coupon_campaigns] ADD [max_claims] int NULL;

IF COL_LENGTH(N'dbo.coupon_campaigns', N'max_per_member') IS NULL ALTER TABLE dbo.[coupon_campaigns] ADD [max_per_member] int NULL;

IF COL_LENGTH(N'dbo.coupon_campaigns', N'claims_count') IS NULL ALTER TABLE dbo.[coupon_campaigns] ADD [claims_count] int NULL;

IF COL_LENGTH(N'dbo.coupon_campaigns', N'starts_at') IS NULL ALTER TABLE dbo.[coupon_campaigns] ADD [starts_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.coupon_campaigns', N'expires_at') IS NULL ALTER TABLE dbo.[coupon_campaigns] ADD [expires_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.coupon_campaigns', N'is_active') IS NULL ALTER TABLE dbo.[coupon_campaigns] ADD [is_active] bit NULL;

IF COL_LENGTH(N'dbo.coupon_campaigns', N'is_welcome') IS NULL ALTER TABLE dbo.[coupon_campaigns] ADD [is_welcome] bit NULL;

IF COL_LENGTH(N'dbo.coupon_campaigns', N'created_at') IS NULL ALTER TABLE dbo.[coupon_campaigns] ADD [created_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.coupon_campaigns', N'updated_at') IS NULL ALTER TABLE dbo.[coupon_campaigns] ADD [updated_at] datetimeoffset(7) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.coupon_campaigns') AND c.name=N'updated_at' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[coupon_campaigns] ALTER COLUMN [updated_at] datetimeoffset(7) NOT NULL;

IF COL_LENGTH(N'dbo.coupon_campaigns', N'row_version') IS NULL ALTER TABLE dbo.[coupon_campaigns] ADD [row_version] int NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.coupon_campaigns') AND name=N'UX_coupon_campaigns_slug') CREATE UNIQUE INDEX [UX_coupon_campaigns_slug] ON dbo.[coupon_campaigns]([slug]);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.coupon_campaigns') AND name=N'IX_coupon_campaigns_updated_at') CREATE INDEX [IX_coupon_campaigns_updated_at] ON dbo.[coupon_campaigns]([updated_at]);

IF OBJECT_ID(N'dbo.shifts', N'U') IS NULL BEGIN CREATE TABLE dbo.[shifts] (

  [id] uniqueidentifier NOT NULL CONSTRAINT [DF_shifts_id] DEFAULT (NEWID()),
  [store_id] nvarchar(450) NOT NULL,
  [terminal_id] nvarchar(max) NULL,
  [terminal_name] nvarchar(max) NULL,
  [opened_by_name] nvarchar(max) NOT NULL CONSTRAINT [DF_shifts_opened_by_name] DEFAULT ('Cashier'),
  [opened_by_staff_id] nvarchar(max) NULL,
  [opened_by_role] nvarchar(max) NULL,
  [closed_by_name] nvarchar(max) NULL,
  [closed_by_staff_id] nvarchar(max) NULL,
  [closed_by_role] nvarchar(max) NULL,
  [opened_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_shifts_opened_at] DEFAULT (SYSDATETIMEOFFSET()),
  [closed_at] datetimeoffset(7) NULL,
  [opening_float] decimal(38,12) NOT NULL CONSTRAINT [DF_shifts_opening_float] DEFAULT (0),
  [counted_cash] decimal(38,12) NULL,
  [expected_cash] decimal(38,12) NULL,
  [note] nvarchar(max) NOT NULL CONSTRAINT [DF_shifts_note] DEFAULT (''),
  [overdue] bit NOT NULL CONSTRAINT [DF_shifts_overdue] DEFAULT (0),
  [created_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_shifts_created_at] DEFAULT (SYSDATETIMEOFFSET()),
  [updated_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_shifts_updated_at] DEFAULT (SYSDATETIMEOFFSET()),
  [status] nvarchar(max) NOT NULL CONSTRAINT [DF_shifts_status] DEFAULT ('OPEN'),
  [closing_float] decimal(38,12) NULL,
  [user_id] uniqueidentifier NULL,
  [row_version] int NOT NULL CONSTRAINT [DF_shifts_row_version] DEFAULT (1),
  [counted_card] decimal(38,12) NULL,
  [counted_digital] decimal(38,12) NULL,
  [expected_card] decimal(38,12) NULL,
  [expected_digital] decimal(38,12) NULL,
  [variance_cash] decimal(38,12) NULL,
  [variance_card] decimal(38,12) NULL,
  [variance_digital] decimal(38,12) NULL,
  [variance_total] decimal(38,12) NULL,
  [state] nvarchar(max) NOT NULL,
  CONSTRAINT [PK_shifts] PRIMARY KEY ([id])

); END;

IF OBJECT_ID(N'dbo.shifts', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.change_tracking_tables WHERE object_id=OBJECT_ID(N'dbo.shifts')) ALTER TABLE dbo.[shifts] ENABLE CHANGE_TRACKING;

IF COL_LENGTH(N'dbo.shifts', N'id') IS NULL ALTER TABLE dbo.[shifts] ADD [id] uniqueidentifier NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.shifts') AND c.name=N'id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[shifts] ALTER COLUMN [id] uniqueidentifier NOT NULL;

IF COL_LENGTH(N'dbo.shifts', N'store_id') IS NULL ALTER TABLE dbo.[shifts] ADD [store_id] nvarchar(450) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.shifts') AND c.name=N'store_id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[shifts] ALTER COLUMN [store_id] nvarchar(450) NOT NULL;

IF COL_LENGTH(N'dbo.shifts', N'terminal_id') IS NULL ALTER TABLE dbo.[shifts] ADD [terminal_id] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.shifts', N'terminal_name') IS NULL ALTER TABLE dbo.[shifts] ADD [terminal_name] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.shifts', N'opened_by_name') IS NULL ALTER TABLE dbo.[shifts] ADD [opened_by_name] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.shifts', N'opened_by_staff_id') IS NULL ALTER TABLE dbo.[shifts] ADD [opened_by_staff_id] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.shifts', N'opened_by_role') IS NULL ALTER TABLE dbo.[shifts] ADD [opened_by_role] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.shifts', N'closed_by_name') IS NULL ALTER TABLE dbo.[shifts] ADD [closed_by_name] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.shifts', N'closed_by_staff_id') IS NULL ALTER TABLE dbo.[shifts] ADD [closed_by_staff_id] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.shifts', N'closed_by_role') IS NULL ALTER TABLE dbo.[shifts] ADD [closed_by_role] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.shifts', N'opened_at') IS NULL ALTER TABLE dbo.[shifts] ADD [opened_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.shifts', N'closed_at') IS NULL ALTER TABLE dbo.[shifts] ADD [closed_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.shifts', N'opening_float') IS NULL ALTER TABLE dbo.[shifts] ADD [opening_float] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.shifts', N'counted_cash') IS NULL ALTER TABLE dbo.[shifts] ADD [counted_cash] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.shifts', N'expected_cash') IS NULL ALTER TABLE dbo.[shifts] ADD [expected_cash] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.shifts', N'note') IS NULL ALTER TABLE dbo.[shifts] ADD [note] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.shifts', N'overdue') IS NULL ALTER TABLE dbo.[shifts] ADD [overdue] bit NULL;

IF COL_LENGTH(N'dbo.shifts', N'created_at') IS NULL ALTER TABLE dbo.[shifts] ADD [created_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.shifts', N'updated_at') IS NULL ALTER TABLE dbo.[shifts] ADD [updated_at] datetimeoffset(7) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.shifts') AND c.name=N'updated_at' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[shifts] ALTER COLUMN [updated_at] datetimeoffset(7) NOT NULL;

IF COL_LENGTH(N'dbo.shifts', N'status') IS NULL ALTER TABLE dbo.[shifts] ADD [status] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.shifts', N'closing_float') IS NULL ALTER TABLE dbo.[shifts] ADD [closing_float] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.shifts', N'user_id') IS NULL ALTER TABLE dbo.[shifts] ADD [user_id] uniqueidentifier NULL;

IF COL_LENGTH(N'dbo.shifts', N'row_version') IS NULL ALTER TABLE dbo.[shifts] ADD [row_version] int NULL;

IF COL_LENGTH(N'dbo.shifts', N'counted_card') IS NULL ALTER TABLE dbo.[shifts] ADD [counted_card] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.shifts', N'counted_digital') IS NULL ALTER TABLE dbo.[shifts] ADD [counted_digital] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.shifts', N'expected_card') IS NULL ALTER TABLE dbo.[shifts] ADD [expected_card] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.shifts', N'expected_digital') IS NULL ALTER TABLE dbo.[shifts] ADD [expected_digital] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.shifts', N'variance_cash') IS NULL ALTER TABLE dbo.[shifts] ADD [variance_cash] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.shifts', N'variance_card') IS NULL ALTER TABLE dbo.[shifts] ADD [variance_card] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.shifts', N'variance_digital') IS NULL ALTER TABLE dbo.[shifts] ADD [variance_digital] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.shifts', N'variance_total') IS NULL ALTER TABLE dbo.[shifts] ADD [variance_total] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.shifts', N'state') IS NULL ALTER TABLE dbo.[shifts] ADD [state] nvarchar(max) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.shifts') AND name=N'IX_shifts_store_id') CREATE INDEX [IX_shifts_store_id] ON dbo.[shifts]([store_id]);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.shifts') AND name=N'IX_shifts_updated_at') CREATE INDEX [IX_shifts_updated_at] ON dbo.[shifts]([updated_at]);

IF OBJECT_ID(N'dbo.issued_vouchers', N'U') IS NULL BEGIN CREATE TABLE dbo.[issued_vouchers] (

  [id] uniqueidentifier NOT NULL CONSTRAINT [DF_issued_vouchers_id] DEFAULT (NEWID()),
  [token_slug] nvarchar(450) NOT NULL,
  [campaign_id] uniqueidentifier NOT NULL,
  [member_id] uniqueidentifier NULL,
  [status] nvarchar(max) NOT NULL CONSTRAINT [DF_issued_vouchers_status] DEFAULT ('ISSUED'),
  [issued_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_issued_vouchers_issued_at] DEFAULT (SYSDATETIMEOFFSET()),
  [expires_at] datetimeoffset(7) NULL,
  [issued_by] nvarchar(max) NULL,
  [issued_source] nvarchar(max) NOT NULL CONSTRAINT [DF_issued_vouchers_issued_source] DEFAULT ('PUBLIC'),
  [redeemed_at] datetimeoffset(7) NULL,
  [redeemed_by] nvarchar(max) NULL,
  [redeemed_sale_id] nvarchar(max) NULL,
  [disabled_at] datetimeoffset(7) NULL,
  [disabled_by] nvarchar(max) NULL,
  [disable_reason] nvarchar(max) NULL,
  [store_id] nvarchar(450) NULL,
  [row_version] int NOT NULL CONSTRAINT [DF_issued_vouchers_row_version] DEFAULT (1),
  CONSTRAINT [PK_issued_vouchers] PRIMARY KEY ([id])

); END;

IF OBJECT_ID(N'dbo.issued_vouchers', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.change_tracking_tables WHERE object_id=OBJECT_ID(N'dbo.issued_vouchers')) ALTER TABLE dbo.[issued_vouchers] ENABLE CHANGE_TRACKING;

IF COL_LENGTH(N'dbo.issued_vouchers', N'id') IS NULL ALTER TABLE dbo.[issued_vouchers] ADD [id] uniqueidentifier NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.issued_vouchers') AND c.name=N'id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[issued_vouchers] ALTER COLUMN [id] uniqueidentifier NOT NULL;

IF COL_LENGTH(N'dbo.issued_vouchers', N'token_slug') IS NULL ALTER TABLE dbo.[issued_vouchers] ADD [token_slug] nvarchar(450) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.issued_vouchers') AND c.name=N'token_slug' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[issued_vouchers] ALTER COLUMN [token_slug] nvarchar(450) NOT NULL;

IF COL_LENGTH(N'dbo.issued_vouchers', N'campaign_id') IS NULL ALTER TABLE dbo.[issued_vouchers] ADD [campaign_id] uniqueidentifier NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.issued_vouchers') AND c.name=N'campaign_id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[issued_vouchers] ALTER COLUMN [campaign_id] uniqueidentifier NOT NULL;

IF COL_LENGTH(N'dbo.issued_vouchers', N'member_id') IS NULL ALTER TABLE dbo.[issued_vouchers] ADD [member_id] uniqueidentifier NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.issued_vouchers') AND c.name=N'member_id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[issued_vouchers] ALTER COLUMN [member_id] uniqueidentifier NULL;

IF COL_LENGTH(N'dbo.issued_vouchers', N'status') IS NULL ALTER TABLE dbo.[issued_vouchers] ADD [status] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.issued_vouchers', N'issued_at') IS NULL ALTER TABLE dbo.[issued_vouchers] ADD [issued_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.issued_vouchers', N'expires_at') IS NULL ALTER TABLE dbo.[issued_vouchers] ADD [expires_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.issued_vouchers', N'issued_by') IS NULL ALTER TABLE dbo.[issued_vouchers] ADD [issued_by] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.issued_vouchers', N'issued_source') IS NULL ALTER TABLE dbo.[issued_vouchers] ADD [issued_source] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.issued_vouchers', N'redeemed_at') IS NULL ALTER TABLE dbo.[issued_vouchers] ADD [redeemed_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.issued_vouchers', N'redeemed_by') IS NULL ALTER TABLE dbo.[issued_vouchers] ADD [redeemed_by] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.issued_vouchers', N'redeemed_sale_id') IS NULL ALTER TABLE dbo.[issued_vouchers] ADD [redeemed_sale_id] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.issued_vouchers', N'disabled_at') IS NULL ALTER TABLE dbo.[issued_vouchers] ADD [disabled_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.issued_vouchers', N'disabled_by') IS NULL ALTER TABLE dbo.[issued_vouchers] ADD [disabled_by] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.issued_vouchers', N'disable_reason') IS NULL ALTER TABLE dbo.[issued_vouchers] ADD [disable_reason] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.issued_vouchers', N'store_id') IS NULL ALTER TABLE dbo.[issued_vouchers] ADD [store_id] nvarchar(450) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.issued_vouchers') AND c.name=N'store_id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[issued_vouchers] ALTER COLUMN [store_id] nvarchar(450) NULL;

IF COL_LENGTH(N'dbo.issued_vouchers', N'row_version') IS NULL ALTER TABLE dbo.[issued_vouchers] ADD [row_version] int NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.issued_vouchers') AND name=N'UX_issued_vouchers_token_slug') CREATE UNIQUE INDEX [UX_issued_vouchers_token_slug] ON dbo.[issued_vouchers]([token_slug]);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.issued_vouchers') AND name=N'IX_issued_vouchers_store_id') CREATE INDEX [IX_issued_vouchers_store_id] ON dbo.[issued_vouchers]([store_id]);

IF OBJECT_ID(N'dbo.activity_events', N'U') IS NULL BEGIN CREATE TABLE dbo.[activity_events] (

  [id] uniqueidentifier NOT NULL CONSTRAINT [DF_activity_events_id] DEFAULT (NEWID()),
  [event_type] nvarchar(max) NOT NULL,
  [severity] nvarchar(max) NOT NULL CONSTRAINT [DF_activity_events_severity] DEFAULT ('info'),
  [title] nvarchar(max) NOT NULL,
  [message] nvarchar(max) NOT NULL CONSTRAINT [DF_activity_events_message] DEFAULT (''),
  [actor_id] nvarchar(max) NULL,
  [actor_name] nvarchar(max) NULL,
  [actor_role] nvarchar(max) NULL,
  [terminal_id] nvarchar(max) NULL,
  [terminal_name] nvarchar(max) NULL,
  [store_id] nvarchar(450) NULL,
  [entity_type] nvarchar(max) NULL,
  [entity_id] nvarchar(max) NULL,
  [amount] decimal(38,12) NULL,
  [meta] nvarchar(max) NOT NULL CONSTRAINT [DF_activity_events_meta] DEFAULT (N'[]'),
  [whatsapp_status] nvarchar(max) NOT NULL CONSTRAINT [DF_activity_events_whatsapp_status] DEFAULT ('skipped'),
  [whatsapp_error] nvarchar(max) NULL,
  [client_event_id] nvarchar(max) NULL,
  [created_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_activity_events_created_at] DEFAULT (SYSDATETIMEOFFSET()),
  [cleared_by] nvarchar(max) NOT NULL CONSTRAINT [DF_activity_events_cleared_by] DEFAULT (N'[]'),
  CONSTRAINT [PK_activity_events] PRIMARY KEY ([id])

); END;

IF OBJECT_ID(N'dbo.activity_events', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.change_tracking_tables WHERE object_id=OBJECT_ID(N'dbo.activity_events')) ALTER TABLE dbo.[activity_events] ENABLE CHANGE_TRACKING;

IF COL_LENGTH(N'dbo.activity_events', N'id') IS NULL ALTER TABLE dbo.[activity_events] ADD [id] uniqueidentifier NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.activity_events') AND c.name=N'id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[activity_events] ALTER COLUMN [id] uniqueidentifier NOT NULL;

IF COL_LENGTH(N'dbo.activity_events', N'event_type') IS NULL ALTER TABLE dbo.[activity_events] ADD [event_type] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.activity_events', N'severity') IS NULL ALTER TABLE dbo.[activity_events] ADD [severity] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.activity_events', N'title') IS NULL ALTER TABLE dbo.[activity_events] ADD [title] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.activity_events', N'message') IS NULL ALTER TABLE dbo.[activity_events] ADD [message] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.activity_events', N'actor_id') IS NULL ALTER TABLE dbo.[activity_events] ADD [actor_id] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.activity_events', N'actor_name') IS NULL ALTER TABLE dbo.[activity_events] ADD [actor_name] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.activity_events', N'actor_role') IS NULL ALTER TABLE dbo.[activity_events] ADD [actor_role] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.activity_events', N'terminal_id') IS NULL ALTER TABLE dbo.[activity_events] ADD [terminal_id] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.activity_events', N'terminal_name') IS NULL ALTER TABLE dbo.[activity_events] ADD [terminal_name] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.activity_events', N'store_id') IS NULL ALTER TABLE dbo.[activity_events] ADD [store_id] nvarchar(450) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.activity_events') AND c.name=N'store_id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[activity_events] ALTER COLUMN [store_id] nvarchar(450) NULL;

IF COL_LENGTH(N'dbo.activity_events', N'entity_type') IS NULL ALTER TABLE dbo.[activity_events] ADD [entity_type] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.activity_events', N'entity_id') IS NULL ALTER TABLE dbo.[activity_events] ADD [entity_id] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.activity_events', N'amount') IS NULL ALTER TABLE dbo.[activity_events] ADD [amount] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.activity_events', N'meta') IS NULL ALTER TABLE dbo.[activity_events] ADD [meta] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.activity_events', N'whatsapp_status') IS NULL ALTER TABLE dbo.[activity_events] ADD [whatsapp_status] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.activity_events', N'whatsapp_error') IS NULL ALTER TABLE dbo.[activity_events] ADD [whatsapp_error] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.activity_events', N'client_event_id') IS NULL ALTER TABLE dbo.[activity_events] ADD [client_event_id] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.activity_events', N'created_at') IS NULL ALTER TABLE dbo.[activity_events] ADD [created_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.activity_events', N'cleared_by') IS NULL ALTER TABLE dbo.[activity_events] ADD [cleared_by] nvarchar(max) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.activity_events') AND name=N'IX_activity_events_store_id') CREATE INDEX [IX_activity_events_store_id] ON dbo.[activity_events]([store_id]);

IF OBJECT_ID(N'dbo.app_users', N'U') IS NULL BEGIN CREATE TABLE dbo.[app_users] (

  [id] uniqueidentifier NOT NULL CONSTRAINT [DF_app_users_id] DEFAULT (NEWID()),
  [user_id] nvarchar(64) NOT NULL,
  [full_name] nvarchar(160) NOT NULL,
  [email] nvarchar(255) NOT NULL,
  [role] nvarchar(max) NOT NULL,
  [store_id] nvarchar(64) NULL,
  [is_active] bit NOT NULL CONSTRAINT [DF_app_users_is_active] DEFAULT (1),
  [permissions] nvarchar(max) NOT NULL,
  [pin_hash] nvarchar(max) NOT NULL CONSTRAINT [DF_app_users_pin_hash] DEFAULT (''),
  [auth_user_id] uniqueidentifier NULL,
  [last_login_at] datetimeoffset(7) NULL,
  [created_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_app_users_created_at] DEFAULT (SYSDATETIMEOFFSET()),
  [updated_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_app_users_updated_at] DEFAULT (SYSDATETIMEOFFSET()),
  [role_slug] nvarchar(max) NULL,
  [pin_length] smallint NOT NULL CONSTRAINT [DF_app_users_pin_length] DEFAULT (6),
  [row_version] int NOT NULL CONSTRAINT [DF_app_users_row_version] DEFAULT (1),
  [pin_set_at] datetimeoffset(7) NULL,
  [pin_updated_by] nvarchar(max) NULL,
  CONSTRAINT [PK_app_users] PRIMARY KEY ([id])

); END;

IF OBJECT_ID(N'dbo.app_users', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.change_tracking_tables WHERE object_id=OBJECT_ID(N'dbo.app_users')) ALTER TABLE dbo.[app_users] ENABLE CHANGE_TRACKING;

IF COL_LENGTH(N'dbo.app_users', N'id') IS NULL ALTER TABLE dbo.[app_users] ADD [id] uniqueidentifier NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.app_users') AND c.name=N'id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[app_users] ALTER COLUMN [id] uniqueidentifier NOT NULL;

IF COL_LENGTH(N'dbo.app_users', N'user_id') IS NULL ALTER TABLE dbo.[app_users] ADD [user_id] nvarchar(64) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.app_users') AND c.name=N'user_id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[app_users] ALTER COLUMN [user_id] nvarchar(64) NOT NULL;

IF COL_LENGTH(N'dbo.app_users', N'full_name') IS NULL ALTER TABLE dbo.[app_users] ADD [full_name] nvarchar(160) NULL;

IF COL_LENGTH(N'dbo.app_users', N'email') IS NULL ALTER TABLE dbo.[app_users] ADD [email] nvarchar(255) NULL;

IF COL_LENGTH(N'dbo.app_users', N'role') IS NULL ALTER TABLE dbo.[app_users] ADD [role] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.app_users', N'store_id') IS NULL ALTER TABLE dbo.[app_users] ADD [store_id] nvarchar(64) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.app_users') AND c.name=N'store_id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[app_users] ALTER COLUMN [store_id] nvarchar(64) NULL;

IF COL_LENGTH(N'dbo.app_users', N'is_active') IS NULL ALTER TABLE dbo.[app_users] ADD [is_active] bit NULL;

IF COL_LENGTH(N'dbo.app_users', N'permissions') IS NULL ALTER TABLE dbo.[app_users] ADD [permissions] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.app_users', N'pin_hash') IS NULL ALTER TABLE dbo.[app_users] ADD [pin_hash] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.app_users', N'auth_user_id') IS NULL ALTER TABLE dbo.[app_users] ADD [auth_user_id] uniqueidentifier NULL;

IF COL_LENGTH(N'dbo.app_users', N'last_login_at') IS NULL ALTER TABLE dbo.[app_users] ADD [last_login_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.app_users', N'created_at') IS NULL ALTER TABLE dbo.[app_users] ADD [created_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.app_users', N'updated_at') IS NULL ALTER TABLE dbo.[app_users] ADD [updated_at] datetimeoffset(7) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.app_users') AND c.name=N'updated_at' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[app_users] ALTER COLUMN [updated_at] datetimeoffset(7) NOT NULL;

IF COL_LENGTH(N'dbo.app_users', N'role_slug') IS NULL ALTER TABLE dbo.[app_users] ADD [role_slug] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.app_users', N'pin_length') IS NULL ALTER TABLE dbo.[app_users] ADD [pin_length] smallint NULL;

IF COL_LENGTH(N'dbo.app_users', N'row_version') IS NULL ALTER TABLE dbo.[app_users] ADD [row_version] int NULL;

IF COL_LENGTH(N'dbo.app_users', N'pin_set_at') IS NULL ALTER TABLE dbo.[app_users] ADD [pin_set_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.app_users', N'pin_updated_by') IS NULL ALTER TABLE dbo.[app_users] ADD [pin_updated_by] nvarchar(max) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.app_users') AND name=N'UX_app_users_user_id') CREATE UNIQUE INDEX [UX_app_users_user_id] ON dbo.[app_users]([user_id]);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.app_users') AND name=N'IX_app_users_store_id') CREATE INDEX [IX_app_users_store_id] ON dbo.[app_users]([store_id]);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.app_users') AND name=N'IX_app_users_updated_at') CREATE INDEX [IX_app_users_updated_at] ON dbo.[app_users]([updated_at]);

IF OBJECT_ID(N'dbo.audit_logs', N'U') IS NULL BEGIN CREATE TABLE dbo.[audit_logs] (

  [id] uniqueidentifier NOT NULL CONSTRAINT [DF_audit_logs_id] DEFAULT (NEWID()),
  [user_name] nvarchar(max) NULL,
  [action_category] nvarchar(max) NOT NULL,
  [action_name] nvarchar(max) NOT NULL,
  [target_module] nvarchar(max) NULL,
  [details] nvarchar(max) NULL,
  [created_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_audit_logs_created_at] DEFAULT (SYSDATETIMEOFFSET()),
  [user_id] nvarchar(max) NULL,
  [action] nvarchar(max) NULL,
  [entity] nvarchar(max) NULL,
  [before_state] nvarchar(max) NULL,
  [after_state] nvarchar(max) NULL,
  [store_id] nvarchar(450) NULL,
  CONSTRAINT [PK_audit_logs] PRIMARY KEY ([id])

); END;

IF OBJECT_ID(N'dbo.audit_logs', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.change_tracking_tables WHERE object_id=OBJECT_ID(N'dbo.audit_logs')) ALTER TABLE dbo.[audit_logs] ENABLE CHANGE_TRACKING;

IF COL_LENGTH(N'dbo.audit_logs', N'id') IS NULL ALTER TABLE dbo.[audit_logs] ADD [id] uniqueidentifier NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.audit_logs') AND c.name=N'id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[audit_logs] ALTER COLUMN [id] uniqueidentifier NOT NULL;

IF COL_LENGTH(N'dbo.audit_logs', N'user_name') IS NULL ALTER TABLE dbo.[audit_logs] ADD [user_name] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.audit_logs', N'action_category') IS NULL ALTER TABLE dbo.[audit_logs] ADD [action_category] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.audit_logs', N'action_name') IS NULL ALTER TABLE dbo.[audit_logs] ADD [action_name] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.audit_logs', N'target_module') IS NULL ALTER TABLE dbo.[audit_logs] ADD [target_module] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.audit_logs', N'details') IS NULL ALTER TABLE dbo.[audit_logs] ADD [details] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.audit_logs', N'created_at') IS NULL ALTER TABLE dbo.[audit_logs] ADD [created_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.audit_logs', N'user_id') IS NULL ALTER TABLE dbo.[audit_logs] ADD [user_id] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.audit_logs', N'action') IS NULL ALTER TABLE dbo.[audit_logs] ADD [action] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.audit_logs', N'entity') IS NULL ALTER TABLE dbo.[audit_logs] ADD [entity] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.audit_logs', N'before_state') IS NULL ALTER TABLE dbo.[audit_logs] ADD [before_state] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.audit_logs', N'after_state') IS NULL ALTER TABLE dbo.[audit_logs] ADD [after_state] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.audit_logs', N'store_id') IS NULL ALTER TABLE dbo.[audit_logs] ADD [store_id] nvarchar(450) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.audit_logs') AND c.name=N'store_id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[audit_logs] ALTER COLUMN [store_id] nvarchar(450) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.audit_logs') AND name=N'IX_audit_logs_store_id') CREATE INDEX [IX_audit_logs_store_id] ON dbo.[audit_logs]([store_id]);

IF OBJECT_ID(N'dbo.booking_payments', N'U') IS NULL BEGIN CREATE TABLE dbo.[booking_payments] (

  [id] uniqueidentifier NOT NULL CONSTRAINT [DF_booking_payments_id] DEFAULT (NEWID()),
  [booking_id] uniqueidentifier NOT NULL,
  [amount] decimal(38,12) NOT NULL CONSTRAINT [DF_booking_payments_amount] DEFAULT (0),
  [method] nvarchar(max) NOT NULL CONSTRAINT [DF_booking_payments_method] DEFAULT ('cash'),
  [cashier] nvarchar(max) NULL,
  [paid_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_booking_payments_paid_at] DEFAULT (SYSDATETIMEOFFSET()),
  [created_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_booking_payments_created_at] DEFAULT (SYSDATETIMEOFFSET()),
  [row_version] int NOT NULL CONSTRAINT [DF_booking_payments_row_version] DEFAULT (1),
  [status] nvarchar(max) NOT NULL,
  [kind] nvarchar(max) NOT NULL,
  CONSTRAINT [PK_booking_payments] PRIMARY KEY ([id])

); END;

IF OBJECT_ID(N'dbo.booking_payments', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.change_tracking_tables WHERE object_id=OBJECT_ID(N'dbo.booking_payments')) ALTER TABLE dbo.[booking_payments] ENABLE CHANGE_TRACKING;

IF COL_LENGTH(N'dbo.booking_payments', N'id') IS NULL ALTER TABLE dbo.[booking_payments] ADD [id] uniqueidentifier NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.booking_payments') AND c.name=N'id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[booking_payments] ALTER COLUMN [id] uniqueidentifier NOT NULL;

IF COL_LENGTH(N'dbo.booking_payments', N'booking_id') IS NULL ALTER TABLE dbo.[booking_payments] ADD [booking_id] uniqueidentifier NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.booking_payments') AND c.name=N'booking_id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[booking_payments] ALTER COLUMN [booking_id] uniqueidentifier NOT NULL;

IF COL_LENGTH(N'dbo.booking_payments', N'amount') IS NULL ALTER TABLE dbo.[booking_payments] ADD [amount] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.booking_payments', N'method') IS NULL ALTER TABLE dbo.[booking_payments] ADD [method] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.booking_payments', N'cashier') IS NULL ALTER TABLE dbo.[booking_payments] ADD [cashier] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.booking_payments', N'paid_at') IS NULL ALTER TABLE dbo.[booking_payments] ADD [paid_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.booking_payments', N'created_at') IS NULL ALTER TABLE dbo.[booking_payments] ADD [created_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.booking_payments', N'row_version') IS NULL ALTER TABLE dbo.[booking_payments] ADD [row_version] int NULL;

IF COL_LENGTH(N'dbo.booking_payments', N'status') IS NULL ALTER TABLE dbo.[booking_payments] ADD [status] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.booking_payments', N'kind') IS NULL ALTER TABLE dbo.[booking_payments] ADD [kind] nvarchar(max) NULL;

IF OBJECT_ID(N'dbo.bookings', N'U') IS NULL BEGIN CREATE TABLE dbo.[bookings] (

  [id] uniqueidentifier NOT NULL CONSTRAINT [DF_bookings_id] DEFAULT (NEWID()),
  [ref] nvarchar(max) NOT NULL,
  [store_id] nvarchar(450) NULL,
  [shift_id] nvarchar(max) NULL,
  [customer_name] nvarchar(max) NOT NULL CONSTRAINT [DF_bookings_customer_name] DEFAULT (''),
  [customer_phone] nvarchar(max) NOT NULL CONSTRAINT [DF_bookings_customer_phone] DEFAULT (''),
  [member_id] uniqueidentifier NULL,
  [service_type_id] nvarchar(max) NULL,
  [service_name] nvarchar(max) NULL,
  [service_fee] decimal(38,12) NOT NULL CONSTRAINT [DF_bookings_service_fee] DEFAULT (0),
  [payment_timing] nvarchar(max) NULL,
  [lines] nvarchar(max) NOT NULL CONSTRAINT [DF_bookings_lines] DEFAULT ('[]'),
  [subtotal] decimal(38,12) NOT NULL CONSTRAINT [DF_bookings_subtotal] DEFAULT (0),
  [discount] decimal(38,12) NOT NULL CONSTRAINT [DF_bookings_discount] DEFAULT (0),
  [tax] decimal(38,12) NOT NULL CONSTRAINT [DF_bookings_tax] DEFAULT (0),
  [total] decimal(38,12) NOT NULL CONSTRAINT [DF_bookings_total] DEFAULT (0),
  [paid] decimal(38,12) NOT NULL CONSTRAINT [DF_bookings_paid] DEFAULT (0),
  [due_date] date NULL,
  [note] nvarchar(max) NOT NULL CONSTRAINT [DF_bookings_note] DEFAULT (''),
  [cashier] nvarchar(max) NULL,
  [status] nvarchar(max) NOT NULL CONSTRAINT [DF_bookings_status] DEFAULT ('active'),
  [sale_receipt_no] nvarchar(max) NULL,
  [closed_at] datetimeoffset(7) NULL,
  [racket_model] nvarchar(max) NULL,
  [string_type] nvarchar(max) NULL,
  [tension_main] decimal(38,12) NULL,
  [tension_cross] decimal(38,12) NULL,
  [tension_unit] nvarchar(max) NOT NULL CONSTRAINT [DF_bookings_tension_unit] DEFAULT ('lb'),
  [grommet_notes] nvarchar(max) NULL,
  [job_notes] nvarchar(max) NULL,
  [dropped_off_at] datetimeoffset(7) NULL,
  [promised_at] datetimeoffset(7) NULL,
  [job_status] nvarchar(max) NOT NULL CONSTRAINT [DF_bookings_job_status] DEFAULT ('received'),
  [job_status_by] nvarchar(max) NULL,
  [job_status_at] datetimeoffset(7) NULL,
  [notify_whatsapp] bit NOT NULL CONSTRAINT [DF_bookings_notify_whatsapp] DEFAULT (0),
  [created_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_bookings_created_at] DEFAULT (SYSDATETIMEOFFSET()),
  [updated_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_bookings_updated_at] DEFAULT (SYSDATETIMEOFFSET()),
  [tag_id] nvarchar(max) NULL,
  [intake_note] nvarchar(max) NULL,
  [string_origin] nvarchar(max) NULL,
  [string_source_product_id] uniqueidentifier NULL,
  [grip_product_id] uniqueidentifier NULL,
  [charges] nvarchar(max) NOT NULL CONSTRAINT [DF_bookings_charges] DEFAULT (N'[]'),
  [technician] nvarchar(max) NULL,
  [liability_accepted] bit NOT NULL CONSTRAINT [DF_bookings_liability_accepted] DEFAULT (0),
  [incident_note] nvarchar(max) NULL,
  [row_version] int NOT NULL CONSTRAINT [DF_bookings_row_version] DEFAULT (1),
  [cancel_reason] nvarchar(max) NULL,
  [cancel_money_action] nvarchar(max) NULL,
  CONSTRAINT [PK_bookings] PRIMARY KEY ([id])

); END;

IF OBJECT_ID(N'dbo.bookings', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.change_tracking_tables WHERE object_id=OBJECT_ID(N'dbo.bookings')) ALTER TABLE dbo.[bookings] ENABLE CHANGE_TRACKING;

IF COL_LENGTH(N'dbo.bookings', N'id') IS NULL ALTER TABLE dbo.[bookings] ADD [id] uniqueidentifier NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.bookings') AND c.name=N'id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[bookings] ALTER COLUMN [id] uniqueidentifier NOT NULL;

IF COL_LENGTH(N'dbo.bookings', N'ref') IS NULL ALTER TABLE dbo.[bookings] ADD [ref] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.bookings', N'store_id') IS NULL ALTER TABLE dbo.[bookings] ADD [store_id] nvarchar(450) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.bookings') AND c.name=N'store_id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[bookings] ALTER COLUMN [store_id] nvarchar(450) NULL;

IF COL_LENGTH(N'dbo.bookings', N'shift_id') IS NULL ALTER TABLE dbo.[bookings] ADD [shift_id] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.bookings', N'customer_name') IS NULL ALTER TABLE dbo.[bookings] ADD [customer_name] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.bookings', N'customer_phone') IS NULL ALTER TABLE dbo.[bookings] ADD [customer_phone] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.bookings', N'member_id') IS NULL ALTER TABLE dbo.[bookings] ADD [member_id] uniqueidentifier NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.bookings') AND c.name=N'member_id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[bookings] ALTER COLUMN [member_id] uniqueidentifier NULL;

IF COL_LENGTH(N'dbo.bookings', N'service_type_id') IS NULL ALTER TABLE dbo.[bookings] ADD [service_type_id] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.bookings', N'service_name') IS NULL ALTER TABLE dbo.[bookings] ADD [service_name] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.bookings', N'service_fee') IS NULL ALTER TABLE dbo.[bookings] ADD [service_fee] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.bookings', N'payment_timing') IS NULL ALTER TABLE dbo.[bookings] ADD [payment_timing] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.bookings', N'lines') IS NULL ALTER TABLE dbo.[bookings] ADD [lines] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.bookings', N'subtotal') IS NULL ALTER TABLE dbo.[bookings] ADD [subtotal] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.bookings', N'discount') IS NULL ALTER TABLE dbo.[bookings] ADD [discount] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.bookings', N'tax') IS NULL ALTER TABLE dbo.[bookings] ADD [tax] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.bookings', N'total') IS NULL ALTER TABLE dbo.[bookings] ADD [total] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.bookings', N'paid') IS NULL ALTER TABLE dbo.[bookings] ADD [paid] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.bookings', N'due_date') IS NULL ALTER TABLE dbo.[bookings] ADD [due_date] date NULL;

IF COL_LENGTH(N'dbo.bookings', N'note') IS NULL ALTER TABLE dbo.[bookings] ADD [note] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.bookings', N'cashier') IS NULL ALTER TABLE dbo.[bookings] ADD [cashier] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.bookings', N'status') IS NULL ALTER TABLE dbo.[bookings] ADD [status] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.bookings', N'sale_receipt_no') IS NULL ALTER TABLE dbo.[bookings] ADD [sale_receipt_no] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.bookings', N'closed_at') IS NULL ALTER TABLE dbo.[bookings] ADD [closed_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.bookings', N'racket_model') IS NULL ALTER TABLE dbo.[bookings] ADD [racket_model] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.bookings', N'string_type') IS NULL ALTER TABLE dbo.[bookings] ADD [string_type] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.bookings', N'tension_main') IS NULL ALTER TABLE dbo.[bookings] ADD [tension_main] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.bookings', N'tension_cross') IS NULL ALTER TABLE dbo.[bookings] ADD [tension_cross] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.bookings', N'tension_unit') IS NULL ALTER TABLE dbo.[bookings] ADD [tension_unit] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.bookings', N'grommet_notes') IS NULL ALTER TABLE dbo.[bookings] ADD [grommet_notes] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.bookings', N'job_notes') IS NULL ALTER TABLE dbo.[bookings] ADD [job_notes] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.bookings', N'dropped_off_at') IS NULL ALTER TABLE dbo.[bookings] ADD [dropped_off_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.bookings', N'promised_at') IS NULL ALTER TABLE dbo.[bookings] ADD [promised_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.bookings', N'job_status') IS NULL ALTER TABLE dbo.[bookings] ADD [job_status] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.bookings', N'job_status_by') IS NULL ALTER TABLE dbo.[bookings] ADD [job_status_by] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.bookings', N'job_status_at') IS NULL ALTER TABLE dbo.[bookings] ADD [job_status_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.bookings', N'notify_whatsapp') IS NULL ALTER TABLE dbo.[bookings] ADD [notify_whatsapp] bit NULL;

IF COL_LENGTH(N'dbo.bookings', N'created_at') IS NULL ALTER TABLE dbo.[bookings] ADD [created_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.bookings', N'updated_at') IS NULL ALTER TABLE dbo.[bookings] ADD [updated_at] datetimeoffset(7) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.bookings') AND c.name=N'updated_at' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[bookings] ALTER COLUMN [updated_at] datetimeoffset(7) NOT NULL;

IF COL_LENGTH(N'dbo.bookings', N'tag_id') IS NULL ALTER TABLE dbo.[bookings] ADD [tag_id] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.bookings', N'intake_note') IS NULL ALTER TABLE dbo.[bookings] ADD [intake_note] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.bookings', N'string_origin') IS NULL ALTER TABLE dbo.[bookings] ADD [string_origin] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.bookings', N'string_source_product_id') IS NULL ALTER TABLE dbo.[bookings] ADD [string_source_product_id] uniqueidentifier NULL;

IF COL_LENGTH(N'dbo.bookings', N'grip_product_id') IS NULL ALTER TABLE dbo.[bookings] ADD [grip_product_id] uniqueidentifier NULL;

IF COL_LENGTH(N'dbo.bookings', N'charges') IS NULL ALTER TABLE dbo.[bookings] ADD [charges] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.bookings', N'technician') IS NULL ALTER TABLE dbo.[bookings] ADD [technician] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.bookings', N'liability_accepted') IS NULL ALTER TABLE dbo.[bookings] ADD [liability_accepted] bit NULL;

IF COL_LENGTH(N'dbo.bookings', N'incident_note') IS NULL ALTER TABLE dbo.[bookings] ADD [incident_note] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.bookings', N'row_version') IS NULL ALTER TABLE dbo.[bookings] ADD [row_version] int NULL;

IF COL_LENGTH(N'dbo.bookings', N'cancel_reason') IS NULL ALTER TABLE dbo.[bookings] ADD [cancel_reason] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.bookings', N'cancel_money_action') IS NULL ALTER TABLE dbo.[bookings] ADD [cancel_money_action] nvarchar(max) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.bookings') AND name=N'IX_bookings_store_id') CREATE INDEX [IX_bookings_store_id] ON dbo.[bookings]([store_id]);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.bookings') AND name=N'IX_bookings_updated_at') CREATE INDEX [IX_bookings_updated_at] ON dbo.[bookings]([updated_at]);

IF OBJECT_ID(N'dbo.branch_telemetry', N'U') IS NULL BEGIN CREATE TABLE dbo.[branch_telemetry] (

  [terminal_id] nvarchar(450) NOT NULL,
  [store_id] nvarchar(450) NULL,
  [terminal_name] nvarchar(max) NULL,
  [staff_name] nvarchar(max) NULL,
  [staff_role] nvarchar(max) NULL,
  [db_mode] nvarchar(max) NOT NULL CONSTRAINT [DF_branch_telemetry_db_mode] DEFAULT ('online'),
  [connection_status] nvarchar(max) NOT NULL CONSTRAINT [DF_branch_telemetry_connection_status] DEFAULT ('online'),
  [storage_engine] nvarchar(max) NOT NULL CONSTRAINT [DF_branch_telemetry_storage_engine] DEFAULT ('cloud'),
  [pending_count] int NOT NULL CONSTRAINT [DF_branch_telemetry_pending_count] DEFAULT (0),
  [conflict_count] int NOT NULL CONSTRAINT [DF_branch_telemetry_conflict_count] DEFAULT (0),
  [last_synced_at] datetimeoffset(7) NULL,
  [app_version] nvarchar(max) NULL,
  [platform] nvarchar(max) NULL,
  [last_seen_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_branch_telemetry_last_seen_at] DEFAULT (SYSDATETIMEOFFSET()),
  [created_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_branch_telemetry_created_at] DEFAULT (SYSDATETIMEOFFSET()),
  [updated_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_branch_telemetry_updated_at] DEFAULT (SYSDATETIMEOFFSET()),
  [branch_id] nvarchar(450) NULL,
  [pending_queue_count] int NULL,
  [last_ping] datetimeoffset(7) NULL,
  [status] nvarchar(max) NULL,
  [branch_code] nvarchar(max) NULL,
  [session_status] nvarchar(max) NULL,
  [sql_server_state] nvarchar(max) NULL,
  [database_name] nvarchar(max) NULL,
  [schema_version] int NULL,
  [failed_count] int NOT NULL CONSTRAINT [DF_branch_telemetry_failed_count] DEFAULT (0),
  [sync_phase] nvarchar(max) NULL,
  [current_table] nvarchar(max) NULL,
  [last_push_at] datetimeoffset(7) NULL,
  [last_pull_at] datetimeoffset(7) NULL,
  CONSTRAINT [PK_branch_telemetry] PRIMARY KEY ([terminal_id])

); END;

IF OBJECT_ID(N'dbo.branch_telemetry', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.change_tracking_tables WHERE object_id=OBJECT_ID(N'dbo.branch_telemetry')) ALTER TABLE dbo.[branch_telemetry] ENABLE CHANGE_TRACKING;

IF COL_LENGTH(N'dbo.branch_telemetry', N'terminal_id') IS NULL ALTER TABLE dbo.[branch_telemetry] ADD [terminal_id] nvarchar(450) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.branch_telemetry') AND c.name=N'terminal_id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[branch_telemetry] ALTER COLUMN [terminal_id] nvarchar(450) NOT NULL;

IF COL_LENGTH(N'dbo.branch_telemetry', N'store_id') IS NULL ALTER TABLE dbo.[branch_telemetry] ADD [store_id] nvarchar(450) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.branch_telemetry') AND c.name=N'store_id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[branch_telemetry] ALTER COLUMN [store_id] nvarchar(450) NULL;

IF COL_LENGTH(N'dbo.branch_telemetry', N'terminal_name') IS NULL ALTER TABLE dbo.[branch_telemetry] ADD [terminal_name] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.branch_telemetry', N'staff_name') IS NULL ALTER TABLE dbo.[branch_telemetry] ADD [staff_name] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.branch_telemetry', N'staff_role') IS NULL ALTER TABLE dbo.[branch_telemetry] ADD [staff_role] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.branch_telemetry', N'db_mode') IS NULL ALTER TABLE dbo.[branch_telemetry] ADD [db_mode] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.branch_telemetry', N'connection_status') IS NULL ALTER TABLE dbo.[branch_telemetry] ADD [connection_status] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.branch_telemetry', N'storage_engine') IS NULL ALTER TABLE dbo.[branch_telemetry] ADD [storage_engine] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.branch_telemetry', N'pending_count') IS NULL ALTER TABLE dbo.[branch_telemetry] ADD [pending_count] int NULL;

IF COL_LENGTH(N'dbo.branch_telemetry', N'conflict_count') IS NULL ALTER TABLE dbo.[branch_telemetry] ADD [conflict_count] int NULL;

IF COL_LENGTH(N'dbo.branch_telemetry', N'last_synced_at') IS NULL ALTER TABLE dbo.[branch_telemetry] ADD [last_synced_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.branch_telemetry', N'app_version') IS NULL ALTER TABLE dbo.[branch_telemetry] ADD [app_version] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.branch_telemetry', N'platform') IS NULL ALTER TABLE dbo.[branch_telemetry] ADD [platform] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.branch_telemetry', N'last_seen_at') IS NULL ALTER TABLE dbo.[branch_telemetry] ADD [last_seen_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.branch_telemetry', N'created_at') IS NULL ALTER TABLE dbo.[branch_telemetry] ADD [created_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.branch_telemetry', N'updated_at') IS NULL ALTER TABLE dbo.[branch_telemetry] ADD [updated_at] datetimeoffset(7) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.branch_telemetry') AND c.name=N'updated_at' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[branch_telemetry] ALTER COLUMN [updated_at] datetimeoffset(7) NOT NULL;

IF COL_LENGTH(N'dbo.branch_telemetry', N'branch_id') IS NULL ALTER TABLE dbo.[branch_telemetry] ADD [branch_id] nvarchar(450) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.branch_telemetry') AND c.name=N'branch_id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[branch_telemetry] ALTER COLUMN [branch_id] nvarchar(450) NULL;

IF COL_LENGTH(N'dbo.branch_telemetry', N'pending_queue_count') IS NULL ALTER TABLE dbo.[branch_telemetry] ADD [pending_queue_count] int NULL;

IF COL_LENGTH(N'dbo.branch_telemetry', N'last_ping') IS NULL ALTER TABLE dbo.[branch_telemetry] ADD [last_ping] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.branch_telemetry', N'status') IS NULL ALTER TABLE dbo.[branch_telemetry] ADD [status] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.branch_telemetry', N'branch_code') IS NULL ALTER TABLE dbo.[branch_telemetry] ADD [branch_code] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.branch_telemetry', N'session_status') IS NULL ALTER TABLE dbo.[branch_telemetry] ADD [session_status] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.branch_telemetry', N'sql_server_state') IS NULL ALTER TABLE dbo.[branch_telemetry] ADD [sql_server_state] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.branch_telemetry', N'database_name') IS NULL ALTER TABLE dbo.[branch_telemetry] ADD [database_name] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.branch_telemetry', N'schema_version') IS NULL ALTER TABLE dbo.[branch_telemetry] ADD [schema_version] int NULL;

IF COL_LENGTH(N'dbo.branch_telemetry', N'failed_count') IS NULL ALTER TABLE dbo.[branch_telemetry] ADD [failed_count] int NULL;

IF COL_LENGTH(N'dbo.branch_telemetry', N'sync_phase') IS NULL ALTER TABLE dbo.[branch_telemetry] ADD [sync_phase] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.branch_telemetry', N'current_table') IS NULL ALTER TABLE dbo.[branch_telemetry] ADD [current_table] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.branch_telemetry', N'last_push_at') IS NULL ALTER TABLE dbo.[branch_telemetry] ADD [last_push_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.branch_telemetry', N'last_pull_at') IS NULL ALTER TABLE dbo.[branch_telemetry] ADD [last_pull_at] datetimeoffset(7) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.branch_telemetry') AND name=N'IX_branch_telemetry_store_id') CREATE INDEX [IX_branch_telemetry_store_id] ON dbo.[branch_telemetry]([store_id]);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.branch_telemetry') AND name=N'IX_branch_telemetry_updated_at') CREATE INDEX [IX_branch_telemetry_updated_at] ON dbo.[branch_telemetry]([updated_at]);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.branch_telemetry') AND name=N'IX_branch_telemetry_branch_id') CREATE INDEX [IX_branch_telemetry_branch_id] ON dbo.[branch_telemetry]([branch_id]);

IF OBJECT_ID(N'dbo.cashiers', N'U') IS NULL BEGIN CREATE TABLE dbo.[cashiers] (

  [id] uniqueidentifier NOT NULL CONSTRAINT [DF_cashiers_id] DEFAULT (NEWID()),
  [username] nvarchar(max) NOT NULL,
  [full_name] nvarchar(max) NOT NULL CONSTRAINT [DF_cashiers_full_name] DEFAULT (''),
  [pin_hash] nvarchar(max) NOT NULL,
  [store_id] nvarchar(450) NULL,
  [permissions] nvarchar(max) NOT NULL CONSTRAINT [DF_cashiers_permissions] DEFAULT (N'[]'),
  [is_active] bit NOT NULL CONSTRAINT [DF_cashiers_is_active] DEFAULT (1),
  [last_login_at] datetimeoffset(7) NULL,
  [created_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_cashiers_created_at] DEFAULT (SYSDATETIMEOFFSET()),
  [updated_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_cashiers_updated_at] DEFAULT (SYSDATETIMEOFFSET()),
  [role_slug] nvarchar(max) NULL,
  CONSTRAINT [PK_cashiers] PRIMARY KEY ([id])

); END;

IF OBJECT_ID(N'dbo.cashiers', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.change_tracking_tables WHERE object_id=OBJECT_ID(N'dbo.cashiers')) ALTER TABLE dbo.[cashiers] ENABLE CHANGE_TRACKING;

IF COL_LENGTH(N'dbo.cashiers', N'id') IS NULL ALTER TABLE dbo.[cashiers] ADD [id] uniqueidentifier NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.cashiers') AND c.name=N'id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[cashiers] ALTER COLUMN [id] uniqueidentifier NOT NULL;

IF COL_LENGTH(N'dbo.cashiers', N'username') IS NULL ALTER TABLE dbo.[cashiers] ADD [username] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.cashiers', N'full_name') IS NULL ALTER TABLE dbo.[cashiers] ADD [full_name] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.cashiers', N'pin_hash') IS NULL ALTER TABLE dbo.[cashiers] ADD [pin_hash] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.cashiers', N'store_id') IS NULL ALTER TABLE dbo.[cashiers] ADD [store_id] nvarchar(450) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.cashiers') AND c.name=N'store_id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[cashiers] ALTER COLUMN [store_id] nvarchar(450) NULL;

IF COL_LENGTH(N'dbo.cashiers', N'permissions') IS NULL ALTER TABLE dbo.[cashiers] ADD [permissions] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.cashiers', N'is_active') IS NULL ALTER TABLE dbo.[cashiers] ADD [is_active] bit NULL;

IF COL_LENGTH(N'dbo.cashiers', N'last_login_at') IS NULL ALTER TABLE dbo.[cashiers] ADD [last_login_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.cashiers', N'created_at') IS NULL ALTER TABLE dbo.[cashiers] ADD [created_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.cashiers', N'updated_at') IS NULL ALTER TABLE dbo.[cashiers] ADD [updated_at] datetimeoffset(7) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.cashiers') AND c.name=N'updated_at' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[cashiers] ALTER COLUMN [updated_at] datetimeoffset(7) NOT NULL;

IF COL_LENGTH(N'dbo.cashiers', N'role_slug') IS NULL ALTER TABLE dbo.[cashiers] ADD [role_slug] nvarchar(max) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.cashiers') AND name=N'IX_cashiers_store_id') CREATE INDEX [IX_cashiers_store_id] ON dbo.[cashiers]([store_id]);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.cashiers') AND name=N'IX_cashiers_updated_at') CREATE INDEX [IX_cashiers_updated_at] ON dbo.[cashiers]([updated_at]);

IF OBJECT_ID(N'dbo.coupon_events', N'U') IS NULL BEGIN CREATE TABLE dbo.[coupon_events] (

  [id] uniqueidentifier NOT NULL CONSTRAINT [DF_coupon_events_id] DEFAULT (NEWID()),
  [event_type] nvarchar(max) NOT NULL,
  [campaign_id] uniqueidentifier NULL,
  [campaign_name] nvarchar(max) NULL,
  [voucher_token] nvarchar(max) NULL,
  [member_id] uniqueidentifier NULL,
  [member_phone] nvarchar(max) NULL,
  [store_id] nvarchar(450) NULL,
  [terminal_id] nvarchar(max) NULL,
  [staff_name] nvarchar(max) NULL,
  [staff_role] nvarchar(max) NULL,
  [sale_id] nvarchar(max) NULL,
  [note] nvarchar(max) NULL,
  [created_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_coupon_events_created_at] DEFAULT (SYSDATETIMEOFFSET()),
  CONSTRAINT [PK_coupon_events] PRIMARY KEY ([id])

); END;

IF OBJECT_ID(N'dbo.coupon_events', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.change_tracking_tables WHERE object_id=OBJECT_ID(N'dbo.coupon_events')) ALTER TABLE dbo.[coupon_events] ENABLE CHANGE_TRACKING;

IF COL_LENGTH(N'dbo.coupon_events', N'id') IS NULL ALTER TABLE dbo.[coupon_events] ADD [id] uniqueidentifier NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.coupon_events') AND c.name=N'id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[coupon_events] ALTER COLUMN [id] uniqueidentifier NOT NULL;

IF COL_LENGTH(N'dbo.coupon_events', N'event_type') IS NULL ALTER TABLE dbo.[coupon_events] ADD [event_type] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.coupon_events', N'campaign_id') IS NULL ALTER TABLE dbo.[coupon_events] ADD [campaign_id] uniqueidentifier NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.coupon_events') AND c.name=N'campaign_id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[coupon_events] ALTER COLUMN [campaign_id] uniqueidentifier NULL;

IF COL_LENGTH(N'dbo.coupon_events', N'campaign_name') IS NULL ALTER TABLE dbo.[coupon_events] ADD [campaign_name] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.coupon_events', N'voucher_token') IS NULL ALTER TABLE dbo.[coupon_events] ADD [voucher_token] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.coupon_events', N'member_id') IS NULL ALTER TABLE dbo.[coupon_events] ADD [member_id] uniqueidentifier NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.coupon_events') AND c.name=N'member_id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[coupon_events] ALTER COLUMN [member_id] uniqueidentifier NULL;

IF COL_LENGTH(N'dbo.coupon_events', N'member_phone') IS NULL ALTER TABLE dbo.[coupon_events] ADD [member_phone] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.coupon_events', N'store_id') IS NULL ALTER TABLE dbo.[coupon_events] ADD [store_id] nvarchar(450) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.coupon_events') AND c.name=N'store_id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[coupon_events] ALTER COLUMN [store_id] nvarchar(450) NULL;

IF COL_LENGTH(N'dbo.coupon_events', N'terminal_id') IS NULL ALTER TABLE dbo.[coupon_events] ADD [terminal_id] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.coupon_events', N'staff_name') IS NULL ALTER TABLE dbo.[coupon_events] ADD [staff_name] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.coupon_events', N'staff_role') IS NULL ALTER TABLE dbo.[coupon_events] ADD [staff_role] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.coupon_events', N'sale_id') IS NULL ALTER TABLE dbo.[coupon_events] ADD [sale_id] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.coupon_events', N'note') IS NULL ALTER TABLE dbo.[coupon_events] ADD [note] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.coupon_events', N'created_at') IS NULL ALTER TABLE dbo.[coupon_events] ADD [created_at] datetimeoffset(7) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.coupon_events') AND name=N'IX_coupon_events_store_id') CREATE INDEX [IX_coupon_events_store_id] ON dbo.[coupon_events]([store_id]);

IF OBJECT_ID(N'dbo.drawer_events', N'U') IS NULL BEGIN CREATE TABLE dbo.[drawer_events] (

  [id] uniqueidentifier NOT NULL CONSTRAINT [DF_drawer_events_id] DEFAULT (NEWID()),
  [store_id] nvarchar(450) NULL,
  [terminal_id] nvarchar(max) NULL,
  [shift_id] nvarchar(max) NULL,
  [staff_id] nvarchar(max) NULL,
  [staff_name] nvarchar(max) NULL,
  [role] nvarchar(max) NULL,
  [reason] nvarchar(max) NOT NULL,
  [note] nvarchar(max) NULL,
  [approved_by] nvarchar(max) NULL,
  [created_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_drawer_events_created_at] DEFAULT (SYSDATETIMEOFFSET()),
  CONSTRAINT [PK_drawer_events] PRIMARY KEY ([id])

); END;

IF OBJECT_ID(N'dbo.drawer_events', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.change_tracking_tables WHERE object_id=OBJECT_ID(N'dbo.drawer_events')) ALTER TABLE dbo.[drawer_events] ENABLE CHANGE_TRACKING;

IF COL_LENGTH(N'dbo.drawer_events', N'id') IS NULL ALTER TABLE dbo.[drawer_events] ADD [id] uniqueidentifier NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.drawer_events') AND c.name=N'id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[drawer_events] ALTER COLUMN [id] uniqueidentifier NOT NULL;

IF COL_LENGTH(N'dbo.drawer_events', N'store_id') IS NULL ALTER TABLE dbo.[drawer_events] ADD [store_id] nvarchar(450) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.drawer_events') AND c.name=N'store_id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[drawer_events] ALTER COLUMN [store_id] nvarchar(450) NULL;

IF COL_LENGTH(N'dbo.drawer_events', N'terminal_id') IS NULL ALTER TABLE dbo.[drawer_events] ADD [terminal_id] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.drawer_events', N'shift_id') IS NULL ALTER TABLE dbo.[drawer_events] ADD [shift_id] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.drawer_events', N'staff_id') IS NULL ALTER TABLE dbo.[drawer_events] ADD [staff_id] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.drawer_events', N'staff_name') IS NULL ALTER TABLE dbo.[drawer_events] ADD [staff_name] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.drawer_events', N'role') IS NULL ALTER TABLE dbo.[drawer_events] ADD [role] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.drawer_events', N'reason') IS NULL ALTER TABLE dbo.[drawer_events] ADD [reason] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.drawer_events', N'note') IS NULL ALTER TABLE dbo.[drawer_events] ADD [note] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.drawer_events', N'approved_by') IS NULL ALTER TABLE dbo.[drawer_events] ADD [approved_by] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.drawer_events', N'created_at') IS NULL ALTER TABLE dbo.[drawer_events] ADD [created_at] datetimeoffset(7) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.drawer_events') AND name=N'IX_drawer_events_store_id') CREATE INDEX [IX_drawer_events_store_id] ON dbo.[drawer_events]([store_id]);

IF OBJECT_ID(N'dbo.held_orders', N'U') IS NULL BEGIN CREATE TABLE dbo.[held_orders] (

  [id] nvarchar(450) NOT NULL CONSTRAINT [DF_held_orders_id] DEFAULT (NEWID()),
  [label] nvarchar(max) NOT NULL CONSTRAINT [DF_held_orders_label] DEFAULT (''),
  [store_id] nvarchar(450) NULL,
  [shift_id] nvarchar(max) NULL,
  [held_by] nvarchar(max) NULL,
  [total] decimal(38,12) NOT NULL CONSTRAINT [DF_held_orders_total] DEFAULT (0),
  [lines] nvarchar(max) NOT NULL CONSTRAINT [DF_held_orders_lines] DEFAULT ('[]'),
  [cart_discount] decimal(38,12) NOT NULL CONSTRAINT [DF_held_orders_cart_discount] DEFAULT (0),
  [cart_discount_type] nvarchar(max) NOT NULL CONSTRAINT [DF_held_orders_cart_discount_type] DEFAULT ('amount'),
  [exchange_ref] nvarchar(max) NULL,
  [member_id] nvarchar(max) NULL,
  [member_name] nvarchar(max) NULL,
  [coupon] nvarchar(max) NULL,
  [note] nvarchar(max) NOT NULL CONSTRAINT [DF_held_orders_note] DEFAULT (''),
  [cancelled_from] nvarchar(max) NULL,
  [held_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_held_orders_held_at] DEFAULT (SYSDATETIMEOFFSET()),
  [created_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_held_orders_created_at] DEFAULT (SYSDATETIMEOFFSET()),
  [updated_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_held_orders_updated_at] DEFAULT (SYSDATETIMEOFFSET()),
  [row_version] int NOT NULL CONSTRAINT [DF_held_orders_row_version] DEFAULT (1),
  [status] nvarchar(max) NOT NULL,
  CONSTRAINT [PK_held_orders] PRIMARY KEY ([id])

); END;

IF OBJECT_ID(N'dbo.held_orders', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.change_tracking_tables WHERE object_id=OBJECT_ID(N'dbo.held_orders')) ALTER TABLE dbo.[held_orders] ENABLE CHANGE_TRACKING;

IF COL_LENGTH(N'dbo.held_orders', N'id') IS NULL ALTER TABLE dbo.[held_orders] ADD [id] nvarchar(450) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.held_orders') AND c.name=N'id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[held_orders] ALTER COLUMN [id] nvarchar(450) NOT NULL;

IF COL_LENGTH(N'dbo.held_orders', N'label') IS NULL ALTER TABLE dbo.[held_orders] ADD [label] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.held_orders', N'store_id') IS NULL ALTER TABLE dbo.[held_orders] ADD [store_id] nvarchar(450) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.held_orders') AND c.name=N'store_id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[held_orders] ALTER COLUMN [store_id] nvarchar(450) NULL;

IF COL_LENGTH(N'dbo.held_orders', N'shift_id') IS NULL ALTER TABLE dbo.[held_orders] ADD [shift_id] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.held_orders', N'held_by') IS NULL ALTER TABLE dbo.[held_orders] ADD [held_by] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.held_orders', N'total') IS NULL ALTER TABLE dbo.[held_orders] ADD [total] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.held_orders', N'lines') IS NULL ALTER TABLE dbo.[held_orders] ADD [lines] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.held_orders', N'cart_discount') IS NULL ALTER TABLE dbo.[held_orders] ADD [cart_discount] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.held_orders', N'cart_discount_type') IS NULL ALTER TABLE dbo.[held_orders] ADD [cart_discount_type] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.held_orders', N'exchange_ref') IS NULL ALTER TABLE dbo.[held_orders] ADD [exchange_ref] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.held_orders', N'member_id') IS NULL ALTER TABLE dbo.[held_orders] ADD [member_id] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.held_orders', N'member_name') IS NULL ALTER TABLE dbo.[held_orders] ADD [member_name] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.held_orders', N'coupon') IS NULL ALTER TABLE dbo.[held_orders] ADD [coupon] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.held_orders', N'note') IS NULL ALTER TABLE dbo.[held_orders] ADD [note] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.held_orders', N'cancelled_from') IS NULL ALTER TABLE dbo.[held_orders] ADD [cancelled_from] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.held_orders', N'held_at') IS NULL ALTER TABLE dbo.[held_orders] ADD [held_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.held_orders', N'created_at') IS NULL ALTER TABLE dbo.[held_orders] ADD [created_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.held_orders', N'updated_at') IS NULL ALTER TABLE dbo.[held_orders] ADD [updated_at] datetimeoffset(7) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.held_orders') AND c.name=N'updated_at' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[held_orders] ALTER COLUMN [updated_at] datetimeoffset(7) NOT NULL;

IF COL_LENGTH(N'dbo.held_orders', N'row_version') IS NULL ALTER TABLE dbo.[held_orders] ADD [row_version] int NULL;

IF COL_LENGTH(N'dbo.held_orders', N'status') IS NULL ALTER TABLE dbo.[held_orders] ADD [status] nvarchar(max) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.held_orders') AND name=N'IX_held_orders_store_id') CREATE INDEX [IX_held_orders_store_id] ON dbo.[held_orders]([store_id]);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.held_orders') AND name=N'IX_held_orders_updated_at') CREATE INDEX [IX_held_orders_updated_at] ON dbo.[held_orders]([updated_at]);

IF OBJECT_ID(N'dbo.integration_settings', N'U') IS NULL BEGIN CREATE TABLE dbo.[integration_settings] (

  [id] uniqueidentifier NOT NULL CONSTRAINT [DF_integration_settings_id] DEFAULT (NEWID()),
  [provider_name] nvarchar(max) NOT NULL,
  [api_keys_encrypted] nvarchar(max) NOT NULL CONSTRAINT [DF_integration_settings_api_keys_encrypted] DEFAULT (N'[]'),
  [verification_channel] nvarchar(max) NOT NULL CONSTRAINT [DF_integration_settings_verification_channel] DEFAULT ('whatsapp'),
  [strict_verification] bit NOT NULL CONSTRAINT [DF_integration_settings_strict_verification] DEFAULT (0),
  [is_active] bit NOT NULL CONSTRAINT [DF_integration_settings_is_active] DEFAULT (1),
  [updated_by] nvarchar(max) NULL,
  [created_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_integration_settings_created_at] DEFAULT (SYSDATETIMEOFFSET()),
  [updated_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_integration_settings_updated_at] DEFAULT (SYSDATETIMEOFFSET()),
  CONSTRAINT [PK_integration_settings] PRIMARY KEY ([id])

); END;

IF OBJECT_ID(N'dbo.integration_settings', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.change_tracking_tables WHERE object_id=OBJECT_ID(N'dbo.integration_settings')) ALTER TABLE dbo.[integration_settings] ENABLE CHANGE_TRACKING;

IF COL_LENGTH(N'dbo.integration_settings', N'id') IS NULL ALTER TABLE dbo.[integration_settings] ADD [id] uniqueidentifier NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.integration_settings') AND c.name=N'id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[integration_settings] ALTER COLUMN [id] uniqueidentifier NOT NULL;

IF COL_LENGTH(N'dbo.integration_settings', N'provider_name') IS NULL ALTER TABLE dbo.[integration_settings] ADD [provider_name] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.integration_settings', N'api_keys_encrypted') IS NULL ALTER TABLE dbo.[integration_settings] ADD [api_keys_encrypted] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.integration_settings', N'verification_channel') IS NULL ALTER TABLE dbo.[integration_settings] ADD [verification_channel] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.integration_settings', N'strict_verification') IS NULL ALTER TABLE dbo.[integration_settings] ADD [strict_verification] bit NULL;

IF COL_LENGTH(N'dbo.integration_settings', N'is_active') IS NULL ALTER TABLE dbo.[integration_settings] ADD [is_active] bit NULL;

IF COL_LENGTH(N'dbo.integration_settings', N'updated_by') IS NULL ALTER TABLE dbo.[integration_settings] ADD [updated_by] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.integration_settings', N'created_at') IS NULL ALTER TABLE dbo.[integration_settings] ADD [created_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.integration_settings', N'updated_at') IS NULL ALTER TABLE dbo.[integration_settings] ADD [updated_at] datetimeoffset(7) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.integration_settings') AND c.name=N'updated_at' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[integration_settings] ALTER COLUMN [updated_at] datetimeoffset(7) NOT NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.integration_settings') AND name=N'IX_integration_settings_updated_at') CREATE INDEX [IX_integration_settings_updated_at] ON dbo.[integration_settings]([updated_at]);

IF OBJECT_ID(N'dbo.item_activity_logs', N'U') IS NULL BEGIN CREATE TABLE dbo.[item_activity_logs] (

  [id] uniqueidentifier NOT NULL CONSTRAINT [DF_item_activity_logs_id] DEFAULT (NEWID()),
  [product_id] uniqueidentifier NULL,
  [product_name] nvarchar(max) NULL,
  [sku] nvarchar(max) NULL,
  [barcode] nvarchar(max) NULL,
  [store_id] nvarchar(450) NULL,
  [terminal_id] nvarchar(max) NULL,
  [activity_type] nvarchar(max) NOT NULL,
  [reference] nvarchar(max) NULL,
  [quantity_delta] int NOT NULL CONSTRAINT [DF_item_activity_logs_quantity_delta] DEFAULT (0),
  [stock_before] int NULL,
  [stock_after] int NULL,
  [unit_cost] decimal(38,12) NOT NULL CONSTRAINT [DF_item_activity_logs_unit_cost] DEFAULT (0),
  [staff_id] nvarchar(max) NULL,
  [staff_name] nvarchar(max) NULL,
  [role] nvarchar(max) NULL,
  [note] nvarchar(max) NOT NULL CONSTRAINT [DF_item_activity_logs_note] DEFAULT (''),
  [created_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_item_activity_logs_created_at] DEFAULT (SYSDATETIMEOFFSET()),
  [row_version] int NOT NULL CONSTRAINT [DF_item_activity_logs_row_version] DEFAULT (1),
  CONSTRAINT [PK_item_activity_logs] PRIMARY KEY ([id])

); END;

IF OBJECT_ID(N'dbo.item_activity_logs', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.change_tracking_tables WHERE object_id=OBJECT_ID(N'dbo.item_activity_logs')) ALTER TABLE dbo.[item_activity_logs] ENABLE CHANGE_TRACKING;

IF COL_LENGTH(N'dbo.item_activity_logs', N'id') IS NULL ALTER TABLE dbo.[item_activity_logs] ADD [id] uniqueidentifier NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.item_activity_logs') AND c.name=N'id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[item_activity_logs] ALTER COLUMN [id] uniqueidentifier NOT NULL;

IF COL_LENGTH(N'dbo.item_activity_logs', N'product_id') IS NULL ALTER TABLE dbo.[item_activity_logs] ADD [product_id] uniqueidentifier NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.item_activity_logs') AND c.name=N'product_id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[item_activity_logs] ALTER COLUMN [product_id] uniqueidentifier NULL;

IF COL_LENGTH(N'dbo.item_activity_logs', N'product_name') IS NULL ALTER TABLE dbo.[item_activity_logs] ADD [product_name] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.item_activity_logs', N'sku') IS NULL ALTER TABLE dbo.[item_activity_logs] ADD [sku] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.item_activity_logs', N'barcode') IS NULL ALTER TABLE dbo.[item_activity_logs] ADD [barcode] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.item_activity_logs', N'store_id') IS NULL ALTER TABLE dbo.[item_activity_logs] ADD [store_id] nvarchar(450) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.item_activity_logs') AND c.name=N'store_id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[item_activity_logs] ALTER COLUMN [store_id] nvarchar(450) NULL;

IF COL_LENGTH(N'dbo.item_activity_logs', N'terminal_id') IS NULL ALTER TABLE dbo.[item_activity_logs] ADD [terminal_id] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.item_activity_logs', N'activity_type') IS NULL ALTER TABLE dbo.[item_activity_logs] ADD [activity_type] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.item_activity_logs', N'reference') IS NULL ALTER TABLE dbo.[item_activity_logs] ADD [reference] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.item_activity_logs', N'quantity_delta') IS NULL ALTER TABLE dbo.[item_activity_logs] ADD [quantity_delta] int NULL;

IF COL_LENGTH(N'dbo.item_activity_logs', N'stock_before') IS NULL ALTER TABLE dbo.[item_activity_logs] ADD [stock_before] int NULL;

IF COL_LENGTH(N'dbo.item_activity_logs', N'stock_after') IS NULL ALTER TABLE dbo.[item_activity_logs] ADD [stock_after] int NULL;

IF COL_LENGTH(N'dbo.item_activity_logs', N'unit_cost') IS NULL ALTER TABLE dbo.[item_activity_logs] ADD [unit_cost] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.item_activity_logs', N'staff_id') IS NULL ALTER TABLE dbo.[item_activity_logs] ADD [staff_id] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.item_activity_logs', N'staff_name') IS NULL ALTER TABLE dbo.[item_activity_logs] ADD [staff_name] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.item_activity_logs', N'role') IS NULL ALTER TABLE dbo.[item_activity_logs] ADD [role] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.item_activity_logs', N'note') IS NULL ALTER TABLE dbo.[item_activity_logs] ADD [note] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.item_activity_logs', N'created_at') IS NULL ALTER TABLE dbo.[item_activity_logs] ADD [created_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.item_activity_logs', N'row_version') IS NULL ALTER TABLE dbo.[item_activity_logs] ADD [row_version] int NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.item_activity_logs') AND name=N'IX_item_activity_logs_store_id') CREATE INDEX [IX_item_activity_logs_store_id] ON dbo.[item_activity_logs]([store_id]);

IF OBJECT_ID(N'dbo.member_verifications', N'U') IS NULL BEGIN CREATE TABLE dbo.[member_verifications] (

  [id] uniqueidentifier NOT NULL CONSTRAINT [DF_member_verifications_id] DEFAULT (NEWID()),
  [member_id] uniqueidentifier NULL,
  [phone] nvarchar(max) NULL,
  [email] nvarchar(max) NULL,
  [channel] nvarchar(max) NOT NULL CONSTRAINT [DF_member_verifications_channel] DEFAULT ('whatsapp'),
  [otp_code] nvarchar(max) NULL,
  [attempts] int NOT NULL CONSTRAINT [DF_member_verifications_attempts] DEFAULT (0),
  [status] nvarchar(max) NOT NULL CONSTRAINT [DF_member_verifications_status] DEFAULT ('pending'),
  [sent_by] nvarchar(max) NULL,
  [store_id] nvarchar(450) NULL,
  [expires_at] datetimeoffset(7) NOT NULL,
  [verified_at] datetimeoffset(7) NULL,
  [created_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_member_verifications_created_at] DEFAULT (SYSDATETIMEOFFSET()),
  CONSTRAINT [PK_member_verifications] PRIMARY KEY ([id])

); END;

IF OBJECT_ID(N'dbo.member_verifications', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.change_tracking_tables WHERE object_id=OBJECT_ID(N'dbo.member_verifications')) ALTER TABLE dbo.[member_verifications] ENABLE CHANGE_TRACKING;

IF COL_LENGTH(N'dbo.member_verifications', N'id') IS NULL ALTER TABLE dbo.[member_verifications] ADD [id] uniqueidentifier NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.member_verifications') AND c.name=N'id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[member_verifications] ALTER COLUMN [id] uniqueidentifier NOT NULL;

IF COL_LENGTH(N'dbo.member_verifications', N'member_id') IS NULL ALTER TABLE dbo.[member_verifications] ADD [member_id] uniqueidentifier NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.member_verifications') AND c.name=N'member_id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[member_verifications] ALTER COLUMN [member_id] uniqueidentifier NULL;

IF COL_LENGTH(N'dbo.member_verifications', N'phone') IS NULL ALTER TABLE dbo.[member_verifications] ADD [phone] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.member_verifications', N'email') IS NULL ALTER TABLE dbo.[member_verifications] ADD [email] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.member_verifications', N'channel') IS NULL ALTER TABLE dbo.[member_verifications] ADD [channel] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.member_verifications', N'otp_code') IS NULL ALTER TABLE dbo.[member_verifications] ADD [otp_code] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.member_verifications', N'attempts') IS NULL ALTER TABLE dbo.[member_verifications] ADD [attempts] int NULL;

IF COL_LENGTH(N'dbo.member_verifications', N'status') IS NULL ALTER TABLE dbo.[member_verifications] ADD [status] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.member_verifications', N'sent_by') IS NULL ALTER TABLE dbo.[member_verifications] ADD [sent_by] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.member_verifications', N'store_id') IS NULL ALTER TABLE dbo.[member_verifications] ADD [store_id] nvarchar(450) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.member_verifications') AND c.name=N'store_id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[member_verifications] ALTER COLUMN [store_id] nvarchar(450) NULL;

IF COL_LENGTH(N'dbo.member_verifications', N'expires_at') IS NULL ALTER TABLE dbo.[member_verifications] ADD [expires_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.member_verifications', N'verified_at') IS NULL ALTER TABLE dbo.[member_verifications] ADD [verified_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.member_verifications', N'created_at') IS NULL ALTER TABLE dbo.[member_verifications] ADD [created_at] datetimeoffset(7) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.member_verifications') AND name=N'IX_member_verifications_store_id') CREATE INDEX [IX_member_verifications_store_id] ON dbo.[member_verifications]([store_id]);

IF OBJECT_ID(N'dbo.members', N'U') IS NULL BEGIN CREATE TABLE dbo.[members] (

  [id] uniqueidentifier NOT NULL CONSTRAINT [DF_members_id] DEFAULT (NEWID()),
  [member_code] nvarchar(450) NOT NULL,
  [full_name] nvarchar(max) NOT NULL,
  [phone] nvarchar(450) NOT NULL,
  [email] nvarchar(max) NULL,
  [address] nvarchar(max) NULL,
  [date_of_birth] date NULL,
  [tier_id] uniqueidentifier NULL,
  [loyalty_points] decimal(38,12) NOT NULL CONSTRAINT [DF_members_loyalty_points] DEFAULT (0),
  [total_spent] decimal(38,12) NOT NULL CONSTRAINT [DF_members_total_spent] DEFAULT (0),
  [created_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_members_created_at] DEFAULT (SYSDATETIMEOFFSET()),
  [updated_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_members_updated_at] DEFAULT (SYSDATETIMEOFFSET()),
  [row_version] int NOT NULL CONSTRAINT [DF_members_row_version] DEFAULT (1),
  [is_verified] bit NOT NULL CONSTRAINT [DF_members_is_verified] DEFAULT (0),
  [verified_at] datetimeoffset(7) NULL,
  [verified_channel] nvarchar(max) NULL,
  CONSTRAINT [PK_members] PRIMARY KEY ([id])

); END;

IF OBJECT_ID(N'dbo.members', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.change_tracking_tables WHERE object_id=OBJECT_ID(N'dbo.members')) ALTER TABLE dbo.[members] ENABLE CHANGE_TRACKING;

IF COL_LENGTH(N'dbo.members', N'id') IS NULL ALTER TABLE dbo.[members] ADD [id] uniqueidentifier NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.members') AND c.name=N'id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[members] ALTER COLUMN [id] uniqueidentifier NOT NULL;

IF COL_LENGTH(N'dbo.members', N'member_code') IS NULL ALTER TABLE dbo.[members] ADD [member_code] nvarchar(450) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.members') AND c.name=N'member_code' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[members] ALTER COLUMN [member_code] nvarchar(450) NOT NULL;

IF COL_LENGTH(N'dbo.members', N'full_name') IS NULL ALTER TABLE dbo.[members] ADD [full_name] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.members', N'phone') IS NULL ALTER TABLE dbo.[members] ADD [phone] nvarchar(450) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.members') AND c.name=N'phone' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[members] ALTER COLUMN [phone] nvarchar(450) NOT NULL;

IF COL_LENGTH(N'dbo.members', N'email') IS NULL ALTER TABLE dbo.[members] ADD [email] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.members', N'address') IS NULL ALTER TABLE dbo.[members] ADD [address] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.members', N'date_of_birth') IS NULL ALTER TABLE dbo.[members] ADD [date_of_birth] date NULL;

IF COL_LENGTH(N'dbo.members', N'tier_id') IS NULL ALTER TABLE dbo.[members] ADD [tier_id] uniqueidentifier NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.members') AND c.name=N'tier_id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[members] ALTER COLUMN [tier_id] uniqueidentifier NULL;

IF COL_LENGTH(N'dbo.members', N'loyalty_points') IS NULL ALTER TABLE dbo.[members] ADD [loyalty_points] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.members', N'total_spent') IS NULL ALTER TABLE dbo.[members] ADD [total_spent] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.members', N'created_at') IS NULL ALTER TABLE dbo.[members] ADD [created_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.members', N'updated_at') IS NULL ALTER TABLE dbo.[members] ADD [updated_at] datetimeoffset(7) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.members') AND c.name=N'updated_at' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[members] ALTER COLUMN [updated_at] datetimeoffset(7) NOT NULL;

IF COL_LENGTH(N'dbo.members', N'row_version') IS NULL ALTER TABLE dbo.[members] ADD [row_version] int NULL;

IF COL_LENGTH(N'dbo.members', N'is_verified') IS NULL ALTER TABLE dbo.[members] ADD [is_verified] bit NULL;

IF COL_LENGTH(N'dbo.members', N'verified_at') IS NULL ALTER TABLE dbo.[members] ADD [verified_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.members', N'verified_channel') IS NULL ALTER TABLE dbo.[members] ADD [verified_channel] nvarchar(max) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.members') AND name=N'UX_members_member_code') CREATE UNIQUE INDEX [UX_members_member_code] ON dbo.[members]([member_code]);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.members') AND name=N'UX_members_phone') CREATE UNIQUE INDEX [UX_members_phone] ON dbo.[members]([phone]);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.members') AND name=N'IX_members_updated_at') CREATE INDEX [IX_members_updated_at] ON dbo.[members]([updated_at]);

IF OBJECT_ID(N'dbo.membership_tiers', N'U') IS NULL BEGIN CREATE TABLE dbo.[membership_tiers] (

  [id] uniqueidentifier NOT NULL CONSTRAINT [DF_membership_tiers_id] DEFAULT (NEWID()),
  [name] nvarchar(450) NOT NULL,
  [discount_percentage] decimal(38,12) NOT NULL CONSTRAINT [DF_membership_tiers_discount_percentage] DEFAULT (0),
  [points_multiplier] decimal(38,12) NOT NULL CONSTRAINT [DF_membership_tiers_points_multiplier] DEFAULT (1.0),
  [created_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_membership_tiers_created_at] DEFAULT (SYSDATETIMEOFFSET()),
  [updated_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_membership_tiers_updated_at] DEFAULT (SYSDATETIMEOFFSET()),
  [row_version] int NOT NULL CONSTRAINT [DF_membership_tiers_row_version] DEFAULT (1),
  CONSTRAINT [PK_membership_tiers] PRIMARY KEY ([id])

); END;

IF OBJECT_ID(N'dbo.membership_tiers', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.change_tracking_tables WHERE object_id=OBJECT_ID(N'dbo.membership_tiers')) ALTER TABLE dbo.[membership_tiers] ENABLE CHANGE_TRACKING;

IF COL_LENGTH(N'dbo.membership_tiers', N'id') IS NULL ALTER TABLE dbo.[membership_tiers] ADD [id] uniqueidentifier NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.membership_tiers') AND c.name=N'id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[membership_tiers] ALTER COLUMN [id] uniqueidentifier NOT NULL;

IF COL_LENGTH(N'dbo.membership_tiers', N'name') IS NULL ALTER TABLE dbo.[membership_tiers] ADD [name] nvarchar(450) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.membership_tiers') AND c.name=N'name' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[membership_tiers] ALTER COLUMN [name] nvarchar(450) NOT NULL;

IF COL_LENGTH(N'dbo.membership_tiers', N'discount_percentage') IS NULL ALTER TABLE dbo.[membership_tiers] ADD [discount_percentage] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.membership_tiers', N'points_multiplier') IS NULL ALTER TABLE dbo.[membership_tiers] ADD [points_multiplier] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.membership_tiers', N'created_at') IS NULL ALTER TABLE dbo.[membership_tiers] ADD [created_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.membership_tiers', N'updated_at') IS NULL ALTER TABLE dbo.[membership_tiers] ADD [updated_at] datetimeoffset(7) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.membership_tiers') AND c.name=N'updated_at' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[membership_tiers] ALTER COLUMN [updated_at] datetimeoffset(7) NOT NULL;

IF COL_LENGTH(N'dbo.membership_tiers', N'row_version') IS NULL ALTER TABLE dbo.[membership_tiers] ADD [row_version] int NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.membership_tiers') AND name=N'UX_membership_tiers_name') CREATE UNIQUE INDEX [UX_membership_tiers_name] ON dbo.[membership_tiers]([name]);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.membership_tiers') AND name=N'IX_membership_tiers_updated_at') CREATE INDEX [IX_membership_tiers_updated_at] ON dbo.[membership_tiers]([updated_at]);

IF OBJECT_ID(N'dbo.offline_sync_audit_log', N'U') IS NULL BEGIN CREATE TABLE dbo.[offline_sync_audit_log] (

  [id] uniqueidentifier NOT NULL CONSTRAINT [DF_offline_sync_audit_log_id] DEFAULT (NEWID()),
  [terminal_id] nvarchar(max) NULL,
  [store_id] nvarchar(450) NULL,
  [direction] nvarchar(max) NOT NULL,
  [table_name] nvarchar(max) NOT NULL,
  [record_id] nvarchar(max) NULL,
  [records] int NOT NULL CONSTRAINT [DF_offline_sync_audit_log_records] DEFAULT (0),
  [status] nvarchar(max) NOT NULL CONSTRAINT [DF_offline_sync_audit_log_status] DEFAULT ('ok'),
  [error_message] nvarchar(max) NULL,
  [started_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_offline_sync_audit_log_started_at] DEFAULT (SYSDATETIMEOFFSET()),
  [finished_at] datetimeoffset(7) NULL,
  [created_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_offline_sync_audit_log_created_at] DEFAULT (SYSDATETIMEOFFSET()),
  CONSTRAINT [PK_offline_sync_audit_log] PRIMARY KEY ([id])

); END;

IF OBJECT_ID(N'dbo.offline_sync_audit_log', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.change_tracking_tables WHERE object_id=OBJECT_ID(N'dbo.offline_sync_audit_log')) ALTER TABLE dbo.[offline_sync_audit_log] ENABLE CHANGE_TRACKING;

IF COL_LENGTH(N'dbo.offline_sync_audit_log', N'id') IS NULL ALTER TABLE dbo.[offline_sync_audit_log] ADD [id] uniqueidentifier NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.offline_sync_audit_log') AND c.name=N'id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[offline_sync_audit_log] ALTER COLUMN [id] uniqueidentifier NOT NULL;

IF COL_LENGTH(N'dbo.offline_sync_audit_log', N'terminal_id') IS NULL ALTER TABLE dbo.[offline_sync_audit_log] ADD [terminal_id] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.offline_sync_audit_log', N'store_id') IS NULL ALTER TABLE dbo.[offline_sync_audit_log] ADD [store_id] nvarchar(450) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.offline_sync_audit_log') AND c.name=N'store_id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[offline_sync_audit_log] ALTER COLUMN [store_id] nvarchar(450) NULL;

IF COL_LENGTH(N'dbo.offline_sync_audit_log', N'direction') IS NULL ALTER TABLE dbo.[offline_sync_audit_log] ADD [direction] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.offline_sync_audit_log', N'table_name') IS NULL ALTER TABLE dbo.[offline_sync_audit_log] ADD [table_name] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.offline_sync_audit_log', N'record_id') IS NULL ALTER TABLE dbo.[offline_sync_audit_log] ADD [record_id] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.offline_sync_audit_log', N'records') IS NULL ALTER TABLE dbo.[offline_sync_audit_log] ADD [records] int NULL;

IF COL_LENGTH(N'dbo.offline_sync_audit_log', N'status') IS NULL ALTER TABLE dbo.[offline_sync_audit_log] ADD [status] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.offline_sync_audit_log', N'error_message') IS NULL ALTER TABLE dbo.[offline_sync_audit_log] ADD [error_message] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.offline_sync_audit_log', N'started_at') IS NULL ALTER TABLE dbo.[offline_sync_audit_log] ADD [started_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.offline_sync_audit_log', N'finished_at') IS NULL ALTER TABLE dbo.[offline_sync_audit_log] ADD [finished_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.offline_sync_audit_log', N'created_at') IS NULL ALTER TABLE dbo.[offline_sync_audit_log] ADD [created_at] datetimeoffset(7) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.offline_sync_audit_log') AND name=N'IX_offline_sync_audit_log_store_id') CREATE INDEX [IX_offline_sync_audit_log_store_id] ON dbo.[offline_sync_audit_log]([store_id]);

IF OBJECT_ID(N'dbo.payment_transactions', N'U') IS NULL BEGIN CREATE TABLE dbo.[payment_transactions] (

  [id] uniqueidentifier NOT NULL CONSTRAINT [DF_payment_transactions_id] DEFAULT (NEWID()),
  [source_type] nvarchar(max) NOT NULL,
  [sale_id] uniqueidentifier NULL,
  [booking_id] uniqueidentifier NULL,
  [member_id] uniqueidentifier NULL,
  [store_id] nvarchar(450) NULL,
  [shift_id] nvarchar(max) NULL,
  [terminal_id] nvarchar(max) NULL,
  [amount] decimal(38,12) NOT NULL CONSTRAINT [DF_payment_transactions_amount] DEFAULT (0),
  [method] nvarchar(max) NOT NULL CONSTRAINT [DF_payment_transactions_method] DEFAULT ('cash'),
  [kind] nvarchar(max) NOT NULL CONSTRAINT [DF_payment_transactions_kind] DEFAULT ('payment'),
  [reference] nvarchar(max) NULL,
  [cashier_id] nvarchar(max) NULL,
  [cashier_name] nvarchar(max) NULL,
  [note] nvarchar(max) NOT NULL CONSTRAINT [DF_payment_transactions_note] DEFAULT (''),
  [paid_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_payment_transactions_paid_at] DEFAULT (SYSDATETIMEOFFSET()),
  [created_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_payment_transactions_created_at] DEFAULT (SYSDATETIMEOFFSET()),
  [updated_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_payment_transactions_updated_at] DEFAULT (SYSDATETIMEOFFSET()),
  [row_version] int NOT NULL CONSTRAINT [DF_payment_transactions_row_version] DEFAULT (1),
  [status] nvarchar(max) NULL CONSTRAINT [DF_payment_transactions_status] DEFAULT ('completed'),
  [metadata] nvarchar(max) NULL CONSTRAINT [DF_payment_transactions_metadata] DEFAULT (N'[]'),
  CONSTRAINT [PK_payment_transactions] PRIMARY KEY ([id])

); END;

IF OBJECT_ID(N'dbo.payment_transactions', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.change_tracking_tables WHERE object_id=OBJECT_ID(N'dbo.payment_transactions')) ALTER TABLE dbo.[payment_transactions] ENABLE CHANGE_TRACKING;

IF COL_LENGTH(N'dbo.payment_transactions', N'id') IS NULL ALTER TABLE dbo.[payment_transactions] ADD [id] uniqueidentifier NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.payment_transactions') AND c.name=N'id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[payment_transactions] ALTER COLUMN [id] uniqueidentifier NOT NULL;

IF COL_LENGTH(N'dbo.payment_transactions', N'source_type') IS NULL ALTER TABLE dbo.[payment_transactions] ADD [source_type] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.payment_transactions', N'sale_id') IS NULL ALTER TABLE dbo.[payment_transactions] ADD [sale_id] uniqueidentifier NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.payment_transactions') AND c.name=N'sale_id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[payment_transactions] ALTER COLUMN [sale_id] uniqueidentifier NULL;

IF COL_LENGTH(N'dbo.payment_transactions', N'booking_id') IS NULL ALTER TABLE dbo.[payment_transactions] ADD [booking_id] uniqueidentifier NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.payment_transactions') AND c.name=N'booking_id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[payment_transactions] ALTER COLUMN [booking_id] uniqueidentifier NULL;

IF COL_LENGTH(N'dbo.payment_transactions', N'member_id') IS NULL ALTER TABLE dbo.[payment_transactions] ADD [member_id] uniqueidentifier NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.payment_transactions') AND c.name=N'member_id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[payment_transactions] ALTER COLUMN [member_id] uniqueidentifier NULL;

IF COL_LENGTH(N'dbo.payment_transactions', N'store_id') IS NULL ALTER TABLE dbo.[payment_transactions] ADD [store_id] nvarchar(450) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.payment_transactions') AND c.name=N'store_id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[payment_transactions] ALTER COLUMN [store_id] nvarchar(450) NULL;

IF COL_LENGTH(N'dbo.payment_transactions', N'shift_id') IS NULL ALTER TABLE dbo.[payment_transactions] ADD [shift_id] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.payment_transactions', N'terminal_id') IS NULL ALTER TABLE dbo.[payment_transactions] ADD [terminal_id] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.payment_transactions', N'amount') IS NULL ALTER TABLE dbo.[payment_transactions] ADD [amount] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.payment_transactions', N'method') IS NULL ALTER TABLE dbo.[payment_transactions] ADD [method] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.payment_transactions', N'kind') IS NULL ALTER TABLE dbo.[payment_transactions] ADD [kind] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.payment_transactions', N'reference') IS NULL ALTER TABLE dbo.[payment_transactions] ADD [reference] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.payment_transactions', N'cashier_id') IS NULL ALTER TABLE dbo.[payment_transactions] ADD [cashier_id] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.payment_transactions', N'cashier_name') IS NULL ALTER TABLE dbo.[payment_transactions] ADD [cashier_name] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.payment_transactions', N'note') IS NULL ALTER TABLE dbo.[payment_transactions] ADD [note] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.payment_transactions', N'paid_at') IS NULL ALTER TABLE dbo.[payment_transactions] ADD [paid_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.payment_transactions', N'created_at') IS NULL ALTER TABLE dbo.[payment_transactions] ADD [created_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.payment_transactions', N'updated_at') IS NULL ALTER TABLE dbo.[payment_transactions] ADD [updated_at] datetimeoffset(7) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.payment_transactions') AND c.name=N'updated_at' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[payment_transactions] ALTER COLUMN [updated_at] datetimeoffset(7) NOT NULL;

IF COL_LENGTH(N'dbo.payment_transactions', N'row_version') IS NULL ALTER TABLE dbo.[payment_transactions] ADD [row_version] int NULL;

IF COL_LENGTH(N'dbo.payment_transactions', N'status') IS NULL ALTER TABLE dbo.[payment_transactions] ADD [status] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.payment_transactions', N'metadata') IS NULL ALTER TABLE dbo.[payment_transactions] ADD [metadata] nvarchar(max) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.payment_transactions') AND name=N'IX_payment_transactions_store_id') CREATE INDEX [IX_payment_transactions_store_id] ON dbo.[payment_transactions]([store_id]);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.payment_transactions') AND name=N'IX_payment_transactions_updated_at') CREATE INDEX [IX_payment_transactions_updated_at] ON dbo.[payment_transactions]([updated_at]);

IF OBJECT_ID(N'dbo.payment_types', N'U') IS NULL BEGIN CREATE TABLE dbo.[payment_types] (

  [id] uniqueidentifier NOT NULL CONSTRAINT [DF_payment_types_id] DEFAULT (NEWID()),
  [name] nvarchar(max) NOT NULL,
  [type_code] nvarchar(450) NOT NULL,
  [requires_reference] bit NOT NULL CONSTRAINT [DF_payment_types_requires_reference] DEFAULT (0),
  [is_active] bit NOT NULL CONSTRAINT [DF_payment_types_is_active] DEFAULT (1),
  [icon] nvarchar(max) NOT NULL CONSTRAINT [DF_payment_types_icon] DEFAULT ('Wallet'),
  [sort_order] int NOT NULL CONSTRAINT [DF_payment_types_sort_order] DEFAULT (0),
  [is_system] bit NOT NULL CONSTRAINT [DF_payment_types_is_system] DEFAULT (0),
  [created_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_payment_types_created_at] DEFAULT (SYSDATETIMEOFFSET()),
  [updated_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_payment_types_updated_at] DEFAULT (SYSDATETIMEOFFSET()),
  [row_version] int NOT NULL CONSTRAINT [DF_payment_types_row_version] DEFAULT (1),
  CONSTRAINT [PK_payment_types] PRIMARY KEY ([id])

); END;

IF OBJECT_ID(N'dbo.payment_types', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.change_tracking_tables WHERE object_id=OBJECT_ID(N'dbo.payment_types')) ALTER TABLE dbo.[payment_types] ENABLE CHANGE_TRACKING;

IF COL_LENGTH(N'dbo.payment_types', N'id') IS NULL ALTER TABLE dbo.[payment_types] ADD [id] uniqueidentifier NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.payment_types') AND c.name=N'id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[payment_types] ALTER COLUMN [id] uniqueidentifier NOT NULL;

IF COL_LENGTH(N'dbo.payment_types', N'name') IS NULL ALTER TABLE dbo.[payment_types] ADD [name] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.payment_types', N'type_code') IS NULL ALTER TABLE dbo.[payment_types] ADD [type_code] nvarchar(450) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.payment_types') AND c.name=N'type_code' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[payment_types] ALTER COLUMN [type_code] nvarchar(450) NOT NULL;

IF COL_LENGTH(N'dbo.payment_types', N'requires_reference') IS NULL ALTER TABLE dbo.[payment_types] ADD [requires_reference] bit NULL;

IF COL_LENGTH(N'dbo.payment_types', N'is_active') IS NULL ALTER TABLE dbo.[payment_types] ADD [is_active] bit NULL;

IF COL_LENGTH(N'dbo.payment_types', N'icon') IS NULL ALTER TABLE dbo.[payment_types] ADD [icon] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.payment_types', N'sort_order') IS NULL ALTER TABLE dbo.[payment_types] ADD [sort_order] int NULL;

IF COL_LENGTH(N'dbo.payment_types', N'is_system') IS NULL ALTER TABLE dbo.[payment_types] ADD [is_system] bit NULL;

IF COL_LENGTH(N'dbo.payment_types', N'created_at') IS NULL ALTER TABLE dbo.[payment_types] ADD [created_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.payment_types', N'updated_at') IS NULL ALTER TABLE dbo.[payment_types] ADD [updated_at] datetimeoffset(7) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.payment_types') AND c.name=N'updated_at' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[payment_types] ALTER COLUMN [updated_at] datetimeoffset(7) NOT NULL;

IF COL_LENGTH(N'dbo.payment_types', N'row_version') IS NULL ALTER TABLE dbo.[payment_types] ADD [row_version] int NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.payment_types') AND name=N'UX_payment_types_type_code') CREATE UNIQUE INDEX [UX_payment_types_type_code] ON dbo.[payment_types]([type_code]);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.payment_types') AND name=N'IX_payment_types_updated_at') CREATE INDEX [IX_payment_types_updated_at] ON dbo.[payment_types]([updated_at]);

IF OBJECT_ID(N'dbo.pin_attempts', N'U') IS NULL BEGIN CREATE TABLE dbo.[pin_attempts] (

  [key] nvarchar(450) NOT NULL,
  [attempts] int NOT NULL CONSTRAINT [DF_pin_attempts_attempts] DEFAULT (0),
  [window_started_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_pin_attempts_window_started_at] DEFAULT (SYSDATETIMEOFFSET()),
  [locked_until] datetimeoffset(7) NULL,
  [created_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_pin_attempts_created_at] DEFAULT (SYSDATETIMEOFFSET()),
  [updated_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_pin_attempts_updated_at] DEFAULT (SYSDATETIMEOFFSET()),
  CONSTRAINT [PK_pin_attempts] PRIMARY KEY ([key])

); END;

IF OBJECT_ID(N'dbo.pin_attempts', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.change_tracking_tables WHERE object_id=OBJECT_ID(N'dbo.pin_attempts')) ALTER TABLE dbo.[pin_attempts] ENABLE CHANGE_TRACKING;

IF COL_LENGTH(N'dbo.pin_attempts', N'key') IS NULL ALTER TABLE dbo.[pin_attempts] ADD [key] nvarchar(450) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.pin_attempts') AND c.name=N'key' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[pin_attempts] ALTER COLUMN [key] nvarchar(450) NOT NULL;

IF COL_LENGTH(N'dbo.pin_attempts', N'attempts') IS NULL ALTER TABLE dbo.[pin_attempts] ADD [attempts] int NULL;

IF COL_LENGTH(N'dbo.pin_attempts', N'window_started_at') IS NULL ALTER TABLE dbo.[pin_attempts] ADD [window_started_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.pin_attempts', N'locked_until') IS NULL ALTER TABLE dbo.[pin_attempts] ADD [locked_until] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.pin_attempts', N'created_at') IS NULL ALTER TABLE dbo.[pin_attempts] ADD [created_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.pin_attempts', N'updated_at') IS NULL ALTER TABLE dbo.[pin_attempts] ADD [updated_at] datetimeoffset(7) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.pin_attempts') AND c.name=N'updated_at' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[pin_attempts] ALTER COLUMN [updated_at] datetimeoffset(7) NOT NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.pin_attempts') AND name=N'IX_pin_attempts_updated_at') CREATE INDEX [IX_pin_attempts_updated_at] ON dbo.[pin_attempts]([updated_at]);

IF OBJECT_ID(N'dbo.pos_settings', N'U') IS NULL BEGIN CREATE TABLE dbo.[pos_settings] (

  [id] int NOT NULL CONSTRAINT [DF_pos_settings_id] DEFAULT (1),
  [tax_percentage] decimal(38,12) NOT NULL CONSTRAINT [DF_pos_settings_tax_percentage] DEFAULT (0),
  [enable_tax] bit NOT NULL CONSTRAINT [DF_pos_settings_enable_tax] DEFAULT (1),
  [tax_mode] nvarchar(max) NOT NULL CONSTRAINT [DF_pos_settings_tax_mode] DEFAULT ('exclusive'),
  [paper_size] nvarchar(max) NOT NULL CONSTRAINT [DF_pos_settings_paper_size] DEFAULT ('80mm'),
  [header_text] nvarchar(max) NULL,
  [footer_text] nvarchar(max) NULL,
  [show_logo] bit NOT NULL CONSTRAINT [DF_pos_settings_show_logo] DEFAULT (1),
  [show_points] bit NOT NULL CONSTRAINT [DF_pos_settings_show_points] DEFAULT (1),
  [show_barcode] bit NOT NULL CONSTRAINT [DF_pos_settings_show_barcode] DEFAULT (1),
  [show_tax_details] bit NOT NULL CONSTRAINT [DF_pos_settings_show_tax_details] DEFAULT (1),
  [updated_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_pos_settings_updated_at] DEFAULT (SYSDATETIMEOFFSET()),
  [company_name] nvarchar(max) NOT NULL CONSTRAINT [DF_pos_settings_company_name] DEFAULT ('RETAIL'),
  [tax_number] nvarchar(max) NULL,
  [reg_number] nvarchar(max) NULL,
  [phone] nvarchar(max) NULL,
  [website] nvarchar(max) NULL,
  [fonts] nvarchar(max) NOT NULL CONSTRAINT [DF_pos_settings_fonts] DEFAULT (N'[]'),
  [custom_lines] nvarchar(max) NOT NULL CONSTRAINT [DF_pos_settings_custom_lines] DEFAULT ('[]'),
  [qr] nvarchar(max) NOT NULL CONSTRAINT [DF_pos_settings_qr] DEFAULT (N'[]'),
  [review_max_voids] int NOT NULL CONSTRAINT [DF_pos_settings_review_max_voids] DEFAULT (5),
  [review_max_refunds] int NOT NULL CONSTRAINT [DF_pos_settings_review_max_refunds] DEFAULT (3),
  [review_max_refund_value] decimal(38,12) NOT NULL CONSTRAINT [DF_pos_settings_review_max_refund_value] DEFAULT (200),
  [review_max_nosale] int NOT NULL CONSTRAINT [DF_pos_settings_review_max_nosale] DEFAULT (5),
  [review_max_discount_pct] decimal(38,12) NOT NULL CONSTRAINT [DF_pos_settings_review_max_discount_pct] DEFAULT (15),
  [day_start_time] nvarchar(max) NOT NULL CONSTRAINT [DF_pos_settings_day_start_time] DEFAULT ('09:00'),
  [day_end_time] nvarchar(max) NOT NULL CONSTRAINT [DF_pos_settings_day_end_time] DEFAULT ('22:00'),
  [max_shift_hours] decimal(38,12) NOT NULL CONSTRAINT [DF_pos_settings_max_shift_hours] DEFAULT (12),
  [shift_reminder_minutes] int NOT NULL CONSTRAINT [DF_pos_settings_shift_reminder_minutes] DEFAULT (30),
  [ui_visibility] nvarchar(max) NOT NULL CONSTRAINT [DF_pos_settings_ui_visibility] DEFAULT (N'[]'),
  [integration_settings] nvarchar(max) NOT NULL CONSTRAINT [DF_pos_settings_integration_settings] DEFAULT (N'[]'),
  [region_country] nvarchar(max) NOT NULL CONSTRAINT [DF_pos_settings_region_country] DEFAULT (''),
  [time_zone] nvarchar(max) NOT NULL CONSTRAINT [DF_pos_settings_time_zone] DEFAULT (''),
  [date_format] nvarchar(max) NOT NULL CONSTRAINT [DF_pos_settings_date_format] DEFAULT ('dd/MM/yyyy'),
  [time_format] nvarchar(max) NOT NULL CONSTRAINT [DF_pos_settings_time_format] DEFAULT ('24h'),
  [booking_slip] nvarchar(max) NOT NULL CONSTRAINT [DF_pos_settings_booking_slip] DEFAULT (N'[]'),
  [notification_settings] nvarchar(max) NOT NULL CONSTRAINT [DF_pos_settings_notification_settings] DEFAULT (N'[]'),
  [row_version] int NOT NULL CONSTRAINT [DF_pos_settings_row_version] DEFAULT (1),
  [logo_data_url] nvarchar(max) NULL,
  [receipt_design] nvarchar(max) NOT NULL CONSTRAINT [DF_pos_settings_receipt_design] DEFAULT (N'[]'),
  CONSTRAINT [PK_pos_settings] PRIMARY KEY ([id])

); END;

IF OBJECT_ID(N'dbo.pos_settings', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.change_tracking_tables WHERE object_id=OBJECT_ID(N'dbo.pos_settings')) ALTER TABLE dbo.[pos_settings] ENABLE CHANGE_TRACKING;

IF COL_LENGTH(N'dbo.pos_settings', N'id') IS NULL ALTER TABLE dbo.[pos_settings] ADD [id] int NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.pos_settings') AND c.name=N'id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[pos_settings] ALTER COLUMN [id] int NOT NULL;

IF COL_LENGTH(N'dbo.pos_settings', N'tax_percentage') IS NULL ALTER TABLE dbo.[pos_settings] ADD [tax_percentage] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.pos_settings', N'enable_tax') IS NULL ALTER TABLE dbo.[pos_settings] ADD [enable_tax] bit NULL;

IF COL_LENGTH(N'dbo.pos_settings', N'tax_mode') IS NULL ALTER TABLE dbo.[pos_settings] ADD [tax_mode] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.pos_settings', N'paper_size') IS NULL ALTER TABLE dbo.[pos_settings] ADD [paper_size] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.pos_settings', N'header_text') IS NULL ALTER TABLE dbo.[pos_settings] ADD [header_text] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.pos_settings', N'footer_text') IS NULL ALTER TABLE dbo.[pos_settings] ADD [footer_text] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.pos_settings', N'show_logo') IS NULL ALTER TABLE dbo.[pos_settings] ADD [show_logo] bit NULL;

IF COL_LENGTH(N'dbo.pos_settings', N'show_points') IS NULL ALTER TABLE dbo.[pos_settings] ADD [show_points] bit NULL;

IF COL_LENGTH(N'dbo.pos_settings', N'show_barcode') IS NULL ALTER TABLE dbo.[pos_settings] ADD [show_barcode] bit NULL;

IF COL_LENGTH(N'dbo.pos_settings', N'show_tax_details') IS NULL ALTER TABLE dbo.[pos_settings] ADD [show_tax_details] bit NULL;

IF COL_LENGTH(N'dbo.pos_settings', N'updated_at') IS NULL ALTER TABLE dbo.[pos_settings] ADD [updated_at] datetimeoffset(7) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.pos_settings') AND c.name=N'updated_at' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[pos_settings] ALTER COLUMN [updated_at] datetimeoffset(7) NOT NULL;

IF COL_LENGTH(N'dbo.pos_settings', N'company_name') IS NULL ALTER TABLE dbo.[pos_settings] ADD [company_name] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.pos_settings', N'tax_number') IS NULL ALTER TABLE dbo.[pos_settings] ADD [tax_number] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.pos_settings', N'reg_number') IS NULL ALTER TABLE dbo.[pos_settings] ADD [reg_number] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.pos_settings', N'phone') IS NULL ALTER TABLE dbo.[pos_settings] ADD [phone] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.pos_settings', N'website') IS NULL ALTER TABLE dbo.[pos_settings] ADD [website] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.pos_settings', N'fonts') IS NULL ALTER TABLE dbo.[pos_settings] ADD [fonts] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.pos_settings', N'custom_lines') IS NULL ALTER TABLE dbo.[pos_settings] ADD [custom_lines] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.pos_settings', N'qr') IS NULL ALTER TABLE dbo.[pos_settings] ADD [qr] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.pos_settings', N'review_max_voids') IS NULL ALTER TABLE dbo.[pos_settings] ADD [review_max_voids] int NULL;

IF COL_LENGTH(N'dbo.pos_settings', N'review_max_refunds') IS NULL ALTER TABLE dbo.[pos_settings] ADD [review_max_refunds] int NULL;

IF COL_LENGTH(N'dbo.pos_settings', N'review_max_refund_value') IS NULL ALTER TABLE dbo.[pos_settings] ADD [review_max_refund_value] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.pos_settings', N'review_max_nosale') IS NULL ALTER TABLE dbo.[pos_settings] ADD [review_max_nosale] int NULL;

IF COL_LENGTH(N'dbo.pos_settings', N'review_max_discount_pct') IS NULL ALTER TABLE dbo.[pos_settings] ADD [review_max_discount_pct] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.pos_settings', N'day_start_time') IS NULL ALTER TABLE dbo.[pos_settings] ADD [day_start_time] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.pos_settings', N'day_end_time') IS NULL ALTER TABLE dbo.[pos_settings] ADD [day_end_time] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.pos_settings', N'max_shift_hours') IS NULL ALTER TABLE dbo.[pos_settings] ADD [max_shift_hours] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.pos_settings', N'shift_reminder_minutes') IS NULL ALTER TABLE dbo.[pos_settings] ADD [shift_reminder_minutes] int NULL;

IF COL_LENGTH(N'dbo.pos_settings', N'ui_visibility') IS NULL ALTER TABLE dbo.[pos_settings] ADD [ui_visibility] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.pos_settings', N'integration_settings') IS NULL ALTER TABLE dbo.[pos_settings] ADD [integration_settings] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.pos_settings', N'region_country') IS NULL ALTER TABLE dbo.[pos_settings] ADD [region_country] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.pos_settings', N'time_zone') IS NULL ALTER TABLE dbo.[pos_settings] ADD [time_zone] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.pos_settings', N'date_format') IS NULL ALTER TABLE dbo.[pos_settings] ADD [date_format] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.pos_settings', N'time_format') IS NULL ALTER TABLE dbo.[pos_settings] ADD [time_format] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.pos_settings', N'booking_slip') IS NULL ALTER TABLE dbo.[pos_settings] ADD [booking_slip] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.pos_settings', N'notification_settings') IS NULL ALTER TABLE dbo.[pos_settings] ADD [notification_settings] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.pos_settings', N'row_version') IS NULL ALTER TABLE dbo.[pos_settings] ADD [row_version] int NULL;

IF COL_LENGTH(N'dbo.pos_settings', N'logo_data_url') IS NULL ALTER TABLE dbo.[pos_settings] ADD [logo_data_url] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.pos_settings', N'receipt_design') IS NULL ALTER TABLE dbo.[pos_settings] ADD [receipt_design] nvarchar(max) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.pos_settings') AND name=N'IX_pos_settings_updated_at') CREATE INDEX [IX_pos_settings_updated_at] ON dbo.[pos_settings]([updated_at]);

IF OBJECT_ID(N'dbo.product_barcodes', N'U') IS NULL BEGIN CREATE TABLE dbo.[product_barcodes] (

  [id] uniqueidentifier NOT NULL CONSTRAINT [DF_product_barcodes_id] DEFAULT (NEWID()),
  [product_id] uniqueidentifier NOT NULL,
  [barcode] nvarchar(450) NOT NULL,
  [label] nvarchar(max) NULL,
  [pack_size] decimal(38,12) NOT NULL CONSTRAINT [DF_product_barcodes_pack_size] DEFAULT (1),
  [is_primary] bit NOT NULL CONSTRAINT [DF_product_barcodes_is_primary] DEFAULT (0),
  [created_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_product_barcodes_created_at] DEFAULT (SYSDATETIMEOFFSET()),
  [updated_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_product_barcodes_updated_at] DEFAULT (SYSDATETIMEOFFSET()),
  [row_version] int NOT NULL CONSTRAINT [DF_product_barcodes_row_version] DEFAULT (1),
  CONSTRAINT [PK_product_barcodes] PRIMARY KEY ([id])

); END;

IF OBJECT_ID(N'dbo.product_barcodes', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.change_tracking_tables WHERE object_id=OBJECT_ID(N'dbo.product_barcodes')) ALTER TABLE dbo.[product_barcodes] ENABLE CHANGE_TRACKING;

IF COL_LENGTH(N'dbo.product_barcodes', N'id') IS NULL ALTER TABLE dbo.[product_barcodes] ADD [id] uniqueidentifier NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.product_barcodes') AND c.name=N'id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[product_barcodes] ALTER COLUMN [id] uniqueidentifier NOT NULL;

IF COL_LENGTH(N'dbo.product_barcodes', N'product_id') IS NULL ALTER TABLE dbo.[product_barcodes] ADD [product_id] uniqueidentifier NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.product_barcodes') AND c.name=N'product_id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[product_barcodes] ALTER COLUMN [product_id] uniqueidentifier NOT NULL;

IF COL_LENGTH(N'dbo.product_barcodes', N'barcode') IS NULL ALTER TABLE dbo.[product_barcodes] ADD [barcode] nvarchar(450) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.product_barcodes') AND c.name=N'barcode' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[product_barcodes] ALTER COLUMN [barcode] nvarchar(450) NOT NULL;

IF COL_LENGTH(N'dbo.product_barcodes', N'label') IS NULL ALTER TABLE dbo.[product_barcodes] ADD [label] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.product_barcodes', N'pack_size') IS NULL ALTER TABLE dbo.[product_barcodes] ADD [pack_size] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.product_barcodes', N'is_primary') IS NULL ALTER TABLE dbo.[product_barcodes] ADD [is_primary] bit NULL;

IF COL_LENGTH(N'dbo.product_barcodes', N'created_at') IS NULL ALTER TABLE dbo.[product_barcodes] ADD [created_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.product_barcodes', N'updated_at') IS NULL ALTER TABLE dbo.[product_barcodes] ADD [updated_at] datetimeoffset(7) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.product_barcodes') AND c.name=N'updated_at' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[product_barcodes] ALTER COLUMN [updated_at] datetimeoffset(7) NOT NULL;

IF COL_LENGTH(N'dbo.product_barcodes', N'row_version') IS NULL ALTER TABLE dbo.[product_barcodes] ADD [row_version] int NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.product_barcodes') AND name=N'UX_product_barcodes_barcode') CREATE UNIQUE INDEX [UX_product_barcodes_barcode] ON dbo.[product_barcodes]([barcode]);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.product_barcodes') AND name=N'IX_product_barcodes_updated_at') CREATE INDEX [IX_product_barcodes_updated_at] ON dbo.[product_barcodes]([updated_at]);

IF OBJECT_ID(N'dbo.product_categories', N'U') IS NULL BEGIN CREATE TABLE dbo.[product_categories] (

  [id] uniqueidentifier NOT NULL CONSTRAINT [DF_product_categories_id] DEFAULT (NEWID()),
  [name] nvarchar(max) NOT NULL,
  [parent_id] uniqueidentifier NULL,
  [sort] int NOT NULL CONSTRAINT [DF_product_categories_sort] DEFAULT (0),
  [created_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_product_categories_created_at] DEFAULT (SYSDATETIMEOFFSET()),
  [updated_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_product_categories_updated_at] DEFAULT (SYSDATETIMEOFFSET()),
  [kind] nvarchar(max) NOT NULL CONSTRAINT [DF_product_categories_kind] DEFAULT ('category'),
  [row_version] int NOT NULL CONSTRAINT [DF_product_categories_row_version] DEFAULT (1),
  [is_active] bit NOT NULL CONSTRAINT [DF_product_categories_is_active] DEFAULT (1),
  CONSTRAINT [PK_product_categories] PRIMARY KEY ([id])

); END;

IF OBJECT_ID(N'dbo.product_categories', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.change_tracking_tables WHERE object_id=OBJECT_ID(N'dbo.product_categories')) ALTER TABLE dbo.[product_categories] ENABLE CHANGE_TRACKING;

IF COL_LENGTH(N'dbo.product_categories', N'id') IS NULL ALTER TABLE dbo.[product_categories] ADD [id] uniqueidentifier NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.product_categories') AND c.name=N'id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[product_categories] ALTER COLUMN [id] uniqueidentifier NOT NULL;

IF COL_LENGTH(N'dbo.product_categories', N'name') IS NULL ALTER TABLE dbo.[product_categories] ADD [name] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.product_categories', N'parent_id') IS NULL ALTER TABLE dbo.[product_categories] ADD [parent_id] uniqueidentifier NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.product_categories') AND c.name=N'parent_id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[product_categories] ALTER COLUMN [parent_id] uniqueidentifier NULL;

IF COL_LENGTH(N'dbo.product_categories', N'sort') IS NULL ALTER TABLE dbo.[product_categories] ADD [sort] int NULL;

IF COL_LENGTH(N'dbo.product_categories', N'created_at') IS NULL ALTER TABLE dbo.[product_categories] ADD [created_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.product_categories', N'updated_at') IS NULL ALTER TABLE dbo.[product_categories] ADD [updated_at] datetimeoffset(7) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.product_categories') AND c.name=N'updated_at' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[product_categories] ALTER COLUMN [updated_at] datetimeoffset(7) NOT NULL;

IF COL_LENGTH(N'dbo.product_categories', N'kind') IS NULL ALTER TABLE dbo.[product_categories] ADD [kind] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.product_categories', N'row_version') IS NULL ALTER TABLE dbo.[product_categories] ADD [row_version] int NULL;

IF COL_LENGTH(N'dbo.product_categories', N'is_active') IS NULL ALTER TABLE dbo.[product_categories] ADD [is_active] bit NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.product_categories') AND name=N'IX_product_categories_updated_at') CREATE INDEX [IX_product_categories_updated_at] ON dbo.[product_categories]([updated_at]);

IF OBJECT_ID(N'dbo.products', N'U') IS NULL BEGIN CREATE TABLE dbo.[products] (

  [id] uniqueidentifier NOT NULL CONSTRAINT [DF_products_id] DEFAULT (NEWID()),
  [barcode] nvarchar(450) NOT NULL,
  [name] nvarchar(max) NOT NULL,
  [category] nvarchar(max) NULL,
  [cost_price] decimal(38,12) NOT NULL CONSTRAINT [DF_products_cost_price] DEFAULT (0),
  [selling_price] decimal(38,12) NOT NULL CONSTRAINT [DF_products_selling_price] DEFAULT (0),
  [ecom_price] decimal(38,12) NULL,
  [stock_quantity] int NOT NULL CONSTRAINT [DF_products_stock_quantity] DEFAULT (0),
  [custom_points] decimal(38,12) NULL,
  [point_multiplier] decimal(38,12) NOT NULL CONSTRAINT [DF_products_point_multiplier] DEFAULT (1.0),
  [created_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_products_created_at] DEFAULT (SYSDATETIMEOFFSET()),
  [sku] nvarchar(max) NULL,
  [reorder_level] int NOT NULL CONSTRAINT [DF_products_reorder_level] DEFAULT (0),
  [tax_rate] decimal(38,12) NOT NULL CONSTRAINT [DF_products_tax_rate] DEFAULT (0),
  [ecom_visible] bit NOT NULL CONSTRAINT [DF_products_ecom_visible] DEFAULT (1),
  [stock_by_store] nvarchar(max) NOT NULL CONSTRAINT [DF_products_stock_by_store] DEFAULT (N'[]'),
  [updated_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_products_updated_at] DEFAULT (SYSDATETIMEOFFSET()),
  [landing_pct] decimal(38,12) NULL,
  [sub_category] nvarchar(max) NULL,
  [unit] nvarchar(max) NULL,
  [packs] nvarchar(max) NOT NULL CONSTRAINT [DF_products_packs] DEFAULT ('[]'),
  [barcode_aliases] nvarchar(max) NOT NULL CONSTRAINT [DF_products_barcode_aliases] DEFAULT (N'[]'),
  [is_archived] bit NOT NULL CONSTRAINT [DF_products_is_archived] DEFAULT (0),
  [archived_at] datetimeoffset(7) NULL,
  [brand] nvarchar(max) NULL,
  [product_group] nvarchar(max) NULL,
  [barcode_variants] nvarchar(max) NOT NULL CONSTRAINT [DF_products_barcode_variants] DEFAULT ('[]'),
  [row_version] int NOT NULL CONSTRAINT [DF_products_row_version] DEFAULT (0),
  [owner_store_id] nvarchar(450) NULL,
  CONSTRAINT [PK_products] PRIMARY KEY ([id])

); END;

IF OBJECT_ID(N'dbo.products', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.change_tracking_tables WHERE object_id=OBJECT_ID(N'dbo.products')) ALTER TABLE dbo.[products] ENABLE CHANGE_TRACKING;

IF COL_LENGTH(N'dbo.products', N'id') IS NULL ALTER TABLE dbo.[products] ADD [id] uniqueidentifier NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.products') AND c.name=N'id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[products] ALTER COLUMN [id] uniqueidentifier NOT NULL;

IF COL_LENGTH(N'dbo.products', N'barcode') IS NULL ALTER TABLE dbo.[products] ADD [barcode] nvarchar(450) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.products') AND c.name=N'barcode' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[products] ALTER COLUMN [barcode] nvarchar(450) NOT NULL;

IF COL_LENGTH(N'dbo.products', N'name') IS NULL ALTER TABLE dbo.[products] ADD [name] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.products', N'category') IS NULL ALTER TABLE dbo.[products] ADD [category] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.products', N'cost_price') IS NULL ALTER TABLE dbo.[products] ADD [cost_price] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.products', N'selling_price') IS NULL ALTER TABLE dbo.[products] ADD [selling_price] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.products', N'ecom_price') IS NULL ALTER TABLE dbo.[products] ADD [ecom_price] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.products', N'stock_quantity') IS NULL ALTER TABLE dbo.[products] ADD [stock_quantity] int NULL;

IF COL_LENGTH(N'dbo.products', N'custom_points') IS NULL ALTER TABLE dbo.[products] ADD [custom_points] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.products', N'point_multiplier') IS NULL ALTER TABLE dbo.[products] ADD [point_multiplier] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.products', N'created_at') IS NULL ALTER TABLE dbo.[products] ADD [created_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.products', N'sku') IS NULL ALTER TABLE dbo.[products] ADD [sku] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.products', N'reorder_level') IS NULL ALTER TABLE dbo.[products] ADD [reorder_level] int NULL;

IF COL_LENGTH(N'dbo.products', N'tax_rate') IS NULL ALTER TABLE dbo.[products] ADD [tax_rate] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.products', N'ecom_visible') IS NULL ALTER TABLE dbo.[products] ADD [ecom_visible] bit NULL;

IF COL_LENGTH(N'dbo.products', N'stock_by_store') IS NULL ALTER TABLE dbo.[products] ADD [stock_by_store] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.products', N'updated_at') IS NULL ALTER TABLE dbo.[products] ADD [updated_at] datetimeoffset(7) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.products') AND c.name=N'updated_at' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[products] ALTER COLUMN [updated_at] datetimeoffset(7) NOT NULL;

IF COL_LENGTH(N'dbo.products', N'landing_pct') IS NULL ALTER TABLE dbo.[products] ADD [landing_pct] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.products', N'sub_category') IS NULL ALTER TABLE dbo.[products] ADD [sub_category] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.products', N'unit') IS NULL ALTER TABLE dbo.[products] ADD [unit] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.products', N'packs') IS NULL ALTER TABLE dbo.[products] ADD [packs] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.products', N'barcode_aliases') IS NULL ALTER TABLE dbo.[products] ADD [barcode_aliases] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.products', N'is_archived') IS NULL ALTER TABLE dbo.[products] ADD [is_archived] bit NULL;

IF COL_LENGTH(N'dbo.products', N'archived_at') IS NULL ALTER TABLE dbo.[products] ADD [archived_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.products', N'brand') IS NULL ALTER TABLE dbo.[products] ADD [brand] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.products', N'product_group') IS NULL ALTER TABLE dbo.[products] ADD [product_group] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.products', N'barcode_variants') IS NULL ALTER TABLE dbo.[products] ADD [barcode_variants] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.products', N'row_version') IS NULL ALTER TABLE dbo.[products] ADD [row_version] int NULL;

IF COL_LENGTH(N'dbo.products', N'owner_store_id') IS NULL ALTER TABLE dbo.[products] ADD [owner_store_id] nvarchar(450) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.products') AND c.name=N'owner_store_id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[products] ALTER COLUMN [owner_store_id] nvarchar(450) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.products') AND name=N'UX_products_barcode') CREATE UNIQUE INDEX [UX_products_barcode] ON dbo.[products]([barcode]);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.products') AND name=N'IX_products_updated_at') CREATE INDEX [IX_products_updated_at] ON dbo.[products]([updated_at]);

IF OBJECT_ID(N'dbo.promotions', N'U') IS NULL BEGIN CREATE TABLE dbo.[promotions] (

  [id] uniqueidentifier NOT NULL CONSTRAINT [DF_promotions_id] DEFAULT (NEWID()),
  [title] nvarchar(max) NOT NULL,
  [promo_type] nvarchar(max) NOT NULL,
  [min_spend] decimal(38,12) NOT NULL CONSTRAINT [DF_promotions_min_spend] DEFAULT (0),
  [discount_percent] decimal(38,12) NOT NULL CONSTRAINT [DF_promotions_discount_percent] DEFAULT (0),
  [discount_amount] decimal(38,12) NOT NULL CONSTRAINT [DF_promotions_discount_amount] DEFAULT (0),
  [foc_product_id] uniqueidentifier NULL,
  [points_per_dollar] decimal(38,12) NOT NULL CONSTRAINT [DF_promotions_points_per_dollar] DEFAULT (1),
  [tier_rates] nvarchar(max) NULL,
  [is_active] bit NOT NULL CONSTRAINT [DF_promotions_is_active] DEFAULT (1),
  [start_date] date NULL,
  [end_date] date NULL,
  [created_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_promotions_created_at] DEFAULT (SYSDATETIMEOFFSET()),
  [updated_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_promotions_updated_at] DEFAULT (SYSDATETIMEOFFSET()),
  [row_version] int NOT NULL CONSTRAINT [DF_promotions_row_version] DEFAULT (1),
  CONSTRAINT [PK_promotions] PRIMARY KEY ([id])

); END;

IF OBJECT_ID(N'dbo.promotions', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.change_tracking_tables WHERE object_id=OBJECT_ID(N'dbo.promotions')) ALTER TABLE dbo.[promotions] ENABLE CHANGE_TRACKING;

IF COL_LENGTH(N'dbo.promotions', N'id') IS NULL ALTER TABLE dbo.[promotions] ADD [id] uniqueidentifier NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.promotions') AND c.name=N'id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[promotions] ALTER COLUMN [id] uniqueidentifier NOT NULL;

IF COL_LENGTH(N'dbo.promotions', N'title') IS NULL ALTER TABLE dbo.[promotions] ADD [title] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.promotions', N'promo_type') IS NULL ALTER TABLE dbo.[promotions] ADD [promo_type] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.promotions', N'min_spend') IS NULL ALTER TABLE dbo.[promotions] ADD [min_spend] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.promotions', N'discount_percent') IS NULL ALTER TABLE dbo.[promotions] ADD [discount_percent] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.promotions', N'discount_amount') IS NULL ALTER TABLE dbo.[promotions] ADD [discount_amount] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.promotions', N'foc_product_id') IS NULL ALTER TABLE dbo.[promotions] ADD [foc_product_id] uniqueidentifier NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.promotions') AND c.name=N'foc_product_id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[promotions] ALTER COLUMN [foc_product_id] uniqueidentifier NULL;

IF COL_LENGTH(N'dbo.promotions', N'points_per_dollar') IS NULL ALTER TABLE dbo.[promotions] ADD [points_per_dollar] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.promotions', N'tier_rates') IS NULL ALTER TABLE dbo.[promotions] ADD [tier_rates] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.promotions', N'is_active') IS NULL ALTER TABLE dbo.[promotions] ADD [is_active] bit NULL;

IF COL_LENGTH(N'dbo.promotions', N'start_date') IS NULL ALTER TABLE dbo.[promotions] ADD [start_date] date NULL;

IF COL_LENGTH(N'dbo.promotions', N'end_date') IS NULL ALTER TABLE dbo.[promotions] ADD [end_date] date NULL;

IF COL_LENGTH(N'dbo.promotions', N'created_at') IS NULL ALTER TABLE dbo.[promotions] ADD [created_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.promotions', N'updated_at') IS NULL ALTER TABLE dbo.[promotions] ADD [updated_at] datetimeoffset(7) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.promotions') AND c.name=N'updated_at' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[promotions] ALTER COLUMN [updated_at] datetimeoffset(7) NOT NULL;

IF COL_LENGTH(N'dbo.promotions', N'row_version') IS NULL ALTER TABLE dbo.[promotions] ADD [row_version] int NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.promotions') AND name=N'IX_promotions_updated_at') CREATE INDEX [IX_promotions_updated_at] ON dbo.[promotions]([updated_at]);

IF OBJECT_ID(N'dbo.public_flags', N'U') IS NULL BEGIN CREATE TABLE dbo.[public_flags] (

  [key] nvarchar(450) NOT NULL,
  [enabled] bit NOT NULL CONSTRAINT [DF_public_flags_enabled] DEFAULT (1),
  [updated_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_public_flags_updated_at] DEFAULT (SYSDATETIMEOFFSET()),
  CONSTRAINT [PK_public_flags] PRIMARY KEY ([key])

); END;

IF OBJECT_ID(N'dbo.public_flags', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.change_tracking_tables WHERE object_id=OBJECT_ID(N'dbo.public_flags')) ALTER TABLE dbo.[public_flags] ENABLE CHANGE_TRACKING;

IF COL_LENGTH(N'dbo.public_flags', N'key') IS NULL ALTER TABLE dbo.[public_flags] ADD [key] nvarchar(450) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.public_flags') AND c.name=N'key' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[public_flags] ALTER COLUMN [key] nvarchar(450) NOT NULL;

IF COL_LENGTH(N'dbo.public_flags', N'enabled') IS NULL ALTER TABLE dbo.[public_flags] ADD [enabled] bit NULL;

IF COL_LENGTH(N'dbo.public_flags', N'updated_at') IS NULL ALTER TABLE dbo.[public_flags] ADD [updated_at] datetimeoffset(7) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.public_flags') AND c.name=N'updated_at' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[public_flags] ALTER COLUMN [updated_at] datetimeoffset(7) NOT NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.public_flags') AND name=N'IX_public_flags_updated_at') CREATE INDEX [IX_public_flags_updated_at] ON dbo.[public_flags]([updated_at]);

IF OBJECT_ID(N'dbo.purchase_order_items', N'U') IS NULL BEGIN CREATE TABLE dbo.[purchase_order_items] (

  [id] uniqueidentifier NOT NULL CONSTRAINT [DF_purchase_order_items_id] DEFAULT (NEWID()),
  [po_id] uniqueidentifier NOT NULL,
  [product_id] uniqueidentifier NULL,
  [barcode] nvarchar(max) NULL,
  [product_name] nvarchar(max) NULL,
  [cost_price] decimal(38,12) NOT NULL CONSTRAINT [DF_purchase_order_items_cost_price] DEFAULT (0),
  [selling_price] decimal(38,12) NOT NULL CONSTRAINT [DF_purchase_order_items_selling_price] DEFAULT (0),
  [quantity_received] int NOT NULL CONSTRAINT [DF_purchase_order_items_quantity_received] DEFAULT (0),
  [subtotal_cost] decimal(38,12) NOT NULL CONSTRAINT [DF_purchase_order_items_subtotal_cost] DEFAULT (0),
  [created_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_purchase_order_items_created_at] DEFAULT (SYSDATETIMEOFFSET()),
  [sku] nvarchar(max) NULL,
  [updated_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_purchase_order_items_updated_at] DEFAULT (SYSDATETIMEOFFSET()),
  [row_version] int NOT NULL CONSTRAINT [DF_purchase_order_items_row_version] DEFAULT (1),
  CONSTRAINT [PK_purchase_order_items] PRIMARY KEY ([id])

); END;

IF OBJECT_ID(N'dbo.purchase_order_items', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.change_tracking_tables WHERE object_id=OBJECT_ID(N'dbo.purchase_order_items')) ALTER TABLE dbo.[purchase_order_items] ENABLE CHANGE_TRACKING;

IF COL_LENGTH(N'dbo.purchase_order_items', N'id') IS NULL ALTER TABLE dbo.[purchase_order_items] ADD [id] uniqueidentifier NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.purchase_order_items') AND c.name=N'id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[purchase_order_items] ALTER COLUMN [id] uniqueidentifier NOT NULL;

IF COL_LENGTH(N'dbo.purchase_order_items', N'po_id') IS NULL ALTER TABLE dbo.[purchase_order_items] ADD [po_id] uniqueidentifier NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.purchase_order_items') AND c.name=N'po_id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[purchase_order_items] ALTER COLUMN [po_id] uniqueidentifier NOT NULL;

IF COL_LENGTH(N'dbo.purchase_order_items', N'product_id') IS NULL ALTER TABLE dbo.[purchase_order_items] ADD [product_id] uniqueidentifier NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.purchase_order_items') AND c.name=N'product_id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[purchase_order_items] ALTER COLUMN [product_id] uniqueidentifier NULL;

IF COL_LENGTH(N'dbo.purchase_order_items', N'barcode') IS NULL ALTER TABLE dbo.[purchase_order_items] ADD [barcode] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.purchase_order_items', N'product_name') IS NULL ALTER TABLE dbo.[purchase_order_items] ADD [product_name] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.purchase_order_items', N'cost_price') IS NULL ALTER TABLE dbo.[purchase_order_items] ADD [cost_price] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.purchase_order_items', N'selling_price') IS NULL ALTER TABLE dbo.[purchase_order_items] ADD [selling_price] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.purchase_order_items', N'quantity_received') IS NULL ALTER TABLE dbo.[purchase_order_items] ADD [quantity_received] int NULL;

IF COL_LENGTH(N'dbo.purchase_order_items', N'subtotal_cost') IS NULL ALTER TABLE dbo.[purchase_order_items] ADD [subtotal_cost] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.purchase_order_items', N'created_at') IS NULL ALTER TABLE dbo.[purchase_order_items] ADD [created_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.purchase_order_items', N'sku') IS NULL ALTER TABLE dbo.[purchase_order_items] ADD [sku] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.purchase_order_items', N'updated_at') IS NULL ALTER TABLE dbo.[purchase_order_items] ADD [updated_at] datetimeoffset(7) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.purchase_order_items') AND c.name=N'updated_at' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[purchase_order_items] ALTER COLUMN [updated_at] datetimeoffset(7) NOT NULL;

IF COL_LENGTH(N'dbo.purchase_order_items', N'row_version') IS NULL ALTER TABLE dbo.[purchase_order_items] ADD [row_version] int NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.purchase_order_items') AND name=N'IX_purchase_order_items_updated_at') CREATE INDEX [IX_purchase_order_items_updated_at] ON dbo.[purchase_order_items]([updated_at]);

IF OBJECT_ID(N'dbo.purchase_orders', N'U') IS NULL BEGIN CREATE TABLE dbo.[purchase_orders] (

  [id] uniqueidentifier NOT NULL CONSTRAINT [DF_purchase_orders_id] DEFAULT (NEWID()),
  [po_number] nvarchar(450) NOT NULL,
  [supplier_name] nvarchar(max) NULL,
  [operator_name] nvarchar(max) NULL,
  [total_cost] decimal(38,12) NOT NULL CONSTRAINT [DF_purchase_orders_total_cost] DEFAULT (0),
  [total_items_count] int NOT NULL CONSTRAINT [DF_purchase_orders_total_items_count] DEFAULT (0),
  [created_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_purchase_orders_created_at] DEFAULT (SYSDATETIMEOFFSET()),
  [supplier_id] uniqueidentifier NULL,
  [store_id] nvarchar(450) NULL,
  [store_code] nvarchar(max) NULL,
  [invoice_date] date NULL,
  [invoice_entry_date] datetimeoffset(7) NULL CONSTRAINT [DF_purchase_orders_invoice_entry_date] DEFAULT (SYSDATETIMEOFFSET()),
  [updated_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_purchase_orders_updated_at] DEFAULT (SYSDATETIMEOFFSET()),
  [row_version] int NOT NULL CONSTRAINT [DF_purchase_orders_row_version] DEFAULT (1),
  [pending_edit_request_id] uniqueidentifier NULL,
  CONSTRAINT [PK_purchase_orders] PRIMARY KEY ([id])

); END;

IF OBJECT_ID(N'dbo.purchase_orders', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.change_tracking_tables WHERE object_id=OBJECT_ID(N'dbo.purchase_orders')) ALTER TABLE dbo.[purchase_orders] ENABLE CHANGE_TRACKING;

IF COL_LENGTH(N'dbo.purchase_orders', N'id') IS NULL ALTER TABLE dbo.[purchase_orders] ADD [id] uniqueidentifier NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.purchase_orders') AND c.name=N'id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[purchase_orders] ALTER COLUMN [id] uniqueidentifier NOT NULL;

IF COL_LENGTH(N'dbo.purchase_orders', N'po_number') IS NULL ALTER TABLE dbo.[purchase_orders] ADD [po_number] nvarchar(450) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.purchase_orders') AND c.name=N'po_number' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[purchase_orders] ALTER COLUMN [po_number] nvarchar(450) NOT NULL;

IF COL_LENGTH(N'dbo.purchase_orders', N'supplier_name') IS NULL ALTER TABLE dbo.[purchase_orders] ADD [supplier_name] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.purchase_orders', N'operator_name') IS NULL ALTER TABLE dbo.[purchase_orders] ADD [operator_name] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.purchase_orders', N'total_cost') IS NULL ALTER TABLE dbo.[purchase_orders] ADD [total_cost] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.purchase_orders', N'total_items_count') IS NULL ALTER TABLE dbo.[purchase_orders] ADD [total_items_count] int NULL;

IF COL_LENGTH(N'dbo.purchase_orders', N'created_at') IS NULL ALTER TABLE dbo.[purchase_orders] ADD [created_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.purchase_orders', N'supplier_id') IS NULL ALTER TABLE dbo.[purchase_orders] ADD [supplier_id] uniqueidentifier NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.purchase_orders') AND c.name=N'supplier_id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[purchase_orders] ALTER COLUMN [supplier_id] uniqueidentifier NULL;

IF COL_LENGTH(N'dbo.purchase_orders', N'store_id') IS NULL ALTER TABLE dbo.[purchase_orders] ADD [store_id] nvarchar(450) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.purchase_orders') AND c.name=N'store_id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[purchase_orders] ALTER COLUMN [store_id] nvarchar(450) NULL;

IF COL_LENGTH(N'dbo.purchase_orders', N'store_code') IS NULL ALTER TABLE dbo.[purchase_orders] ADD [store_code] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.purchase_orders', N'invoice_date') IS NULL ALTER TABLE dbo.[purchase_orders] ADD [invoice_date] date NULL;

IF COL_LENGTH(N'dbo.purchase_orders', N'invoice_entry_date') IS NULL ALTER TABLE dbo.[purchase_orders] ADD [invoice_entry_date] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.purchase_orders', N'updated_at') IS NULL ALTER TABLE dbo.[purchase_orders] ADD [updated_at] datetimeoffset(7) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.purchase_orders') AND c.name=N'updated_at' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[purchase_orders] ALTER COLUMN [updated_at] datetimeoffset(7) NOT NULL;

IF COL_LENGTH(N'dbo.purchase_orders', N'row_version') IS NULL ALTER TABLE dbo.[purchase_orders] ADD [row_version] int NULL;

IF COL_LENGTH(N'dbo.purchase_orders', N'pending_edit_request_id') IS NULL ALTER TABLE dbo.[purchase_orders] ADD [pending_edit_request_id] uniqueidentifier NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.purchase_orders') AND name=N'UX_purchase_orders_po_number') CREATE UNIQUE INDEX [UX_purchase_orders_po_number] ON dbo.[purchase_orders]([po_number]);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.purchase_orders') AND name=N'IX_purchase_orders_store_id') CREATE INDEX [IX_purchase_orders_store_id] ON dbo.[purchase_orders]([store_id]);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.purchase_orders') AND name=N'IX_purchase_orders_updated_at') CREATE INDEX [IX_purchase_orders_updated_at] ON dbo.[purchase_orders]([updated_at]);

IF OBJECT_ID(N'dbo.sale_items', N'U') IS NULL BEGIN CREATE TABLE dbo.[sale_items] (

  [id] uniqueidentifier NOT NULL CONSTRAINT [DF_sale_items_id] DEFAULT (NEWID()),
  [sale_id] uniqueidentifier NOT NULL,
  [product_id] uniqueidentifier NULL,
  [product_name] nvarchar(max) NOT NULL,
  [unit_price] decimal(38,12) NOT NULL CONSTRAINT [DF_sale_items_unit_price] DEFAULT (0),
  [quantity] int NOT NULL CONSTRAINT [DF_sale_items_quantity] DEFAULT (1),
  [discount_percent] decimal(38,12) NOT NULL CONSTRAINT [DF_sale_items_discount_percent] DEFAULT (0),
  [discount_amount] decimal(38,12) NOT NULL CONSTRAINT [DF_sale_items_discount_amount] DEFAULT (0),
  [is_return] bit NOT NULL CONSTRAINT [DF_sale_items_is_return] DEFAULT (0),
  [created_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_sale_items_created_at] DEFAULT (SYSDATETIMEOFFSET()),
  [tax_rate] decimal(38,12) NOT NULL CONSTRAINT [DF_sale_items_tax_rate] DEFAULT (0),
  [is_foc] bit NOT NULL CONSTRAINT [DF_sale_items_is_foc] DEFAULT (0),
  [promo_id] nvarchar(max) NULL,
  [coupon_code] nvarchar(max) NULL,
  [coupon_discount] decimal(38,12) NOT NULL CONSTRAINT [DF_sale_items_coupon_discount] DEFAULT (0),
  [unit_cost] decimal(38,12) NOT NULL CONSTRAINT [DF_sale_items_unit_cost] DEFAULT (0),
  [row_version] int NOT NULL CONSTRAINT [DF_sale_items_row_version] DEFAULT (1),
  [refunded_qty] int NOT NULL CONSTRAINT [DF_sale_items_refunded_qty] DEFAULT (0),
  CONSTRAINT [PK_sale_items] PRIMARY KEY ([id])

); END;

IF OBJECT_ID(N'dbo.sale_items', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.change_tracking_tables WHERE object_id=OBJECT_ID(N'dbo.sale_items')) ALTER TABLE dbo.[sale_items] ENABLE CHANGE_TRACKING;

IF COL_LENGTH(N'dbo.sale_items', N'id') IS NULL ALTER TABLE dbo.[sale_items] ADD [id] uniqueidentifier NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.sale_items') AND c.name=N'id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[sale_items] ALTER COLUMN [id] uniqueidentifier NOT NULL;

IF COL_LENGTH(N'dbo.sale_items', N'sale_id') IS NULL ALTER TABLE dbo.[sale_items] ADD [sale_id] uniqueidentifier NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.sale_items') AND c.name=N'sale_id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[sale_items] ALTER COLUMN [sale_id] uniqueidentifier NOT NULL;

IF COL_LENGTH(N'dbo.sale_items', N'product_id') IS NULL ALTER TABLE dbo.[sale_items] ADD [product_id] uniqueidentifier NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.sale_items') AND c.name=N'product_id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[sale_items] ALTER COLUMN [product_id] uniqueidentifier NULL;

IF COL_LENGTH(N'dbo.sale_items', N'product_name') IS NULL ALTER TABLE dbo.[sale_items] ADD [product_name] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.sale_items', N'unit_price') IS NULL ALTER TABLE dbo.[sale_items] ADD [unit_price] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.sale_items', N'quantity') IS NULL ALTER TABLE dbo.[sale_items] ADD [quantity] int NULL;

IF COL_LENGTH(N'dbo.sale_items', N'discount_percent') IS NULL ALTER TABLE dbo.[sale_items] ADD [discount_percent] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.sale_items', N'discount_amount') IS NULL ALTER TABLE dbo.[sale_items] ADD [discount_amount] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.sale_items', N'is_return') IS NULL ALTER TABLE dbo.[sale_items] ADD [is_return] bit NULL;

IF COL_LENGTH(N'dbo.sale_items', N'created_at') IS NULL ALTER TABLE dbo.[sale_items] ADD [created_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.sale_items', N'tax_rate') IS NULL ALTER TABLE dbo.[sale_items] ADD [tax_rate] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.sale_items', N'is_foc') IS NULL ALTER TABLE dbo.[sale_items] ADD [is_foc] bit NULL;

IF COL_LENGTH(N'dbo.sale_items', N'promo_id') IS NULL ALTER TABLE dbo.[sale_items] ADD [promo_id] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.sale_items', N'coupon_code') IS NULL ALTER TABLE dbo.[sale_items] ADD [coupon_code] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.sale_items', N'coupon_discount') IS NULL ALTER TABLE dbo.[sale_items] ADD [coupon_discount] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.sale_items', N'unit_cost') IS NULL ALTER TABLE dbo.[sale_items] ADD [unit_cost] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.sale_items', N'row_version') IS NULL ALTER TABLE dbo.[sale_items] ADD [row_version] int NULL;

IF COL_LENGTH(N'dbo.sale_items', N'refunded_qty') IS NULL ALTER TABLE dbo.[sale_items] ADD [refunded_qty] int NULL;

IF OBJECT_ID(N'dbo.sales', N'U') IS NULL BEGIN CREATE TABLE dbo.[sales] (

  [id] uniqueidentifier NOT NULL CONSTRAINT [DF_sales_id] DEFAULT (NEWID()),
  [bill_number] nvarchar(450) NOT NULL,
  [member_id] uniqueidentifier NULL,
  [store_id] nvarchar(450) NULL,
  [cashier_name] nvarchar(max) NULL,
  [subtotal_amount] decimal(38,12) NOT NULL CONSTRAINT [DF_sales_subtotal_amount] DEFAULT (0),
  [total_amount] decimal(38,12) NOT NULL CONSTRAINT [DF_sales_total_amount] DEFAULT (0),
  [discount_amount] decimal(38,12) NOT NULL CONSTRAINT [DF_sales_discount_amount] DEFAULT (0),
  [tax_amount] decimal(38,12) NOT NULL CONSTRAINT [DF_sales_tax_amount] DEFAULT (0),
  [payment_type] nvarchar(max) NOT NULL CONSTRAINT [DF_sales_payment_type] DEFAULT ('cash'),
  [points_earned] decimal(38,12) NOT NULL CONSTRAINT [DF_sales_points_earned] DEFAULT (0),
  [points_redeemed] decimal(38,12) NOT NULL CONSTRAINT [DF_sales_points_redeemed] DEFAULT (0),
  [is_exchange] bit NOT NULL CONSTRAINT [DF_sales_is_exchange] DEFAULT (0),
  [original_bill_number] nvarchar(max) NULL,
  [is_refunded] bit NOT NULL CONSTRAINT [DF_sales_is_refunded] DEFAULT (0),
  [created_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_sales_created_at] DEFAULT (SYSDATETIMEOFFSET()),
  [shift_id] nvarchar(max) NULL,
  [paid_amount] decimal(38,12) NOT NULL CONSTRAINT [DF_sales_paid_amount] DEFAULT (0),
  [change_amount] decimal(38,12) NOT NULL CONSTRAINT [DF_sales_change_amount] DEFAULT (0),
  [exchange_credit] decimal(38,12) NOT NULL CONSTRAINT [DF_sales_exchange_credit] DEFAULT (0),
  [exchanged_to_bill_number] nvarchar(max) NULL,
  [coupon_code] nvarchar(max) NULL,
  [coupon_promo_id] nvarchar(max) NULL,
  [coupon_scope] nvarchar(max) NULL,
  [coupon_discount] decimal(38,12) NOT NULL CONSTRAINT [DF_sales_coupon_discount] DEFAULT (0),
  [payments] nvarchar(max) NOT NULL CONSTRAINT [DF_sales_payments] DEFAULT ('[]'),
  [client_transaction_id] nvarchar(max) NULL,
  [cashier_id] nvarchar(max) NULL,
  [created_by] nvarchar(max) NULL,
  [updated_by] nvarchar(max) NULL,
  [row_version] int NOT NULL CONSTRAINT [DF_sales_row_version] DEFAULT (1),
  [store_name_snapshot] nvarchar(max) NULL,
  [store_address_snapshot] nvarchar(max) NULL,
  [authorization_request_id] uniqueidentifier NULL,
  [rounding_adjustment] decimal(18,4) NOT NULL,
  CONSTRAINT [PK_sales] PRIMARY KEY ([id])

); END;

IF OBJECT_ID(N'dbo.sales', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.change_tracking_tables WHERE object_id=OBJECT_ID(N'dbo.sales')) ALTER TABLE dbo.[sales] ENABLE CHANGE_TRACKING;

IF COL_LENGTH(N'dbo.sales', N'id') IS NULL ALTER TABLE dbo.[sales] ADD [id] uniqueidentifier NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.sales') AND c.name=N'id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[sales] ALTER COLUMN [id] uniqueidentifier NOT NULL;

IF COL_LENGTH(N'dbo.sales', N'bill_number') IS NULL ALTER TABLE dbo.[sales] ADD [bill_number] nvarchar(450) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.sales') AND c.name=N'bill_number' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[sales] ALTER COLUMN [bill_number] nvarchar(450) NOT NULL;

IF COL_LENGTH(N'dbo.sales', N'member_id') IS NULL ALTER TABLE dbo.[sales] ADD [member_id] uniqueidentifier NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.sales') AND c.name=N'member_id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[sales] ALTER COLUMN [member_id] uniqueidentifier NULL;

IF COL_LENGTH(N'dbo.sales', N'store_id') IS NULL ALTER TABLE dbo.[sales] ADD [store_id] nvarchar(450) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.sales') AND c.name=N'store_id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[sales] ALTER COLUMN [store_id] nvarchar(450) NULL;

IF COL_LENGTH(N'dbo.sales', N'cashier_name') IS NULL ALTER TABLE dbo.[sales] ADD [cashier_name] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.sales', N'subtotal_amount') IS NULL ALTER TABLE dbo.[sales] ADD [subtotal_amount] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.sales', N'total_amount') IS NULL ALTER TABLE dbo.[sales] ADD [total_amount] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.sales', N'discount_amount') IS NULL ALTER TABLE dbo.[sales] ADD [discount_amount] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.sales', N'tax_amount') IS NULL ALTER TABLE dbo.[sales] ADD [tax_amount] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.sales', N'payment_type') IS NULL ALTER TABLE dbo.[sales] ADD [payment_type] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.sales', N'points_earned') IS NULL ALTER TABLE dbo.[sales] ADD [points_earned] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.sales', N'points_redeemed') IS NULL ALTER TABLE dbo.[sales] ADD [points_redeemed] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.sales', N'is_exchange') IS NULL ALTER TABLE dbo.[sales] ADD [is_exchange] bit NULL;

IF COL_LENGTH(N'dbo.sales', N'original_bill_number') IS NULL ALTER TABLE dbo.[sales] ADD [original_bill_number] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.sales', N'is_refunded') IS NULL ALTER TABLE dbo.[sales] ADD [is_refunded] bit NULL;

IF COL_LENGTH(N'dbo.sales', N'created_at') IS NULL ALTER TABLE dbo.[sales] ADD [created_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.sales', N'shift_id') IS NULL ALTER TABLE dbo.[sales] ADD [shift_id] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.sales', N'paid_amount') IS NULL ALTER TABLE dbo.[sales] ADD [paid_amount] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.sales', N'change_amount') IS NULL ALTER TABLE dbo.[sales] ADD [change_amount] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.sales', N'exchange_credit') IS NULL ALTER TABLE dbo.[sales] ADD [exchange_credit] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.sales', N'exchanged_to_bill_number') IS NULL ALTER TABLE dbo.[sales] ADD [exchanged_to_bill_number] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.sales', N'coupon_code') IS NULL ALTER TABLE dbo.[sales] ADD [coupon_code] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.sales', N'coupon_promo_id') IS NULL ALTER TABLE dbo.[sales] ADD [coupon_promo_id] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.sales', N'coupon_scope') IS NULL ALTER TABLE dbo.[sales] ADD [coupon_scope] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.sales', N'coupon_discount') IS NULL ALTER TABLE dbo.[sales] ADD [coupon_discount] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.sales', N'payments') IS NULL ALTER TABLE dbo.[sales] ADD [payments] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.sales', N'client_transaction_id') IS NULL ALTER TABLE dbo.[sales] ADD [client_transaction_id] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.sales', N'cashier_id') IS NULL ALTER TABLE dbo.[sales] ADD [cashier_id] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.sales', N'created_by') IS NULL ALTER TABLE dbo.[sales] ADD [created_by] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.sales', N'updated_by') IS NULL ALTER TABLE dbo.[sales] ADD [updated_by] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.sales', N'row_version') IS NULL ALTER TABLE dbo.[sales] ADD [row_version] int NULL;

IF COL_LENGTH(N'dbo.sales', N'store_name_snapshot') IS NULL ALTER TABLE dbo.[sales] ADD [store_name_snapshot] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.sales', N'store_address_snapshot') IS NULL ALTER TABLE dbo.[sales] ADD [store_address_snapshot] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.sales', N'authorization_request_id') IS NULL ALTER TABLE dbo.[sales] ADD [authorization_request_id] uniqueidentifier NULL;

IF COL_LENGTH(N'dbo.sales', N'rounding_adjustment') IS NULL ALTER TABLE dbo.[sales] ADD [rounding_adjustment] decimal(18,4) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.sales') AND name=N'UX_sales_bill_number') CREATE UNIQUE INDEX [UX_sales_bill_number] ON dbo.[sales]([bill_number]);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.sales') AND name=N'IX_sales_store_id') CREATE INDEX [IX_sales_store_id] ON dbo.[sales]([store_id]);

IF OBJECT_ID(N'dbo.secure_settings', N'U') IS NULL BEGIN CREATE TABLE dbo.[secure_settings] (

  [key] nvarchar(450) NOT NULL,
  [ciphertext] nvarchar(max) NOT NULL,
  [hint] nvarchar(max) NULL,
  [updated_by] nvarchar(max) NULL,
  [created_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_secure_settings_created_at] DEFAULT (SYSDATETIMEOFFSET()),
  [updated_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_secure_settings_updated_at] DEFAULT (SYSDATETIMEOFFSET()),
  CONSTRAINT [PK_secure_settings] PRIMARY KEY ([key])

); END;

IF OBJECT_ID(N'dbo.secure_settings', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.change_tracking_tables WHERE object_id=OBJECT_ID(N'dbo.secure_settings')) ALTER TABLE dbo.[secure_settings] ENABLE CHANGE_TRACKING;

IF COL_LENGTH(N'dbo.secure_settings', N'key') IS NULL ALTER TABLE dbo.[secure_settings] ADD [key] nvarchar(450) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.secure_settings') AND c.name=N'key' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[secure_settings] ALTER COLUMN [key] nvarchar(450) NOT NULL;

IF COL_LENGTH(N'dbo.secure_settings', N'ciphertext') IS NULL ALTER TABLE dbo.[secure_settings] ADD [ciphertext] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.secure_settings', N'hint') IS NULL ALTER TABLE dbo.[secure_settings] ADD [hint] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.secure_settings', N'updated_by') IS NULL ALTER TABLE dbo.[secure_settings] ADD [updated_by] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.secure_settings', N'created_at') IS NULL ALTER TABLE dbo.[secure_settings] ADD [created_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.secure_settings', N'updated_at') IS NULL ALTER TABLE dbo.[secure_settings] ADD [updated_at] datetimeoffset(7) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.secure_settings') AND c.name=N'updated_at' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[secure_settings] ALTER COLUMN [updated_at] datetimeoffset(7) NOT NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.secure_settings') AND name=N'IX_secure_settings_updated_at') CREATE INDEX [IX_secure_settings_updated_at] ON dbo.[secure_settings]([updated_at]);

IF OBJECT_ID(N'dbo.security_findings', N'U') IS NULL BEGIN CREATE TABLE dbo.[security_findings] (

  [id] uniqueidentifier NOT NULL CONSTRAINT [DF_security_findings_id] DEFAULT (NEWID()),
  [fingerprint] nvarchar(450) NOT NULL,
  [source] nvarchar(max) NOT NULL,
  [severity] nvarchar(max) NOT NULL CONSTRAINT [DF_security_findings_severity] DEFAULT ('medium'),
  [title] nvarchar(max) NOT NULL,
  [detail] nvarchar(max) NOT NULL CONSTRAINT [DF_security_findings_detail] DEFAULT (''),
  [deployment_ref] nvarchar(max) NULL,
  [status] nvarchar(max) NOT NULL CONSTRAINT [DF_security_findings_status] DEFAULT ('open'),
  [first_seen_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_security_findings_first_seen_at] DEFAULT (SYSDATETIMEOFFSET()),
  [last_seen_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_security_findings_last_seen_at] DEFAULT (SYSDATETIMEOFFSET()),
  [acknowledged_by] nvarchar(max) NULL,
  [acknowledged_at] datetimeoffset(7) NULL,
  [resolved_at] datetimeoffset(7) NULL,
  [created_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_security_findings_created_at] DEFAULT (SYSDATETIMEOFFSET()),
  [updated_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_security_findings_updated_at] DEFAULT (SYSDATETIMEOFFSET()),
  CONSTRAINT [PK_security_findings] PRIMARY KEY ([id])

); END;

IF OBJECT_ID(N'dbo.security_findings', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.change_tracking_tables WHERE object_id=OBJECT_ID(N'dbo.security_findings')) ALTER TABLE dbo.[security_findings] ENABLE CHANGE_TRACKING;

IF COL_LENGTH(N'dbo.security_findings', N'id') IS NULL ALTER TABLE dbo.[security_findings] ADD [id] uniqueidentifier NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.security_findings') AND c.name=N'id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[security_findings] ALTER COLUMN [id] uniqueidentifier NOT NULL;

IF COL_LENGTH(N'dbo.security_findings', N'fingerprint') IS NULL ALTER TABLE dbo.[security_findings] ADD [fingerprint] nvarchar(450) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.security_findings') AND c.name=N'fingerprint' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[security_findings] ALTER COLUMN [fingerprint] nvarchar(450) NOT NULL;

IF COL_LENGTH(N'dbo.security_findings', N'source') IS NULL ALTER TABLE dbo.[security_findings] ADD [source] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.security_findings', N'severity') IS NULL ALTER TABLE dbo.[security_findings] ADD [severity] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.security_findings', N'title') IS NULL ALTER TABLE dbo.[security_findings] ADD [title] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.security_findings', N'detail') IS NULL ALTER TABLE dbo.[security_findings] ADD [detail] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.security_findings', N'deployment_ref') IS NULL ALTER TABLE dbo.[security_findings] ADD [deployment_ref] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.security_findings', N'status') IS NULL ALTER TABLE dbo.[security_findings] ADD [status] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.security_findings', N'first_seen_at') IS NULL ALTER TABLE dbo.[security_findings] ADD [first_seen_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.security_findings', N'last_seen_at') IS NULL ALTER TABLE dbo.[security_findings] ADD [last_seen_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.security_findings', N'acknowledged_by') IS NULL ALTER TABLE dbo.[security_findings] ADD [acknowledged_by] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.security_findings', N'acknowledged_at') IS NULL ALTER TABLE dbo.[security_findings] ADD [acknowledged_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.security_findings', N'resolved_at') IS NULL ALTER TABLE dbo.[security_findings] ADD [resolved_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.security_findings', N'created_at') IS NULL ALTER TABLE dbo.[security_findings] ADD [created_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.security_findings', N'updated_at') IS NULL ALTER TABLE dbo.[security_findings] ADD [updated_at] datetimeoffset(7) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.security_findings') AND c.name=N'updated_at' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[security_findings] ALTER COLUMN [updated_at] datetimeoffset(7) NOT NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.security_findings') AND name=N'UX_security_findings_fingerprint') CREATE UNIQUE INDEX [UX_security_findings_fingerprint] ON dbo.[security_findings]([fingerprint]);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.security_findings') AND name=N'IX_security_findings_updated_at') CREATE INDEX [IX_security_findings_updated_at] ON dbo.[security_findings]([updated_at]);

IF OBJECT_ID(N'dbo.settings_locks', N'U') IS NULL BEGIN CREATE TABLE dbo.[settings_locks] (

  [section] nvarchar(450) NOT NULL,
  [locked] bit NOT NULL CONSTRAINT [DF_settings_locks_locked] DEFAULT (0),
  [updated_by] nvarchar(max) NULL,
  [created_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_settings_locks_created_at] DEFAULT (SYSDATETIMEOFFSET()),
  [updated_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_settings_locks_updated_at] DEFAULT (SYSDATETIMEOFFSET()),
  CONSTRAINT [PK_settings_locks] PRIMARY KEY ([section])

); END;

IF OBJECT_ID(N'dbo.settings_locks', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.change_tracking_tables WHERE object_id=OBJECT_ID(N'dbo.settings_locks')) ALTER TABLE dbo.[settings_locks] ENABLE CHANGE_TRACKING;

IF COL_LENGTH(N'dbo.settings_locks', N'section') IS NULL ALTER TABLE dbo.[settings_locks] ADD [section] nvarchar(450) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.settings_locks') AND c.name=N'section' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[settings_locks] ALTER COLUMN [section] nvarchar(450) NOT NULL;

IF COL_LENGTH(N'dbo.settings_locks', N'locked') IS NULL ALTER TABLE dbo.[settings_locks] ADD [locked] bit NULL;

IF COL_LENGTH(N'dbo.settings_locks', N'updated_by') IS NULL ALTER TABLE dbo.[settings_locks] ADD [updated_by] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.settings_locks', N'created_at') IS NULL ALTER TABLE dbo.[settings_locks] ADD [created_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.settings_locks', N'updated_at') IS NULL ALTER TABLE dbo.[settings_locks] ADD [updated_at] datetimeoffset(7) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.settings_locks') AND c.name=N'updated_at' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[settings_locks] ALTER COLUMN [updated_at] datetimeoffset(7) NOT NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.settings_locks') AND name=N'IX_settings_locks_updated_at') CREATE INDEX [IX_settings_locks_updated_at] ON dbo.[settings_locks]([updated_at]);

IF OBJECT_ID(N'dbo.settings_overrides', N'U') IS NULL BEGIN CREATE TABLE dbo.[settings_overrides] (

  [scope] nvarchar(128) NOT NULL CONSTRAINT [DF_settings_overrides_scope] DEFAULT ('BRANCH'),
  [scope_id] nvarchar(128) NOT NULL CONSTRAINT [DF_settings_overrides_scope_id] DEFAULT (''),
  [section] nvarchar(128) NOT NULL,
  [patch] nvarchar(max) NOT NULL CONSTRAINT [DF_settings_overrides_patch] DEFAULT (N'[]'),
  [updated_by] nvarchar(max) NULL,
  [created_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_settings_overrides_created_at] DEFAULT (SYSDATETIMEOFFSET()),
  [updated_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_settings_overrides_updated_at] DEFAULT (SYSDATETIMEOFFSET()),
  CONSTRAINT [PK_settings_overrides] PRIMARY KEY ([scope], [scope_id], [section])

); END;

IF OBJECT_ID(N'dbo.settings_overrides', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.change_tracking_tables WHERE object_id=OBJECT_ID(N'dbo.settings_overrides')) ALTER TABLE dbo.[settings_overrides] ENABLE CHANGE_TRACKING;

IF COL_LENGTH(N'dbo.settings_overrides', N'scope') IS NULL ALTER TABLE dbo.[settings_overrides] ADD [scope] nvarchar(128) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.settings_overrides') AND c.name=N'scope' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[settings_overrides] ALTER COLUMN [scope] nvarchar(128) NOT NULL;

IF COL_LENGTH(N'dbo.settings_overrides', N'scope_id') IS NULL ALTER TABLE dbo.[settings_overrides] ADD [scope_id] nvarchar(128) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.settings_overrides') AND c.name=N'scope_id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[settings_overrides] ALTER COLUMN [scope_id] nvarchar(128) NOT NULL;

IF COL_LENGTH(N'dbo.settings_overrides', N'section') IS NULL ALTER TABLE dbo.[settings_overrides] ADD [section] nvarchar(128) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.settings_overrides') AND c.name=N'section' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[settings_overrides] ALTER COLUMN [section] nvarchar(128) NOT NULL;

IF COL_LENGTH(N'dbo.settings_overrides', N'patch') IS NULL ALTER TABLE dbo.[settings_overrides] ADD [patch] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.settings_overrides', N'updated_by') IS NULL ALTER TABLE dbo.[settings_overrides] ADD [updated_by] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.settings_overrides', N'created_at') IS NULL ALTER TABLE dbo.[settings_overrides] ADD [created_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.settings_overrides', N'updated_at') IS NULL ALTER TABLE dbo.[settings_overrides] ADD [updated_at] datetimeoffset(7) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.settings_overrides') AND c.name=N'updated_at' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[settings_overrides] ALTER COLUMN [updated_at] datetimeoffset(7) NOT NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.settings_overrides') AND name=N'IX_settings_overrides_updated_at') CREATE INDEX [IX_settings_overrides_updated_at] ON dbo.[settings_overrides]([updated_at]);

IF OBJECT_ID(N'dbo.shift_sessions', N'U') IS NULL BEGIN CREATE TABLE dbo.[shift_sessions] (

  [id] uniqueidentifier NOT NULL CONSTRAINT [DF_shift_sessions_id] DEFAULT (NEWID()),
  [shift_id] nvarchar(max) NULL,
  [store_id] nvarchar(450) NOT NULL,
  [terminal_id] nvarchar(max) NULL,
  [terminal_name] nvarchar(max) NULL,
  [staff_id] nvarchar(max) NULL,
  [staff_name] nvarchar(max) NOT NULL,
  [role] nvarchar(max) NULL,
  [signed_in_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_shift_sessions_signed_in_at] DEFAULT (SYSDATETIMEOFFSET()),
  [signed_out_at] datetimeoffset(7) NULL,
  [created_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_shift_sessions_created_at] DEFAULT (SYSDATETIMEOFFSET()),
  [updated_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_shift_sessions_updated_at] DEFAULT (SYSDATETIMEOFFSET()),
  [row_version] int NOT NULL CONSTRAINT [DF_shift_sessions_row_version] DEFAULT (1),
  CONSTRAINT [PK_shift_sessions] PRIMARY KEY ([id])

); END;

IF OBJECT_ID(N'dbo.shift_sessions', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.change_tracking_tables WHERE object_id=OBJECT_ID(N'dbo.shift_sessions')) ALTER TABLE dbo.[shift_sessions] ENABLE CHANGE_TRACKING;

IF COL_LENGTH(N'dbo.shift_sessions', N'id') IS NULL ALTER TABLE dbo.[shift_sessions] ADD [id] uniqueidentifier NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.shift_sessions') AND c.name=N'id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[shift_sessions] ALTER COLUMN [id] uniqueidentifier NOT NULL;

IF COL_LENGTH(N'dbo.shift_sessions', N'shift_id') IS NULL ALTER TABLE dbo.[shift_sessions] ADD [shift_id] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.shift_sessions', N'store_id') IS NULL ALTER TABLE dbo.[shift_sessions] ADD [store_id] nvarchar(450) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.shift_sessions') AND c.name=N'store_id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[shift_sessions] ALTER COLUMN [store_id] nvarchar(450) NOT NULL;

IF COL_LENGTH(N'dbo.shift_sessions', N'terminal_id') IS NULL ALTER TABLE dbo.[shift_sessions] ADD [terminal_id] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.shift_sessions', N'terminal_name') IS NULL ALTER TABLE dbo.[shift_sessions] ADD [terminal_name] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.shift_sessions', N'staff_id') IS NULL ALTER TABLE dbo.[shift_sessions] ADD [staff_id] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.shift_sessions', N'staff_name') IS NULL ALTER TABLE dbo.[shift_sessions] ADD [staff_name] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.shift_sessions', N'role') IS NULL ALTER TABLE dbo.[shift_sessions] ADD [role] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.shift_sessions', N'signed_in_at') IS NULL ALTER TABLE dbo.[shift_sessions] ADD [signed_in_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.shift_sessions', N'signed_out_at') IS NULL ALTER TABLE dbo.[shift_sessions] ADD [signed_out_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.shift_sessions', N'created_at') IS NULL ALTER TABLE dbo.[shift_sessions] ADD [created_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.shift_sessions', N'updated_at') IS NULL ALTER TABLE dbo.[shift_sessions] ADD [updated_at] datetimeoffset(7) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.shift_sessions') AND c.name=N'updated_at' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[shift_sessions] ALTER COLUMN [updated_at] datetimeoffset(7) NOT NULL;

IF COL_LENGTH(N'dbo.shift_sessions', N'row_version') IS NULL ALTER TABLE dbo.[shift_sessions] ADD [row_version] int NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.shift_sessions') AND name=N'IX_shift_sessions_store_id') CREATE INDEX [IX_shift_sessions_store_id] ON dbo.[shift_sessions]([store_id]);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.shift_sessions') AND name=N'IX_shift_sessions_updated_at') CREATE INDEX [IX_shift_sessions_updated_at] ON dbo.[shift_sessions]([updated_at]);

IF OBJECT_ID(N'dbo.sku_audit', N'U') IS NULL BEGIN CREATE TABLE dbo.[sku_audit] (

  [id] uniqueidentifier NOT NULL CONSTRAINT [DF_sku_audit_id] DEFAULT (NEWID()),
  [sku] nvarchar(max) NOT NULL,
  [product_id] uniqueidentifier NULL,
  [product_name] nvarchar(max) NULL,
  [source] nvarchar(max) NOT NULL CONSTRAINT [DF_sku_audit_source] DEFAULT ('auto'),
  [previous_sku] nvarchar(max) NULL,
  [store_id] nvarchar(450) NULL,
  [store_name] nvarchar(max) NULL,
  [terminal_id] nvarchar(max) NULL,
  [staff_id] nvarchar(max) NULL,
  [staff_name] nvarchar(max) NULL,
  [role] nvarchar(max) NULL,
  [created_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_sku_audit_created_at] DEFAULT (SYSDATETIMEOFFSET()),
  CONSTRAINT [PK_sku_audit] PRIMARY KEY ([id])

); END;

IF OBJECT_ID(N'dbo.sku_audit', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.change_tracking_tables WHERE object_id=OBJECT_ID(N'dbo.sku_audit')) ALTER TABLE dbo.[sku_audit] ENABLE CHANGE_TRACKING;

IF COL_LENGTH(N'dbo.sku_audit', N'id') IS NULL ALTER TABLE dbo.[sku_audit] ADD [id] uniqueidentifier NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.sku_audit') AND c.name=N'id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[sku_audit] ALTER COLUMN [id] uniqueidentifier NOT NULL;

IF COL_LENGTH(N'dbo.sku_audit', N'sku') IS NULL ALTER TABLE dbo.[sku_audit] ADD [sku] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.sku_audit', N'product_id') IS NULL ALTER TABLE dbo.[sku_audit] ADD [product_id] uniqueidentifier NULL;

IF COL_LENGTH(N'dbo.sku_audit', N'product_name') IS NULL ALTER TABLE dbo.[sku_audit] ADD [product_name] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.sku_audit', N'source') IS NULL ALTER TABLE dbo.[sku_audit] ADD [source] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.sku_audit', N'previous_sku') IS NULL ALTER TABLE dbo.[sku_audit] ADD [previous_sku] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.sku_audit', N'store_id') IS NULL ALTER TABLE dbo.[sku_audit] ADD [store_id] nvarchar(450) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.sku_audit') AND c.name=N'store_id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[sku_audit] ALTER COLUMN [store_id] nvarchar(450) NULL;

IF COL_LENGTH(N'dbo.sku_audit', N'store_name') IS NULL ALTER TABLE dbo.[sku_audit] ADD [store_name] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.sku_audit', N'terminal_id') IS NULL ALTER TABLE dbo.[sku_audit] ADD [terminal_id] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.sku_audit', N'staff_id') IS NULL ALTER TABLE dbo.[sku_audit] ADD [staff_id] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.sku_audit', N'staff_name') IS NULL ALTER TABLE dbo.[sku_audit] ADD [staff_name] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.sku_audit', N'role') IS NULL ALTER TABLE dbo.[sku_audit] ADD [role] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.sku_audit', N'created_at') IS NULL ALTER TABLE dbo.[sku_audit] ADD [created_at] datetimeoffset(7) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.sku_audit') AND name=N'IX_sku_audit_store_id') CREATE INDEX [IX_sku_audit_store_id] ON dbo.[sku_audit]([store_id]);

IF OBJECT_ID(N'dbo.staff_roles', N'U') IS NULL BEGIN CREATE TABLE dbo.[staff_roles] (

  [slug] nvarchar(450) NOT NULL,
  [name] nvarchar(max) NOT NULL,
  [base_level] nvarchar(max) NOT NULL CONSTRAINT [DF_staff_roles_base_level] DEFAULT ('cashier'),
  [permissions] nvarchar(max) NOT NULL CONSTRAINT [DF_staff_roles_permissions] DEFAULT (N'[]'),
  [is_core] bit NOT NULL CONSTRAINT [DF_staff_roles_is_core] DEFAULT (0),
  [created_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_staff_roles_created_at] DEFAULT (SYSDATETIMEOFFSET()),
  [updated_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_staff_roles_updated_at] DEFAULT (SYSDATETIMEOFFSET()),
  CONSTRAINT [PK_staff_roles] PRIMARY KEY ([slug])

); END;

IF OBJECT_ID(N'dbo.staff_roles', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.change_tracking_tables WHERE object_id=OBJECT_ID(N'dbo.staff_roles')) ALTER TABLE dbo.[staff_roles] ENABLE CHANGE_TRACKING;

IF COL_LENGTH(N'dbo.staff_roles', N'slug') IS NULL ALTER TABLE dbo.[staff_roles] ADD [slug] nvarchar(450) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.staff_roles') AND c.name=N'slug' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[staff_roles] ALTER COLUMN [slug] nvarchar(450) NOT NULL;

IF COL_LENGTH(N'dbo.staff_roles', N'name') IS NULL ALTER TABLE dbo.[staff_roles] ADD [name] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.staff_roles', N'base_level') IS NULL ALTER TABLE dbo.[staff_roles] ADD [base_level] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.staff_roles', N'permissions') IS NULL ALTER TABLE dbo.[staff_roles] ADD [permissions] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.staff_roles', N'is_core') IS NULL ALTER TABLE dbo.[staff_roles] ADD [is_core] bit NULL;

IF COL_LENGTH(N'dbo.staff_roles', N'created_at') IS NULL ALTER TABLE dbo.[staff_roles] ADD [created_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.staff_roles', N'updated_at') IS NULL ALTER TABLE dbo.[staff_roles] ADD [updated_at] datetimeoffset(7) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.staff_roles') AND c.name=N'updated_at' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[staff_roles] ALTER COLUMN [updated_at] datetimeoffset(7) NOT NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.staff_roles') AND name=N'IX_staff_roles_updated_at') CREATE INDEX [IX_staff_roles_updated_at] ON dbo.[staff_roles]([updated_at]);

IF OBJECT_ID(N'dbo.stock_adjustments', N'U') IS NULL BEGIN CREATE TABLE dbo.[stock_adjustments] (

  [id] uniqueidentifier NOT NULL CONSTRAINT [DF_stock_adjustments_id] DEFAULT (NEWID()),
  [product_id] uniqueidentifier NULL,
  [product_name] nvarchar(max) NULL,
  [sku] nvarchar(max) NULL,
  [barcode] nvarchar(max) NULL,
  [store_id] nvarchar(450) NULL,
  [terminal_id] nvarchar(max) NULL,
  [reason] nvarchar(max) NOT NULL CONSTRAINT [DF_stock_adjustments_reason] DEFAULT ('manual'),
  [note] nvarchar(max) NOT NULL CONSTRAINT [DF_stock_adjustments_note] DEFAULT (''),
  [previous_stock] int NOT NULL CONSTRAINT [DF_stock_adjustments_previous_stock] DEFAULT (0),
  [updated_stock] int NOT NULL CONSTRAINT [DF_stock_adjustments_updated_stock] DEFAULT (0),
  [delta] int NOT NULL CONSTRAINT [DF_stock_adjustments_delta] DEFAULT (0),
  [cost_impact] decimal(38,12) NOT NULL CONSTRAINT [DF_stock_adjustments_cost_impact] DEFAULT (0),
  [staff_id] nvarchar(max) NULL,
  [staff_name] nvarchar(max) NULL,
  [role] nvarchar(max) NULL,
  [created_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_stock_adjustments_created_at] DEFAULT (SYSDATETIMEOFFSET()),
  [row_version] int NOT NULL CONSTRAINT [DF_stock_adjustments_row_version] DEFAULT (1),
  [draft_id] uniqueidentifier NULL,
  CONSTRAINT [PK_stock_adjustments] PRIMARY KEY ([id])

); END;

IF OBJECT_ID(N'dbo.stock_adjustments', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.change_tracking_tables WHERE object_id=OBJECT_ID(N'dbo.stock_adjustments')) ALTER TABLE dbo.[stock_adjustments] ENABLE CHANGE_TRACKING;

IF COL_LENGTH(N'dbo.stock_adjustments', N'id') IS NULL ALTER TABLE dbo.[stock_adjustments] ADD [id] uniqueidentifier NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.stock_adjustments') AND c.name=N'id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[stock_adjustments] ALTER COLUMN [id] uniqueidentifier NOT NULL;

IF COL_LENGTH(N'dbo.stock_adjustments', N'product_id') IS NULL ALTER TABLE dbo.[stock_adjustments] ADD [product_id] uniqueidentifier NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.stock_adjustments') AND c.name=N'product_id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[stock_adjustments] ALTER COLUMN [product_id] uniqueidentifier NULL;

IF COL_LENGTH(N'dbo.stock_adjustments', N'product_name') IS NULL ALTER TABLE dbo.[stock_adjustments] ADD [product_name] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.stock_adjustments', N'sku') IS NULL ALTER TABLE dbo.[stock_adjustments] ADD [sku] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.stock_adjustments', N'barcode') IS NULL ALTER TABLE dbo.[stock_adjustments] ADD [barcode] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.stock_adjustments', N'store_id') IS NULL ALTER TABLE dbo.[stock_adjustments] ADD [store_id] nvarchar(450) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.stock_adjustments') AND c.name=N'store_id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[stock_adjustments] ALTER COLUMN [store_id] nvarchar(450) NULL;

IF COL_LENGTH(N'dbo.stock_adjustments', N'terminal_id') IS NULL ALTER TABLE dbo.[stock_adjustments] ADD [terminal_id] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.stock_adjustments', N'reason') IS NULL ALTER TABLE dbo.[stock_adjustments] ADD [reason] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.stock_adjustments', N'note') IS NULL ALTER TABLE dbo.[stock_adjustments] ADD [note] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.stock_adjustments', N'previous_stock') IS NULL ALTER TABLE dbo.[stock_adjustments] ADD [previous_stock] int NULL;

IF COL_LENGTH(N'dbo.stock_adjustments', N'updated_stock') IS NULL ALTER TABLE dbo.[stock_adjustments] ADD [updated_stock] int NULL;

IF COL_LENGTH(N'dbo.stock_adjustments', N'delta') IS NULL ALTER TABLE dbo.[stock_adjustments] ADD [delta] int NULL;

IF COL_LENGTH(N'dbo.stock_adjustments', N'cost_impact') IS NULL ALTER TABLE dbo.[stock_adjustments] ADD [cost_impact] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.stock_adjustments', N'staff_id') IS NULL ALTER TABLE dbo.[stock_adjustments] ADD [staff_id] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.stock_adjustments', N'staff_name') IS NULL ALTER TABLE dbo.[stock_adjustments] ADD [staff_name] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.stock_adjustments', N'role') IS NULL ALTER TABLE dbo.[stock_adjustments] ADD [role] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.stock_adjustments', N'created_at') IS NULL ALTER TABLE dbo.[stock_adjustments] ADD [created_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.stock_adjustments', N'row_version') IS NULL ALTER TABLE dbo.[stock_adjustments] ADD [row_version] int NULL;

IF COL_LENGTH(N'dbo.stock_adjustments', N'draft_id') IS NULL ALTER TABLE dbo.[stock_adjustments] ADD [draft_id] uniqueidentifier NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.stock_adjustments') AND name=N'IX_stock_adjustments_store_id') CREATE INDEX [IX_stock_adjustments_store_id] ON dbo.[stock_adjustments]([store_id]);

IF OBJECT_ID(N'dbo.stock_delta_applied', N'U') IS NULL BEGIN CREATE TABLE dbo.[stock_delta_applied] (

  [movement_id] uniqueidentifier NOT NULL,
  [product_id] uniqueidentifier NULL,
  [store_id] nvarchar(450) NULL,
  [delta] int NOT NULL CONSTRAINT [DF_stock_delta_applied_delta] DEFAULT (0),
  [applied_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_stock_delta_applied_applied_at] DEFAULT (SYSDATETIMEOFFSET()),
  CONSTRAINT [PK_stock_delta_applied] PRIMARY KEY ([movement_id])

); END;

IF OBJECT_ID(N'dbo.stock_delta_applied', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.change_tracking_tables WHERE object_id=OBJECT_ID(N'dbo.stock_delta_applied')) ALTER TABLE dbo.[stock_delta_applied] ENABLE CHANGE_TRACKING;

IF COL_LENGTH(N'dbo.stock_delta_applied', N'movement_id') IS NULL ALTER TABLE dbo.[stock_delta_applied] ADD [movement_id] uniqueidentifier NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.stock_delta_applied') AND c.name=N'movement_id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[stock_delta_applied] ALTER COLUMN [movement_id] uniqueidentifier NOT NULL;

IF COL_LENGTH(N'dbo.stock_delta_applied', N'product_id') IS NULL ALTER TABLE dbo.[stock_delta_applied] ADD [product_id] uniqueidentifier NULL;

IF COL_LENGTH(N'dbo.stock_delta_applied', N'store_id') IS NULL ALTER TABLE dbo.[stock_delta_applied] ADD [store_id] nvarchar(450) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.stock_delta_applied') AND c.name=N'store_id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[stock_delta_applied] ALTER COLUMN [store_id] nvarchar(450) NULL;

IF COL_LENGTH(N'dbo.stock_delta_applied', N'delta') IS NULL ALTER TABLE dbo.[stock_delta_applied] ADD [delta] int NULL;

IF COL_LENGTH(N'dbo.stock_delta_applied', N'applied_at') IS NULL ALTER TABLE dbo.[stock_delta_applied] ADD [applied_at] datetimeoffset(7) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.stock_delta_applied') AND name=N'IX_stock_delta_applied_store_id') CREATE INDEX [IX_stock_delta_applied_store_id] ON dbo.[stock_delta_applied]([store_id]);

IF OBJECT_ID(N'dbo.stock_transfer_items', N'U') IS NULL BEGIN CREATE TABLE dbo.[stock_transfer_items] (

  [id] uniqueidentifier NOT NULL CONSTRAINT [DF_stock_transfer_items_id] DEFAULT (NEWID()),
  [transfer_id] uniqueidentifier NOT NULL,
  [product_id] uniqueidentifier NULL,
  [barcode] nvarchar(max) NULL,
  [sku] nvarchar(max) NULL,
  [product_name] nvarchar(max) NULL,
  [quantity] int NOT NULL CONSTRAINT [DF_stock_transfer_items_quantity] DEFAULT (0),
  [quantity_received] int NOT NULL CONSTRAINT [DF_stock_transfer_items_quantity_received] DEFAULT (0),
  [unit_cost] decimal(38,12) NOT NULL CONSTRAINT [DF_stock_transfer_items_unit_cost] DEFAULT (0),
  [created_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_stock_transfer_items_created_at] DEFAULT (SYSDATETIMEOFFSET()),
  [row_version] int NOT NULL CONSTRAINT [DF_stock_transfer_items_row_version] DEFAULT (1),
  [quantity_approved] int NULL,
  [quantity_dispatched] int NULL,
  [quantity_verified] int NULL,
  CONSTRAINT [PK_stock_transfer_items] PRIMARY KEY ([id])

); END;

IF OBJECT_ID(N'dbo.stock_transfer_items', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.change_tracking_tables WHERE object_id=OBJECT_ID(N'dbo.stock_transfer_items')) ALTER TABLE dbo.[stock_transfer_items] ENABLE CHANGE_TRACKING;

IF COL_LENGTH(N'dbo.stock_transfer_items', N'id') IS NULL ALTER TABLE dbo.[stock_transfer_items] ADD [id] uniqueidentifier NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.stock_transfer_items') AND c.name=N'id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[stock_transfer_items] ALTER COLUMN [id] uniqueidentifier NOT NULL;

IF COL_LENGTH(N'dbo.stock_transfer_items', N'transfer_id') IS NULL ALTER TABLE dbo.[stock_transfer_items] ADD [transfer_id] uniqueidentifier NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.stock_transfer_items') AND c.name=N'transfer_id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[stock_transfer_items] ALTER COLUMN [transfer_id] uniqueidentifier NOT NULL;

IF COL_LENGTH(N'dbo.stock_transfer_items', N'product_id') IS NULL ALTER TABLE dbo.[stock_transfer_items] ADD [product_id] uniqueidentifier NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.stock_transfer_items') AND c.name=N'product_id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[stock_transfer_items] ALTER COLUMN [product_id] uniqueidentifier NULL;

IF COL_LENGTH(N'dbo.stock_transfer_items', N'barcode') IS NULL ALTER TABLE dbo.[stock_transfer_items] ADD [barcode] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.stock_transfer_items', N'sku') IS NULL ALTER TABLE dbo.[stock_transfer_items] ADD [sku] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.stock_transfer_items', N'product_name') IS NULL ALTER TABLE dbo.[stock_transfer_items] ADD [product_name] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.stock_transfer_items', N'quantity') IS NULL ALTER TABLE dbo.[stock_transfer_items] ADD [quantity] int NULL;

IF COL_LENGTH(N'dbo.stock_transfer_items', N'quantity_received') IS NULL ALTER TABLE dbo.[stock_transfer_items] ADD [quantity_received] int NULL;

IF COL_LENGTH(N'dbo.stock_transfer_items', N'unit_cost') IS NULL ALTER TABLE dbo.[stock_transfer_items] ADD [unit_cost] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.stock_transfer_items', N'created_at') IS NULL ALTER TABLE dbo.[stock_transfer_items] ADD [created_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.stock_transfer_items', N'row_version') IS NULL ALTER TABLE dbo.[stock_transfer_items] ADD [row_version] int NULL;

IF COL_LENGTH(N'dbo.stock_transfer_items', N'quantity_approved') IS NULL ALTER TABLE dbo.[stock_transfer_items] ADD [quantity_approved] int NULL;

IF COL_LENGTH(N'dbo.stock_transfer_items', N'quantity_dispatched') IS NULL ALTER TABLE dbo.[stock_transfer_items] ADD [quantity_dispatched] int NULL;

IF COL_LENGTH(N'dbo.stock_transfer_items', N'quantity_verified') IS NULL ALTER TABLE dbo.[stock_transfer_items] ADD [quantity_verified] int NULL;

IF OBJECT_ID(N'dbo.stock_transfers', N'U') IS NULL BEGIN CREATE TABLE dbo.[stock_transfers] (

  [id] uniqueidentifier NOT NULL CONSTRAINT [DF_stock_transfers_id] DEFAULT (NEWID()),
  [ref] nvarchar(450) NOT NULL,
  [kind] nvarchar(max) NOT NULL CONSTRAINT [DF_stock_transfers_kind] DEFAULT ('transfer'),
  [transfer_scope] nvarchar(max) NOT NULL CONSTRAINT [DF_stock_transfers_transfer_scope] DEFAULT ('INTRA_GROUP'),
  [from_store_id] nvarchar(max) NOT NULL,
  [from_store_name] nvarchar(max) NULL,
  [from_group_id] nvarchar(max) NULL,
  [to_store_id] nvarchar(max) NOT NULL,
  [to_store_name] nvarchar(max) NULL,
  [to_group_id] nvarchar(max) NULL,
  [status] nvarchar(max) NOT NULL CONSTRAINT [DF_stock_transfers_status] DEFAULT ('pending'),
  [note] nvarchar(max) NOT NULL CONSTRAINT [DF_stock_transfers_note] DEFAULT (''),
  [created_by] nvarchar(max) NULL,
  [approved_by] nvarchar(max) NULL,
  [approved_at] datetimeoffset(7) NULL,
  [received_by] nvarchar(max) NULL,
  [received_at] datetimeoffset(7) NULL,
  [rejected_reason] nvarchar(max) NULL,
  [created_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_stock_transfers_created_at] DEFAULT (SYSDATETIMEOFFSET()),
  [updated_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_stock_transfers_updated_at] DEFAULT (SYSDATETIMEOFFSET()),
  [row_version] int NOT NULL CONSTRAINT [DF_stock_transfers_row_version] DEFAULT (1),
  [verified_by] nvarchar(max) NULL,
  CONSTRAINT [PK_stock_transfers] PRIMARY KEY ([id])

); END;

IF OBJECT_ID(N'dbo.stock_transfers', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.change_tracking_tables WHERE object_id=OBJECT_ID(N'dbo.stock_transfers')) ALTER TABLE dbo.[stock_transfers] ENABLE CHANGE_TRACKING;

IF COL_LENGTH(N'dbo.stock_transfers', N'id') IS NULL ALTER TABLE dbo.[stock_transfers] ADD [id] uniqueidentifier NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.stock_transfers') AND c.name=N'id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[stock_transfers] ALTER COLUMN [id] uniqueidentifier NOT NULL;

IF COL_LENGTH(N'dbo.stock_transfers', N'ref') IS NULL ALTER TABLE dbo.[stock_transfers] ADD [ref] nvarchar(450) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.stock_transfers') AND c.name=N'ref' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[stock_transfers] ALTER COLUMN [ref] nvarchar(450) NOT NULL;

IF COL_LENGTH(N'dbo.stock_transfers', N'kind') IS NULL ALTER TABLE dbo.[stock_transfers] ADD [kind] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.stock_transfers', N'transfer_scope') IS NULL ALTER TABLE dbo.[stock_transfers] ADD [transfer_scope] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.stock_transfers', N'from_store_id') IS NULL ALTER TABLE dbo.[stock_transfers] ADD [from_store_id] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.stock_transfers', N'from_store_name') IS NULL ALTER TABLE dbo.[stock_transfers] ADD [from_store_name] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.stock_transfers', N'from_group_id') IS NULL ALTER TABLE dbo.[stock_transfers] ADD [from_group_id] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.stock_transfers', N'to_store_id') IS NULL ALTER TABLE dbo.[stock_transfers] ADD [to_store_id] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.stock_transfers', N'to_store_name') IS NULL ALTER TABLE dbo.[stock_transfers] ADD [to_store_name] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.stock_transfers', N'to_group_id') IS NULL ALTER TABLE dbo.[stock_transfers] ADD [to_group_id] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.stock_transfers', N'status') IS NULL ALTER TABLE dbo.[stock_transfers] ADD [status] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.stock_transfers', N'note') IS NULL ALTER TABLE dbo.[stock_transfers] ADD [note] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.stock_transfers', N'created_by') IS NULL ALTER TABLE dbo.[stock_transfers] ADD [created_by] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.stock_transfers', N'approved_by') IS NULL ALTER TABLE dbo.[stock_transfers] ADD [approved_by] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.stock_transfers', N'approved_at') IS NULL ALTER TABLE dbo.[stock_transfers] ADD [approved_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.stock_transfers', N'received_by') IS NULL ALTER TABLE dbo.[stock_transfers] ADD [received_by] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.stock_transfers', N'received_at') IS NULL ALTER TABLE dbo.[stock_transfers] ADD [received_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.stock_transfers', N'rejected_reason') IS NULL ALTER TABLE dbo.[stock_transfers] ADD [rejected_reason] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.stock_transfers', N'created_at') IS NULL ALTER TABLE dbo.[stock_transfers] ADD [created_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.stock_transfers', N'updated_at') IS NULL ALTER TABLE dbo.[stock_transfers] ADD [updated_at] datetimeoffset(7) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.stock_transfers') AND c.name=N'updated_at' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[stock_transfers] ALTER COLUMN [updated_at] datetimeoffset(7) NOT NULL;

IF COL_LENGTH(N'dbo.stock_transfers', N'row_version') IS NULL ALTER TABLE dbo.[stock_transfers] ADD [row_version] int NULL;

IF COL_LENGTH(N'dbo.stock_transfers', N'verified_by') IS NULL ALTER TABLE dbo.[stock_transfers] ADD [verified_by] nvarchar(max) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.stock_transfers') AND name=N'UX_stock_transfers_ref') CREATE UNIQUE INDEX [UX_stock_transfers_ref] ON dbo.[stock_transfers]([ref]);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.stock_transfers') AND name=N'IX_stock_transfers_updated_at') CREATE INDEX [IX_stock_transfers_updated_at] ON dbo.[stock_transfers]([updated_at]);

IF OBJECT_ID(N'dbo.stores', N'U') IS NULL BEGIN CREATE TABLE dbo.[stores] (

  [id] nvarchar(450) NOT NULL,
  [code] nvarchar(max) NOT NULL,
  [name] nvarchar(max) NOT NULL,
  [address] nvarchar(max) NULL,
  [phone] nvarchar(max) NULL,
  [created_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_stores_created_at] DEFAULT (SYSDATETIMEOFFSET()),
  [updated_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_stores_updated_at] DEFAULT (SYSDATETIMEOFFSET()),
  [group_id] nvarchar(450) NULL,
  [row_version] int NOT NULL CONSTRAINT [DF_stores_row_version] DEFAULT (1),
  [location_type] nvarchar(max) NOT NULL CONSTRAINT [DF_stores_location_type] DEFAULT ('store'),
  [parent_id] nvarchar(450) NULL,
  [is_central] bit NOT NULL CONSTRAINT [DF_stores_is_central] DEFAULT (0),
  [building_name] nvarchar(max) NULL,
  [floor_label] nvarchar(max) NULL,
  [is_active] bit NOT NULL CONSTRAINT [DF_stores_is_active] DEFAULT (1),
  [archived_at] datetimeoffset(7) NULL,
  [is_primary_sub] bit NOT NULL CONSTRAINT [DF_stores_is_primary_sub] DEFAULT (0),
  [private_catalogue] bit NOT NULL CONSTRAINT [DF_stores_private_catalogue] DEFAULT (0),
  CONSTRAINT [PK_stores] PRIMARY KEY ([id])

); END;

IF OBJECT_ID(N'dbo.stores', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.change_tracking_tables WHERE object_id=OBJECT_ID(N'dbo.stores')) ALTER TABLE dbo.[stores] ENABLE CHANGE_TRACKING;

IF COL_LENGTH(N'dbo.stores', N'id') IS NULL ALTER TABLE dbo.[stores] ADD [id] nvarchar(450) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.stores') AND c.name=N'id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[stores] ALTER COLUMN [id] nvarchar(450) NOT NULL;

IF COL_LENGTH(N'dbo.stores', N'code') IS NULL ALTER TABLE dbo.[stores] ADD [code] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.stores', N'name') IS NULL ALTER TABLE dbo.[stores] ADD [name] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.stores', N'address') IS NULL ALTER TABLE dbo.[stores] ADD [address] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.stores', N'phone') IS NULL ALTER TABLE dbo.[stores] ADD [phone] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.stores', N'created_at') IS NULL ALTER TABLE dbo.[stores] ADD [created_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.stores', N'updated_at') IS NULL ALTER TABLE dbo.[stores] ADD [updated_at] datetimeoffset(7) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.stores') AND c.name=N'updated_at' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[stores] ALTER COLUMN [updated_at] datetimeoffset(7) NOT NULL;

IF COL_LENGTH(N'dbo.stores', N'group_id') IS NULL ALTER TABLE dbo.[stores] ADD [group_id] nvarchar(450) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.stores') AND c.name=N'group_id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[stores] ALTER COLUMN [group_id] nvarchar(450) NULL;

IF COL_LENGTH(N'dbo.stores', N'row_version') IS NULL ALTER TABLE dbo.[stores] ADD [row_version] int NULL;

IF COL_LENGTH(N'dbo.stores', N'location_type') IS NULL ALTER TABLE dbo.[stores] ADD [location_type] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.stores', N'parent_id') IS NULL ALTER TABLE dbo.[stores] ADD [parent_id] nvarchar(450) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.stores') AND c.name=N'parent_id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[stores] ALTER COLUMN [parent_id] nvarchar(450) NULL;

IF COL_LENGTH(N'dbo.stores', N'is_central') IS NULL ALTER TABLE dbo.[stores] ADD [is_central] bit NULL;

IF COL_LENGTH(N'dbo.stores', N'building_name') IS NULL ALTER TABLE dbo.[stores] ADD [building_name] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.stores', N'floor_label') IS NULL ALTER TABLE dbo.[stores] ADD [floor_label] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.stores', N'is_active') IS NULL ALTER TABLE dbo.[stores] ADD [is_active] bit NULL;

IF COL_LENGTH(N'dbo.stores', N'archived_at') IS NULL ALTER TABLE dbo.[stores] ADD [archived_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.stores', N'is_primary_sub') IS NULL ALTER TABLE dbo.[stores] ADD [is_primary_sub] bit NULL;

IF COL_LENGTH(N'dbo.stores', N'private_catalogue') IS NULL ALTER TABLE dbo.[stores] ADD [private_catalogue] bit NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.stores') AND name=N'IX_stores_updated_at') CREATE INDEX [IX_stores_updated_at] ON dbo.[stores]([updated_at]);

IF OBJECT_ID(N'dbo.suppliers', N'U') IS NULL BEGIN CREATE TABLE dbo.[suppliers] (

  [id] uniqueidentifier NOT NULL CONSTRAINT [DF_suppliers_id] DEFAULT (NEWID()),
  [name] nvarchar(max) NOT NULL,
  [contact_name] nvarchar(max) NULL,
  [phone] nvarchar(max) NULL,
  [email] nvarchar(max) NULL,
  [address] nvarchar(max) NULL,
  [tax_number] nvarchar(max) NULL,
  [notes] nvarchar(max) NULL,
  [is_active] bit NOT NULL CONSTRAINT [DF_suppliers_is_active] DEFAULT (1),
  [created_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_suppliers_created_at] DEFAULT (SYSDATETIMEOFFSET()),
  [updated_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_suppliers_updated_at] DEFAULT (SYSDATETIMEOFFSET()),
  [row_version] int NOT NULL CONSTRAINT [DF_suppliers_row_version] DEFAULT (1),
  CONSTRAINT [PK_suppliers] PRIMARY KEY ([id])

); END;

IF OBJECT_ID(N'dbo.suppliers', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.change_tracking_tables WHERE object_id=OBJECT_ID(N'dbo.suppliers')) ALTER TABLE dbo.[suppliers] ENABLE CHANGE_TRACKING;

IF COL_LENGTH(N'dbo.suppliers', N'id') IS NULL ALTER TABLE dbo.[suppliers] ADD [id] uniqueidentifier NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.suppliers') AND c.name=N'id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[suppliers] ALTER COLUMN [id] uniqueidentifier NOT NULL;

IF COL_LENGTH(N'dbo.suppliers', N'name') IS NULL ALTER TABLE dbo.[suppliers] ADD [name] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.suppliers', N'contact_name') IS NULL ALTER TABLE dbo.[suppliers] ADD [contact_name] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.suppliers', N'phone') IS NULL ALTER TABLE dbo.[suppliers] ADD [phone] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.suppliers', N'email') IS NULL ALTER TABLE dbo.[suppliers] ADD [email] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.suppliers', N'address') IS NULL ALTER TABLE dbo.[suppliers] ADD [address] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.suppliers', N'tax_number') IS NULL ALTER TABLE dbo.[suppliers] ADD [tax_number] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.suppliers', N'notes') IS NULL ALTER TABLE dbo.[suppliers] ADD [notes] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.suppliers', N'is_active') IS NULL ALTER TABLE dbo.[suppliers] ADD [is_active] bit NULL;

IF COL_LENGTH(N'dbo.suppliers', N'created_at') IS NULL ALTER TABLE dbo.[suppliers] ADD [created_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.suppliers', N'updated_at') IS NULL ALTER TABLE dbo.[suppliers] ADD [updated_at] datetimeoffset(7) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.suppliers') AND c.name=N'updated_at' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[suppliers] ALTER COLUMN [updated_at] datetimeoffset(7) NOT NULL;

IF COL_LENGTH(N'dbo.suppliers', N'row_version') IS NULL ALTER TABLE dbo.[suppliers] ADD [row_version] int NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.suppliers') AND name=N'IX_suppliers_updated_at') CREATE INDEX [IX_suppliers_updated_at] ON dbo.[suppliers]([updated_at]);

IF OBJECT_ID(N'dbo.sync_metadata', N'U') IS NULL BEGIN CREATE TABLE dbo.[sync_metadata] (

  [id] uniqueidentifier NOT NULL CONSTRAINT [DF_sync_metadata_id] DEFAULT (NEWID()),
  [store_id] nvarchar(128) NULL,
  [terminal_id] nvarchar(128) NULL,
  [table_name] nvarchar(128) NOT NULL,
  [last_synced_at] datetimeoffset(7) NULL,
  [last_pushed_at] datetimeoffset(7) NULL,
  [rows_pushed] int NOT NULL CONSTRAINT [DF_sync_metadata_rows_pushed] DEFAULT (0),
  [last_error] nvarchar(max) NULL,
  [created_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_sync_metadata_created_at] DEFAULT (SYSDATETIMEOFFSET()),
  [updated_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_sync_metadata_updated_at] DEFAULT (SYSDATETIMEOFFSET()),
  CONSTRAINT [PK_sync_metadata] PRIMARY KEY ([id])

); END;

IF OBJECT_ID(N'dbo.sync_metadata', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.change_tracking_tables WHERE object_id=OBJECT_ID(N'dbo.sync_metadata')) ALTER TABLE dbo.[sync_metadata] ENABLE CHANGE_TRACKING;

IF COL_LENGTH(N'dbo.sync_metadata', N'id') IS NULL ALTER TABLE dbo.[sync_metadata] ADD [id] uniqueidentifier NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.sync_metadata') AND c.name=N'id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[sync_metadata] ALTER COLUMN [id] uniqueidentifier NOT NULL;

IF COL_LENGTH(N'dbo.sync_metadata', N'store_id') IS NULL ALTER TABLE dbo.[sync_metadata] ADD [store_id] nvarchar(128) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.sync_metadata') AND c.name=N'store_id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[sync_metadata] ALTER COLUMN [store_id] nvarchar(128) NULL;

IF COL_LENGTH(N'dbo.sync_metadata', N'terminal_id') IS NULL ALTER TABLE dbo.[sync_metadata] ADD [terminal_id] nvarchar(128) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.sync_metadata') AND c.name=N'terminal_id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[sync_metadata] ALTER COLUMN [terminal_id] nvarchar(128) NULL;

IF COL_LENGTH(N'dbo.sync_metadata', N'table_name') IS NULL ALTER TABLE dbo.[sync_metadata] ADD [table_name] nvarchar(128) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.sync_metadata') AND c.name=N'table_name' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[sync_metadata] ALTER COLUMN [table_name] nvarchar(128) NOT NULL;

IF COL_LENGTH(N'dbo.sync_metadata', N'last_synced_at') IS NULL ALTER TABLE dbo.[sync_metadata] ADD [last_synced_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.sync_metadata', N'last_pushed_at') IS NULL ALTER TABLE dbo.[sync_metadata] ADD [last_pushed_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.sync_metadata', N'rows_pushed') IS NULL ALTER TABLE dbo.[sync_metadata] ADD [rows_pushed] int NULL;

IF COL_LENGTH(N'dbo.sync_metadata', N'last_error') IS NULL ALTER TABLE dbo.[sync_metadata] ADD [last_error] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.sync_metadata', N'created_at') IS NULL ALTER TABLE dbo.[sync_metadata] ADD [created_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.sync_metadata', N'updated_at') IS NULL ALTER TABLE dbo.[sync_metadata] ADD [updated_at] datetimeoffset(7) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.sync_metadata') AND c.name=N'updated_at' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[sync_metadata] ALTER COLUMN [updated_at] datetimeoffset(7) NOT NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.sync_metadata') AND name=N'UQ_sync_metadata_0') CREATE UNIQUE INDEX [UQ_sync_metadata_0] ON dbo.[sync_metadata]([store_id],[terminal_id],[table_name]);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.sync_metadata') AND name=N'IX_sync_metadata_store_id') CREATE INDEX [IX_sync_metadata_store_id] ON dbo.[sync_metadata]([store_id]);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.sync_metadata') AND name=N'IX_sync_metadata_updated_at') CREATE INDEX [IX_sync_metadata_updated_at] ON dbo.[sync_metadata]([updated_at]);

IF OBJECT_ID(N'dbo.system_audit_logs', N'U') IS NULL BEGIN CREATE TABLE dbo.[system_audit_logs] (

  [id] uniqueidentifier NOT NULL CONSTRAINT [DF_system_audit_logs_id] DEFAULT (NEWID()),
  [actor_id] nvarchar(max) NULL,
  [actor_name] nvarchar(max) NULL,
  [actor_role] nvarchar(max) NULL,
  [action_type] nvarchar(max) NOT NULL,
  [entity_affected] nvarchar(max) NULL,
  [entity_id] nvarchar(max) NULL,
  [old_value] nvarchar(max) NULL,
  [new_value] nvarchar(max) NULL,
  [terminal_id] nvarchar(max) NULL,
  [ip_address] nvarchar(max) NULL,
  [store_id] nvarchar(450) NULL,
  [note] nvarchar(max) NULL,
  [created_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_system_audit_logs_created_at] DEFAULT (SYSDATETIMEOFFSET()),
  CONSTRAINT [PK_system_audit_logs] PRIMARY KEY ([id])

); END;

IF OBJECT_ID(N'dbo.system_audit_logs', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.change_tracking_tables WHERE object_id=OBJECT_ID(N'dbo.system_audit_logs')) ALTER TABLE dbo.[system_audit_logs] ENABLE CHANGE_TRACKING;

IF COL_LENGTH(N'dbo.system_audit_logs', N'id') IS NULL ALTER TABLE dbo.[system_audit_logs] ADD [id] uniqueidentifier NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.system_audit_logs') AND c.name=N'id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[system_audit_logs] ALTER COLUMN [id] uniqueidentifier NOT NULL;

IF COL_LENGTH(N'dbo.system_audit_logs', N'actor_id') IS NULL ALTER TABLE dbo.[system_audit_logs] ADD [actor_id] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.system_audit_logs', N'actor_name') IS NULL ALTER TABLE dbo.[system_audit_logs] ADD [actor_name] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.system_audit_logs', N'actor_role') IS NULL ALTER TABLE dbo.[system_audit_logs] ADD [actor_role] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.system_audit_logs', N'action_type') IS NULL ALTER TABLE dbo.[system_audit_logs] ADD [action_type] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.system_audit_logs', N'entity_affected') IS NULL ALTER TABLE dbo.[system_audit_logs] ADD [entity_affected] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.system_audit_logs', N'entity_id') IS NULL ALTER TABLE dbo.[system_audit_logs] ADD [entity_id] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.system_audit_logs', N'old_value') IS NULL ALTER TABLE dbo.[system_audit_logs] ADD [old_value] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.system_audit_logs', N'new_value') IS NULL ALTER TABLE dbo.[system_audit_logs] ADD [new_value] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.system_audit_logs', N'terminal_id') IS NULL ALTER TABLE dbo.[system_audit_logs] ADD [terminal_id] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.system_audit_logs', N'ip_address') IS NULL ALTER TABLE dbo.[system_audit_logs] ADD [ip_address] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.system_audit_logs', N'store_id') IS NULL ALTER TABLE dbo.[system_audit_logs] ADD [store_id] nvarchar(450) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.system_audit_logs') AND c.name=N'store_id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[system_audit_logs] ALTER COLUMN [store_id] nvarchar(450) NULL;

IF COL_LENGTH(N'dbo.system_audit_logs', N'note') IS NULL ALTER TABLE dbo.[system_audit_logs] ADD [note] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.system_audit_logs', N'created_at') IS NULL ALTER TABLE dbo.[system_audit_logs] ADD [created_at] datetimeoffset(7) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.system_audit_logs') AND name=N'IX_system_audit_logs_store_id') CREATE INDEX [IX_system_audit_logs_store_id] ON dbo.[system_audit_logs]([store_id]);

IF OBJECT_ID(N'dbo.terminal_commands', N'U') IS NULL BEGIN CREATE TABLE dbo.[terminal_commands] (

  [id] uniqueidentifier NOT NULL CONSTRAINT [DF_terminal_commands_id] DEFAULT (NEWID()),
  [terminal_id] nvarchar(max) NOT NULL,
  [store_id] nvarchar(450) NULL,
  [command] nvarchar(max) NOT NULL,
  [status] nvarchar(max) NOT NULL CONSTRAINT [DF_terminal_commands_status] DEFAULT ('pending'),
  [note] nvarchar(max) NULL,
  [result] nvarchar(max) NULL,
  [issued_by] nvarchar(max) NULL,
  [issued_role] nvarchar(max) NULL,
  [picked_up_at] datetimeoffset(7) NULL,
  [finished_at] datetimeoffset(7) NULL,
  [created_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_terminal_commands_created_at] DEFAULT (SYSDATETIMEOFFSET()),
  [updated_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_terminal_commands_updated_at] DEFAULT (SYSDATETIMEOFFSET()),
  CONSTRAINT [PK_terminal_commands] PRIMARY KEY ([id])

); END;

IF OBJECT_ID(N'dbo.terminal_commands', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.change_tracking_tables WHERE object_id=OBJECT_ID(N'dbo.terminal_commands')) ALTER TABLE dbo.[terminal_commands] ENABLE CHANGE_TRACKING;

IF COL_LENGTH(N'dbo.terminal_commands', N'id') IS NULL ALTER TABLE dbo.[terminal_commands] ADD [id] uniqueidentifier NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.terminal_commands') AND c.name=N'id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[terminal_commands] ALTER COLUMN [id] uniqueidentifier NOT NULL;

IF COL_LENGTH(N'dbo.terminal_commands', N'terminal_id') IS NULL ALTER TABLE dbo.[terminal_commands] ADD [terminal_id] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.terminal_commands', N'store_id') IS NULL ALTER TABLE dbo.[terminal_commands] ADD [store_id] nvarchar(450) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.terminal_commands') AND c.name=N'store_id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[terminal_commands] ALTER COLUMN [store_id] nvarchar(450) NULL;

IF COL_LENGTH(N'dbo.terminal_commands', N'command') IS NULL ALTER TABLE dbo.[terminal_commands] ADD [command] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.terminal_commands', N'status') IS NULL ALTER TABLE dbo.[terminal_commands] ADD [status] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.terminal_commands', N'note') IS NULL ALTER TABLE dbo.[terminal_commands] ADD [note] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.terminal_commands', N'result') IS NULL ALTER TABLE dbo.[terminal_commands] ADD [result] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.terminal_commands', N'issued_by') IS NULL ALTER TABLE dbo.[terminal_commands] ADD [issued_by] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.terminal_commands', N'issued_role') IS NULL ALTER TABLE dbo.[terminal_commands] ADD [issued_role] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.terminal_commands', N'picked_up_at') IS NULL ALTER TABLE dbo.[terminal_commands] ADD [picked_up_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.terminal_commands', N'finished_at') IS NULL ALTER TABLE dbo.[terminal_commands] ADD [finished_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.terminal_commands', N'created_at') IS NULL ALTER TABLE dbo.[terminal_commands] ADD [created_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.terminal_commands', N'updated_at') IS NULL ALTER TABLE dbo.[terminal_commands] ADD [updated_at] datetimeoffset(7) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.terminal_commands') AND c.name=N'updated_at' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[terminal_commands] ALTER COLUMN [updated_at] datetimeoffset(7) NOT NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.terminal_commands') AND name=N'IX_terminal_commands_store_id') CREATE INDEX [IX_terminal_commands_store_id] ON dbo.[terminal_commands]([store_id]);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.terminal_commands') AND name=N'IX_terminal_commands_updated_at') CREATE INDEX [IX_terminal_commands_updated_at] ON dbo.[terminal_commands]([updated_at]);

IF OBJECT_ID(N'dbo.terminal_tokens', N'U') IS NULL BEGIN CREATE TABLE dbo.[terminal_tokens] (

  [id] uniqueidentifier NOT NULL CONSTRAINT [DF_terminal_tokens_id] DEFAULT (NEWID()),
  [location_id] nvarchar(450) NULL,
  [location_name] nvarchar(max) NULL,
  [device_name] nvarchar(max) NOT NULL,
  [status] nvarchar(max) NOT NULL CONSTRAINT [DF_terminal_tokens_status] DEFAULT ('active'),
  [created_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_terminal_tokens_created_at] DEFAULT (SYSDATETIMEOFFSET()),
  [activated_at] datetimeoffset(7) NULL,
  [revoked_at] datetimeoffset(7) NULL,
  [last_seen_at] datetimeoffset(7) NULL,
  [reissued_at] datetimeoffset(7) NULL,
  [replaced_by] uniqueidentifier NULL,
  [claimed_by_device] nvarchar(max) NULL,
  [claimed_at] datetimeoffset(7) NULL,
  [platform] nvarchar(max) NOT NULL CONSTRAINT [DF_terminal_tokens_platform] DEFAULT ('unknown'),
  [row_version] int NOT NULL CONSTRAINT [DF_terminal_tokens_row_version] DEFAULT (1),
  CONSTRAINT [PK_terminal_tokens] PRIMARY KEY ([id])

); END;

IF OBJECT_ID(N'dbo.terminal_tokens', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.change_tracking_tables WHERE object_id=OBJECT_ID(N'dbo.terminal_tokens')) ALTER TABLE dbo.[terminal_tokens] ENABLE CHANGE_TRACKING;

IF COL_LENGTH(N'dbo.terminal_tokens', N'id') IS NULL ALTER TABLE dbo.[terminal_tokens] ADD [id] uniqueidentifier NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.terminal_tokens') AND c.name=N'id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[terminal_tokens] ALTER COLUMN [id] uniqueidentifier NOT NULL;

IF COL_LENGTH(N'dbo.terminal_tokens', N'location_id') IS NULL ALTER TABLE dbo.[terminal_tokens] ADD [location_id] nvarchar(450) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.terminal_tokens') AND c.name=N'location_id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[terminal_tokens] ALTER COLUMN [location_id] nvarchar(450) NULL;

IF COL_LENGTH(N'dbo.terminal_tokens', N'location_name') IS NULL ALTER TABLE dbo.[terminal_tokens] ADD [location_name] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.terminal_tokens', N'device_name') IS NULL ALTER TABLE dbo.[terminal_tokens] ADD [device_name] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.terminal_tokens', N'status') IS NULL ALTER TABLE dbo.[terminal_tokens] ADD [status] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.terminal_tokens', N'created_at') IS NULL ALTER TABLE dbo.[terminal_tokens] ADD [created_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.terminal_tokens', N'activated_at') IS NULL ALTER TABLE dbo.[terminal_tokens] ADD [activated_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.terminal_tokens', N'revoked_at') IS NULL ALTER TABLE dbo.[terminal_tokens] ADD [revoked_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.terminal_tokens', N'last_seen_at') IS NULL ALTER TABLE dbo.[terminal_tokens] ADD [last_seen_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.terminal_tokens', N'reissued_at') IS NULL ALTER TABLE dbo.[terminal_tokens] ADD [reissued_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.terminal_tokens', N'replaced_by') IS NULL ALTER TABLE dbo.[terminal_tokens] ADD [replaced_by] uniqueidentifier NULL;

IF COL_LENGTH(N'dbo.terminal_tokens', N'claimed_by_device') IS NULL ALTER TABLE dbo.[terminal_tokens] ADD [claimed_by_device] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.terminal_tokens', N'claimed_at') IS NULL ALTER TABLE dbo.[terminal_tokens] ADD [claimed_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.terminal_tokens', N'platform') IS NULL ALTER TABLE dbo.[terminal_tokens] ADD [platform] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.terminal_tokens', N'row_version') IS NULL ALTER TABLE dbo.[terminal_tokens] ADD [row_version] int NULL;

IF OBJECT_ID(N'dbo.uom_units', N'U') IS NULL BEGIN CREATE TABLE dbo.[uom_units] (

  [id] uniqueidentifier NOT NULL CONSTRAINT [DF_uom_units_id] DEFAULT (NEWID()),
  [code] nvarchar(450) NOT NULL,
  [name] nvarchar(max) NOT NULL,
  [allow_decimal] bit NOT NULL CONSTRAINT [DF_uom_units_allow_decimal] DEFAULT (0),
  [sort] int NOT NULL CONSTRAINT [DF_uom_units_sort] DEFAULT (0),
  [created_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_uom_units_created_at] DEFAULT (SYSDATETIMEOFFSET()),
  [updated_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_uom_units_updated_at] DEFAULT (SYSDATETIMEOFFSET()),
  [row_version] int NOT NULL CONSTRAINT [DF_uom_units_row_version] DEFAULT (1),
  [is_active] bit NOT NULL CONSTRAINT [DF_uom_units_is_active] DEFAULT (1),
  CONSTRAINT [PK_uom_units] PRIMARY KEY ([id])

); END;

IF OBJECT_ID(N'dbo.uom_units', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.change_tracking_tables WHERE object_id=OBJECT_ID(N'dbo.uom_units')) ALTER TABLE dbo.[uom_units] ENABLE CHANGE_TRACKING;

IF COL_LENGTH(N'dbo.uom_units', N'id') IS NULL ALTER TABLE dbo.[uom_units] ADD [id] uniqueidentifier NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.uom_units') AND c.name=N'id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[uom_units] ALTER COLUMN [id] uniqueidentifier NOT NULL;

IF COL_LENGTH(N'dbo.uom_units', N'code') IS NULL ALTER TABLE dbo.[uom_units] ADD [code] nvarchar(450) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.uom_units') AND c.name=N'code' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[uom_units] ALTER COLUMN [code] nvarchar(450) NOT NULL;

IF COL_LENGTH(N'dbo.uom_units', N'name') IS NULL ALTER TABLE dbo.[uom_units] ADD [name] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.uom_units', N'allow_decimal') IS NULL ALTER TABLE dbo.[uom_units] ADD [allow_decimal] bit NULL;

IF COL_LENGTH(N'dbo.uom_units', N'sort') IS NULL ALTER TABLE dbo.[uom_units] ADD [sort] int NULL;

IF COL_LENGTH(N'dbo.uom_units', N'created_at') IS NULL ALTER TABLE dbo.[uom_units] ADD [created_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.uom_units', N'updated_at') IS NULL ALTER TABLE dbo.[uom_units] ADD [updated_at] datetimeoffset(7) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.uom_units') AND c.name=N'updated_at' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[uom_units] ALTER COLUMN [updated_at] datetimeoffset(7) NOT NULL;

IF COL_LENGTH(N'dbo.uom_units', N'row_version') IS NULL ALTER TABLE dbo.[uom_units] ADD [row_version] int NULL;

IF COL_LENGTH(N'dbo.uom_units', N'is_active') IS NULL ALTER TABLE dbo.[uom_units] ADD [is_active] bit NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.uom_units') AND name=N'UX_uom_units_code') CREATE UNIQUE INDEX [UX_uom_units_code] ON dbo.[uom_units]([code]);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.uom_units') AND name=N'IX_uom_units_updated_at') CREATE INDEX [IX_uom_units_updated_at] ON dbo.[uom_units]([updated_at]);

IF OBJECT_ID(N'dbo.user_roles', N'U') IS NULL BEGIN CREATE TABLE dbo.[user_roles] (

  [id] uniqueidentifier NOT NULL CONSTRAINT [DF_user_roles_id] DEFAULT (NEWID()),
  [user_id] uniqueidentifier NOT NULL,
  [role] nvarchar(128) NOT NULL,
  [created_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_user_roles_created_at] DEFAULT (SYSDATETIMEOFFSET()),
  CONSTRAINT [PK_user_roles] PRIMARY KEY ([id])

); END;

IF OBJECT_ID(N'dbo.user_roles', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.change_tracking_tables WHERE object_id=OBJECT_ID(N'dbo.user_roles')) ALTER TABLE dbo.[user_roles] ENABLE CHANGE_TRACKING;

IF COL_LENGTH(N'dbo.user_roles', N'id') IS NULL ALTER TABLE dbo.[user_roles] ADD [id] uniqueidentifier NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.user_roles') AND c.name=N'id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[user_roles] ALTER COLUMN [id] uniqueidentifier NOT NULL;

IF COL_LENGTH(N'dbo.user_roles', N'user_id') IS NULL ALTER TABLE dbo.[user_roles] ADD [user_id] uniqueidentifier NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.user_roles') AND c.name=N'user_id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[user_roles] ALTER COLUMN [user_id] uniqueidentifier NOT NULL;

IF COL_LENGTH(N'dbo.user_roles', N'role') IS NULL ALTER TABLE dbo.[user_roles] ADD [role] nvarchar(128) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.user_roles') AND c.name=N'role' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[user_roles] ALTER COLUMN [role] nvarchar(128) NOT NULL;

IF COL_LENGTH(N'dbo.user_roles', N'created_at') IS NULL ALTER TABLE dbo.[user_roles] ADD [created_at] datetimeoffset(7) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.user_roles') AND name=N'UQ_user_roles_0') CREATE UNIQUE INDEX [UQ_user_roles_0] ON dbo.[user_roles]([user_id],[role]);

IF OBJECT_ID(N'dbo.whatsapp_queue', N'U') IS NULL BEGIN CREATE TABLE dbo.[whatsapp_queue] (

  [id] uniqueidentifier NOT NULL CONSTRAINT [DF_whatsapp_queue_id] DEFAULT (NEWID()),
  [phone_number_id] nvarchar(max) NOT NULL CONSTRAINT [DF_whatsapp_queue_phone_number_id] DEFAULT (''),
  [recipient] nvarchar(max) NOT NULL,
  [body] nvarchar(max) NOT NULL CONSTRAINT [DF_whatsapp_queue_body] DEFAULT (''),
  [reference] nvarchar(max) NULL,
  [store_id] nvarchar(450) NULL,
  [status] nvarchar(max) NOT NULL CONSTRAINT [DF_whatsapp_queue_status] DEFAULT ('QUEUED'),
  [error] nvarchar(max) NULL,
  [queued_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_whatsapp_queue_queued_at] DEFAULT (SYSDATETIMEOFFSET()),
  [sent_at] datetimeoffset(7) NULL,
  [created_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_whatsapp_queue_created_at] DEFAULT (SYSDATETIMEOFFSET()),
  [updated_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_whatsapp_queue_updated_at] DEFAULT (SYSDATETIMEOFFSET()),
  CONSTRAINT [PK_whatsapp_queue] PRIMARY KEY ([id])

); END;

IF OBJECT_ID(N'dbo.whatsapp_queue', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.change_tracking_tables WHERE object_id=OBJECT_ID(N'dbo.whatsapp_queue')) ALTER TABLE dbo.[whatsapp_queue] ENABLE CHANGE_TRACKING;

IF COL_LENGTH(N'dbo.whatsapp_queue', N'id') IS NULL ALTER TABLE dbo.[whatsapp_queue] ADD [id] uniqueidentifier NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.whatsapp_queue') AND c.name=N'id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[whatsapp_queue] ALTER COLUMN [id] uniqueidentifier NOT NULL;

IF COL_LENGTH(N'dbo.whatsapp_queue', N'phone_number_id') IS NULL ALTER TABLE dbo.[whatsapp_queue] ADD [phone_number_id] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.whatsapp_queue', N'recipient') IS NULL ALTER TABLE dbo.[whatsapp_queue] ADD [recipient] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.whatsapp_queue', N'body') IS NULL ALTER TABLE dbo.[whatsapp_queue] ADD [body] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.whatsapp_queue', N'reference') IS NULL ALTER TABLE dbo.[whatsapp_queue] ADD [reference] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.whatsapp_queue', N'store_id') IS NULL ALTER TABLE dbo.[whatsapp_queue] ADD [store_id] nvarchar(450) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.whatsapp_queue') AND c.name=N'store_id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[whatsapp_queue] ALTER COLUMN [store_id] nvarchar(450) NULL;

IF COL_LENGTH(N'dbo.whatsapp_queue', N'status') IS NULL ALTER TABLE dbo.[whatsapp_queue] ADD [status] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.whatsapp_queue', N'error') IS NULL ALTER TABLE dbo.[whatsapp_queue] ADD [error] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.whatsapp_queue', N'queued_at') IS NULL ALTER TABLE dbo.[whatsapp_queue] ADD [queued_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.whatsapp_queue', N'sent_at') IS NULL ALTER TABLE dbo.[whatsapp_queue] ADD [sent_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.whatsapp_queue', N'created_at') IS NULL ALTER TABLE dbo.[whatsapp_queue] ADD [created_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.whatsapp_queue', N'updated_at') IS NULL ALTER TABLE dbo.[whatsapp_queue] ADD [updated_at] datetimeoffset(7) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.whatsapp_queue') AND c.name=N'updated_at' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[whatsapp_queue] ALTER COLUMN [updated_at] datetimeoffset(7) NOT NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.whatsapp_queue') AND name=N'IX_whatsapp_queue_store_id') CREATE INDEX [IX_whatsapp_queue_store_id] ON dbo.[whatsapp_queue]([store_id]);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.whatsapp_queue') AND name=N'IX_whatsapp_queue_updated_at') CREATE INDEX [IX_whatsapp_queue_updated_at] ON dbo.[whatsapp_queue]([updated_at]);

IF OBJECT_ID(N'dbo.terminal_recovery_secrets', N'U') IS NULL BEGIN CREATE TABLE dbo.[terminal_recovery_secrets] (

  [terminal_token_id] uniqueidentifier NOT NULL,
  [sealed_secret] nvarchar(max) NOT NULL,
  [fingerprint] nvarchar(max) NOT NULL,
  [platform] nvarchar(max) NOT NULL CONSTRAINT [DF_terminal_recovery_secrets_platform] DEFAULT ('unknown'),
  [device_name] nvarchar(max) NULL,
  [utc_offset_minutes] int NOT NULL CONSTRAINT [DF_terminal_recovery_secrets_utc_offset_minutes] DEFAULT (0),
  [created_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_terminal_recovery_secrets_created_at] DEFAULT (SYSDATETIMEOFFSET()),
  [updated_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_terminal_recovery_secrets_updated_at] DEFAULT (SYSDATETIMEOFFSET()),
  CONSTRAINT [PK_terminal_recovery_secrets] PRIMARY KEY ([terminal_token_id])

); END;

IF OBJECT_ID(N'dbo.terminal_recovery_secrets', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.change_tracking_tables WHERE object_id=OBJECT_ID(N'dbo.terminal_recovery_secrets')) ALTER TABLE dbo.[terminal_recovery_secrets] ENABLE CHANGE_TRACKING;

IF COL_LENGTH(N'dbo.terminal_recovery_secrets', N'terminal_token_id') IS NULL ALTER TABLE dbo.[terminal_recovery_secrets] ADD [terminal_token_id] uniqueidentifier NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.terminal_recovery_secrets') AND c.name=N'terminal_token_id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[terminal_recovery_secrets] ALTER COLUMN [terminal_token_id] uniqueidentifier NOT NULL;

IF COL_LENGTH(N'dbo.terminal_recovery_secrets', N'sealed_secret') IS NULL ALTER TABLE dbo.[terminal_recovery_secrets] ADD [sealed_secret] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.terminal_recovery_secrets', N'fingerprint') IS NULL ALTER TABLE dbo.[terminal_recovery_secrets] ADD [fingerprint] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.terminal_recovery_secrets', N'platform') IS NULL ALTER TABLE dbo.[terminal_recovery_secrets] ADD [platform] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.terminal_recovery_secrets', N'device_name') IS NULL ALTER TABLE dbo.[terminal_recovery_secrets] ADD [device_name] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.terminal_recovery_secrets', N'utc_offset_minutes') IS NULL ALTER TABLE dbo.[terminal_recovery_secrets] ADD [utc_offset_minutes] int NULL;

IF COL_LENGTH(N'dbo.terminal_recovery_secrets', N'created_at') IS NULL ALTER TABLE dbo.[terminal_recovery_secrets] ADD [created_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.terminal_recovery_secrets', N'updated_at') IS NULL ALTER TABLE dbo.[terminal_recovery_secrets] ADD [updated_at] datetimeoffset(7) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.terminal_recovery_secrets') AND c.name=N'updated_at' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[terminal_recovery_secrets] ALTER COLUMN [updated_at] datetimeoffset(7) NOT NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.terminal_recovery_secrets') AND name=N'IX_terminal_recovery_secrets_updated_at') CREATE INDEX [IX_terminal_recovery_secrets_updated_at] ON dbo.[terminal_recovery_secrets]([updated_at]);

IF OBJECT_ID(N'dbo.pos_store_settings', N'U') IS NULL BEGIN CREATE TABLE dbo.[pos_store_settings] (

  [store_id] nvarchar(450) NOT NULL,
  [block_shift_close_on_hold] bit NULL,
  [require_daily_sales_for_shift_close] bit NULL,
  [require_counted_cash_on_close] bit NULL,
  [require_opening_float_count] bit NULL,
  [enable_blind_cash_count] bit NULL,
  [max_drawer_cash_limit] decimal(38,12) NULL,
  [require_reason_for_payout] bit NULL,
  [allow_multiple_shifts_per_terminal] bit NULL,
  [enable_cashier_x_report] bit NULL,
  [show_opening_float_at_close] bit NULL,
  [show_expected_totals_at_close] bit NULL,
  [show_live_variance_at_close] bit NULL,
  [show_itemized_tender_breakdown] bit NULL,
  [require_manager_pin_on_variance] bit NULL,
  [variance_pin_threshold] decimal(38,12) NULL,
  [max_cashier_discount_percent] decimal(38,12) NULL,
  [max_cart_discount_amount] decimal(38,12) NULL,
  [allow_discount_stacking] bit NULL,
  [require_reason_for_price_override] bit NULL,
  [prevent_below_cost_sale] bit NULL,
  [allow_tax_exemption] bit NULL,
  [prevent_negative_stock_sale] bit NULL,
  [require_receipt_for_refund] bit NULL,
  [require_manager_pin_for_refund] bit NULL,
  [max_refund_days_limit] decimal(38,12) NULL,
  [track_item_voids] bit NULL,
  [auto_lock_timeout_seconds] decimal(38,12) NULL,
  [require_manager_pin_for_cash_drawer_open] bit NULL,
  [enable_manager_pin_audit_log] bit NULL,
  [require_pin_void_cart] bit NULL,
  [require_pin_void_line] bit NULL,
  [require_pin_reduce_qty] bit NULL,
  [require_pin_manual_discount] bit NULL,
  [require_pin_price_override] bit NULL,
  [require_pin_stock_adjustment] bit NULL,
  [require_pin_shift_close] bit NULL,
  [require_pin_edit_tenders] bit NULL,
  [require_pin_terminal_reset] bit NULL,
  [row_version] int NOT NULL CONSTRAINT [DF_pos_store_settings_row_version] DEFAULT (1),
  [updated_by] nvarchar(max) NULL,
  [updated_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_pos_store_settings_updated_at] DEFAULT (SYSDATETIMEOFFSET()),
  [allow_offline_approvals] bit NOT NULL,
  CONSTRAINT [PK_pos_store_settings] PRIMARY KEY ([store_id])

); END;

IF OBJECT_ID(N'dbo.pos_store_settings', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.change_tracking_tables WHERE object_id=OBJECT_ID(N'dbo.pos_store_settings')) ALTER TABLE dbo.[pos_store_settings] ENABLE CHANGE_TRACKING;

IF COL_LENGTH(N'dbo.pos_store_settings', N'store_id') IS NULL ALTER TABLE dbo.[pos_store_settings] ADD [store_id] nvarchar(450) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.pos_store_settings') AND c.name=N'store_id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[pos_store_settings] ALTER COLUMN [store_id] nvarchar(450) NOT NULL;

IF COL_LENGTH(N'dbo.pos_store_settings', N'block_shift_close_on_hold') IS NULL ALTER TABLE dbo.[pos_store_settings] ADD [block_shift_close_on_hold] bit NULL;

IF COL_LENGTH(N'dbo.pos_store_settings', N'require_daily_sales_for_shift_close') IS NULL ALTER TABLE dbo.[pos_store_settings] ADD [require_daily_sales_for_shift_close] bit NULL;

IF COL_LENGTH(N'dbo.pos_store_settings', N'require_counted_cash_on_close') IS NULL ALTER TABLE dbo.[pos_store_settings] ADD [require_counted_cash_on_close] bit NULL;

IF COL_LENGTH(N'dbo.pos_store_settings', N'require_opening_float_count') IS NULL ALTER TABLE dbo.[pos_store_settings] ADD [require_opening_float_count] bit NULL;

IF COL_LENGTH(N'dbo.pos_store_settings', N'enable_blind_cash_count') IS NULL ALTER TABLE dbo.[pos_store_settings] ADD [enable_blind_cash_count] bit NULL;

IF COL_LENGTH(N'dbo.pos_store_settings', N'max_drawer_cash_limit') IS NULL ALTER TABLE dbo.[pos_store_settings] ADD [max_drawer_cash_limit] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.pos_store_settings', N'require_reason_for_payout') IS NULL ALTER TABLE dbo.[pos_store_settings] ADD [require_reason_for_payout] bit NULL;

IF COL_LENGTH(N'dbo.pos_store_settings', N'allow_multiple_shifts_per_terminal') IS NULL ALTER TABLE dbo.[pos_store_settings] ADD [allow_multiple_shifts_per_terminal] bit NULL;

IF COL_LENGTH(N'dbo.pos_store_settings', N'enable_cashier_x_report') IS NULL ALTER TABLE dbo.[pos_store_settings] ADD [enable_cashier_x_report] bit NULL;

IF COL_LENGTH(N'dbo.pos_store_settings', N'show_opening_float_at_close') IS NULL ALTER TABLE dbo.[pos_store_settings] ADD [show_opening_float_at_close] bit NULL;

IF COL_LENGTH(N'dbo.pos_store_settings', N'show_expected_totals_at_close') IS NULL ALTER TABLE dbo.[pos_store_settings] ADD [show_expected_totals_at_close] bit NULL;

IF COL_LENGTH(N'dbo.pos_store_settings', N'show_live_variance_at_close') IS NULL ALTER TABLE dbo.[pos_store_settings] ADD [show_live_variance_at_close] bit NULL;

IF COL_LENGTH(N'dbo.pos_store_settings', N'show_itemized_tender_breakdown') IS NULL ALTER TABLE dbo.[pos_store_settings] ADD [show_itemized_tender_breakdown] bit NULL;

IF COL_LENGTH(N'dbo.pos_store_settings', N'require_manager_pin_on_variance') IS NULL ALTER TABLE dbo.[pos_store_settings] ADD [require_manager_pin_on_variance] bit NULL;

IF COL_LENGTH(N'dbo.pos_store_settings', N'variance_pin_threshold') IS NULL ALTER TABLE dbo.[pos_store_settings] ADD [variance_pin_threshold] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.pos_store_settings', N'max_cashier_discount_percent') IS NULL ALTER TABLE dbo.[pos_store_settings] ADD [max_cashier_discount_percent] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.pos_store_settings', N'max_cart_discount_amount') IS NULL ALTER TABLE dbo.[pos_store_settings] ADD [max_cart_discount_amount] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.pos_store_settings', N'allow_discount_stacking') IS NULL ALTER TABLE dbo.[pos_store_settings] ADD [allow_discount_stacking] bit NULL;

IF COL_LENGTH(N'dbo.pos_store_settings', N'require_reason_for_price_override') IS NULL ALTER TABLE dbo.[pos_store_settings] ADD [require_reason_for_price_override] bit NULL;

IF COL_LENGTH(N'dbo.pos_store_settings', N'prevent_below_cost_sale') IS NULL ALTER TABLE dbo.[pos_store_settings] ADD [prevent_below_cost_sale] bit NULL;

IF COL_LENGTH(N'dbo.pos_store_settings', N'allow_tax_exemption') IS NULL ALTER TABLE dbo.[pos_store_settings] ADD [allow_tax_exemption] bit NULL;

IF COL_LENGTH(N'dbo.pos_store_settings', N'prevent_negative_stock_sale') IS NULL ALTER TABLE dbo.[pos_store_settings] ADD [prevent_negative_stock_sale] bit NULL;

IF COL_LENGTH(N'dbo.pos_store_settings', N'require_receipt_for_refund') IS NULL ALTER TABLE dbo.[pos_store_settings] ADD [require_receipt_for_refund] bit NULL;

IF COL_LENGTH(N'dbo.pos_store_settings', N'require_manager_pin_for_refund') IS NULL ALTER TABLE dbo.[pos_store_settings] ADD [require_manager_pin_for_refund] bit NULL;

IF COL_LENGTH(N'dbo.pos_store_settings', N'max_refund_days_limit') IS NULL ALTER TABLE dbo.[pos_store_settings] ADD [max_refund_days_limit] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.pos_store_settings', N'track_item_voids') IS NULL ALTER TABLE dbo.[pos_store_settings] ADD [track_item_voids] bit NULL;

IF COL_LENGTH(N'dbo.pos_store_settings', N'auto_lock_timeout_seconds') IS NULL ALTER TABLE dbo.[pos_store_settings] ADD [auto_lock_timeout_seconds] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.pos_store_settings', N'require_manager_pin_for_cash_drawer_open') IS NULL ALTER TABLE dbo.[pos_store_settings] ADD [require_manager_pin_for_cash_drawer_open] bit NULL;

IF COL_LENGTH(N'dbo.pos_store_settings', N'enable_manager_pin_audit_log') IS NULL ALTER TABLE dbo.[pos_store_settings] ADD [enable_manager_pin_audit_log] bit NULL;

IF COL_LENGTH(N'dbo.pos_store_settings', N'require_pin_void_cart') IS NULL ALTER TABLE dbo.[pos_store_settings] ADD [require_pin_void_cart] bit NULL;

IF COL_LENGTH(N'dbo.pos_store_settings', N'require_pin_void_line') IS NULL ALTER TABLE dbo.[pos_store_settings] ADD [require_pin_void_line] bit NULL;

IF COL_LENGTH(N'dbo.pos_store_settings', N'require_pin_reduce_qty') IS NULL ALTER TABLE dbo.[pos_store_settings] ADD [require_pin_reduce_qty] bit NULL;

IF COL_LENGTH(N'dbo.pos_store_settings', N'require_pin_manual_discount') IS NULL ALTER TABLE dbo.[pos_store_settings] ADD [require_pin_manual_discount] bit NULL;

IF COL_LENGTH(N'dbo.pos_store_settings', N'require_pin_price_override') IS NULL ALTER TABLE dbo.[pos_store_settings] ADD [require_pin_price_override] bit NULL;

IF COL_LENGTH(N'dbo.pos_store_settings', N'require_pin_stock_adjustment') IS NULL ALTER TABLE dbo.[pos_store_settings] ADD [require_pin_stock_adjustment] bit NULL;

IF COL_LENGTH(N'dbo.pos_store_settings', N'require_pin_shift_close') IS NULL ALTER TABLE dbo.[pos_store_settings] ADD [require_pin_shift_close] bit NULL;

IF COL_LENGTH(N'dbo.pos_store_settings', N'require_pin_edit_tenders') IS NULL ALTER TABLE dbo.[pos_store_settings] ADD [require_pin_edit_tenders] bit NULL;

IF COL_LENGTH(N'dbo.pos_store_settings', N'require_pin_terminal_reset') IS NULL ALTER TABLE dbo.[pos_store_settings] ADD [require_pin_terminal_reset] bit NULL;

IF COL_LENGTH(N'dbo.pos_store_settings', N'row_version') IS NULL ALTER TABLE dbo.[pos_store_settings] ADD [row_version] int NULL;

IF COL_LENGTH(N'dbo.pos_store_settings', N'updated_by') IS NULL ALTER TABLE dbo.[pos_store_settings] ADD [updated_by] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.pos_store_settings', N'updated_at') IS NULL ALTER TABLE dbo.[pos_store_settings] ADD [updated_at] datetimeoffset(7) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.pos_store_settings') AND c.name=N'updated_at' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[pos_store_settings] ALTER COLUMN [updated_at] datetimeoffset(7) NOT NULL;

IF COL_LENGTH(N'dbo.pos_store_settings', N'allow_offline_approvals') IS NULL ALTER TABLE dbo.[pos_store_settings] ADD [allow_offline_approvals] bit NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.pos_store_settings') AND name=N'IX_pos_store_settings_store_id') CREATE INDEX [IX_pos_store_settings_store_id] ON dbo.[pos_store_settings]([store_id]);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.pos_store_settings') AND name=N'IX_pos_store_settings_updated_at') CREATE INDEX [IX_pos_store_settings_updated_at] ON dbo.[pos_store_settings]([updated_at]);

IF OBJECT_ID(N'dbo.settings_scoped', N'U') IS NULL BEGIN CREATE TABLE dbo.[settings_scoped] (

  [scope] nvarchar(128) NOT NULL CONSTRAINT [DF_settings_scoped_scope] DEFAULT ('GLOBAL'),
  [scope_id] nvarchar(128) NOT NULL CONSTRAINT [DF_settings_scoped_scope_id] DEFAULT (''),
  [key] nvarchar(128) NOT NULL,
  [value] nvarchar(max) NULL,
  [is_overridden] bit NOT NULL CONSTRAINT [DF_settings_scoped_is_overridden] DEFAULT (1),
  [updated_by] nvarchar(max) NULL,
  [created_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_settings_scoped_created_at] DEFAULT (SYSDATETIMEOFFSET()),
  [updated_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_settings_scoped_updated_at] DEFAULT (SYSDATETIMEOFFSET()),
  CONSTRAINT [PK_settings_scoped] PRIMARY KEY ([scope], [scope_id], [key])

); END;

IF OBJECT_ID(N'dbo.settings_scoped', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.change_tracking_tables WHERE object_id=OBJECT_ID(N'dbo.settings_scoped')) ALTER TABLE dbo.[settings_scoped] ENABLE CHANGE_TRACKING;

IF COL_LENGTH(N'dbo.settings_scoped', N'scope') IS NULL ALTER TABLE dbo.[settings_scoped] ADD [scope] nvarchar(128) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.settings_scoped') AND c.name=N'scope' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[settings_scoped] ALTER COLUMN [scope] nvarchar(128) NOT NULL;

IF COL_LENGTH(N'dbo.settings_scoped', N'scope_id') IS NULL ALTER TABLE dbo.[settings_scoped] ADD [scope_id] nvarchar(128) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.settings_scoped') AND c.name=N'scope_id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[settings_scoped] ALTER COLUMN [scope_id] nvarchar(128) NOT NULL;

IF COL_LENGTH(N'dbo.settings_scoped', N'key') IS NULL ALTER TABLE dbo.[settings_scoped] ADD [key] nvarchar(128) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.settings_scoped') AND c.name=N'key' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[settings_scoped] ALTER COLUMN [key] nvarchar(128) NOT NULL;

IF COL_LENGTH(N'dbo.settings_scoped', N'value') IS NULL ALTER TABLE dbo.[settings_scoped] ADD [value] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.settings_scoped', N'is_overridden') IS NULL ALTER TABLE dbo.[settings_scoped] ADD [is_overridden] bit NULL;

IF COL_LENGTH(N'dbo.settings_scoped', N'updated_by') IS NULL ALTER TABLE dbo.[settings_scoped] ADD [updated_by] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.settings_scoped', N'created_at') IS NULL ALTER TABLE dbo.[settings_scoped] ADD [created_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.settings_scoped', N'updated_at') IS NULL ALTER TABLE dbo.[settings_scoped] ADD [updated_at] datetimeoffset(7) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.settings_scoped') AND c.name=N'updated_at' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[settings_scoped] ALTER COLUMN [updated_at] datetimeoffset(7) NOT NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.settings_scoped') AND name=N'IX_settings_scoped_updated_at') CREATE INDEX [IX_settings_scoped_updated_at] ON dbo.[settings_scoped]([updated_at]);

IF OBJECT_ID(N'dbo.stock_count_drafts', N'U') IS NULL BEGIN CREATE TABLE dbo.[stock_count_drafts] (

  [id] uniqueidentifier NOT NULL,
  [store_id] nvarchar(450) NULL,
  [terminal_id] nvarchar(max) NULL,
  [staff_id] nvarchar(max) NULL,
  [staff_name] nvarchar(max) NULL,
  [status] nvarchar(max) NOT NULL CONSTRAINT [DF_stock_count_drafts_status] DEFAULT ('draft'),
  [reason] nvarchar(max) NULL,
  [note] nvarchar(max) NOT NULL CONSTRAINT [DF_stock_count_drafts_note] DEFAULT (''),
  [lines] nvarchar(max) NOT NULL CONSTRAINT [DF_stock_count_drafts_lines] DEFAULT ('[]'),
  [line_count] int NOT NULL CONSTRAINT [DF_stock_count_drafts_line_count] DEFAULT (0),
  [total_impact] decimal(18,4) NOT NULL CONSTRAINT [DF_stock_count_drafts_total_impact] DEFAULT (0),
  [posted_at] datetimeoffset(7) NULL,
  [posted_by] nvarchar(max) NULL,
  [created_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_stock_count_drafts_created_at] DEFAULT (SYSDATETIMEOFFSET()),
  [updated_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_stock_count_drafts_updated_at] DEFAULT (SYSDATETIMEOFFSET()),
  [reference] nvarchar(max) NULL,
  [store_code] nvarchar(max) NULL,
  [pending_edit_request_id] uniqueidentifier NULL,
  CONSTRAINT [PK_stock_count_drafts] PRIMARY KEY ([id])

); END;

IF OBJECT_ID(N'dbo.stock_count_drafts', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.change_tracking_tables WHERE object_id=OBJECT_ID(N'dbo.stock_count_drafts')) ALTER TABLE dbo.[stock_count_drafts] ENABLE CHANGE_TRACKING;

IF COL_LENGTH(N'dbo.stock_count_drafts', N'id') IS NULL ALTER TABLE dbo.[stock_count_drafts] ADD [id] uniqueidentifier NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.stock_count_drafts') AND c.name=N'id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[stock_count_drafts] ALTER COLUMN [id] uniqueidentifier NOT NULL;

IF COL_LENGTH(N'dbo.stock_count_drafts', N'store_id') IS NULL ALTER TABLE dbo.[stock_count_drafts] ADD [store_id] nvarchar(450) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.stock_count_drafts') AND c.name=N'store_id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[stock_count_drafts] ALTER COLUMN [store_id] nvarchar(450) NULL;

IF COL_LENGTH(N'dbo.stock_count_drafts', N'terminal_id') IS NULL ALTER TABLE dbo.[stock_count_drafts] ADD [terminal_id] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.stock_count_drafts', N'staff_id') IS NULL ALTER TABLE dbo.[stock_count_drafts] ADD [staff_id] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.stock_count_drafts', N'staff_name') IS NULL ALTER TABLE dbo.[stock_count_drafts] ADD [staff_name] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.stock_count_drafts', N'status') IS NULL ALTER TABLE dbo.[stock_count_drafts] ADD [status] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.stock_count_drafts', N'reason') IS NULL ALTER TABLE dbo.[stock_count_drafts] ADD [reason] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.stock_count_drafts', N'note') IS NULL ALTER TABLE dbo.[stock_count_drafts] ADD [note] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.stock_count_drafts', N'lines') IS NULL ALTER TABLE dbo.[stock_count_drafts] ADD [lines] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.stock_count_drafts', N'line_count') IS NULL ALTER TABLE dbo.[stock_count_drafts] ADD [line_count] int NULL;

IF COL_LENGTH(N'dbo.stock_count_drafts', N'total_impact') IS NULL ALTER TABLE dbo.[stock_count_drafts] ADD [total_impact] decimal(18,4) NULL;

IF COL_LENGTH(N'dbo.stock_count_drafts', N'posted_at') IS NULL ALTER TABLE dbo.[stock_count_drafts] ADD [posted_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.stock_count_drafts', N'posted_by') IS NULL ALTER TABLE dbo.[stock_count_drafts] ADD [posted_by] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.stock_count_drafts', N'created_at') IS NULL ALTER TABLE dbo.[stock_count_drafts] ADD [created_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.stock_count_drafts', N'updated_at') IS NULL ALTER TABLE dbo.[stock_count_drafts] ADD [updated_at] datetimeoffset(7) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.stock_count_drafts') AND c.name=N'updated_at' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[stock_count_drafts] ALTER COLUMN [updated_at] datetimeoffset(7) NOT NULL;

IF COL_LENGTH(N'dbo.stock_count_drafts', N'reference') IS NULL ALTER TABLE dbo.[stock_count_drafts] ADD [reference] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.stock_count_drafts', N'store_code') IS NULL ALTER TABLE dbo.[stock_count_drafts] ADD [store_code] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.stock_count_drafts', N'pending_edit_request_id') IS NULL ALTER TABLE dbo.[stock_count_drafts] ADD [pending_edit_request_id] uniqueidentifier NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.stock_count_drafts') AND name=N'IX_stock_count_drafts_store_id') CREATE INDEX [IX_stock_count_drafts_store_id] ON dbo.[stock_count_drafts]([store_id]);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.stock_count_drafts') AND name=N'IX_stock_count_drafts_updated_at') CREATE INDEX [IX_stock_count_drafts_updated_at] ON dbo.[stock_count_drafts]([updated_at]);

IF OBJECT_ID(N'dbo.authorization_actions', N'U') IS NULL BEGIN CREATE TABLE dbo.[authorization_actions] (

  [id] uniqueidentifier NOT NULL,
  [action_key] nvarchar(max) NOT NULL,
  [scope_type] nvarchar(max) NOT NULL CONSTRAINT [DF_authorization_actions_scope_type] DEFAULT ('global'),
  [scope_id] nvarchar(max) NOT NULL CONSTRAINT [DF_authorization_actions_scope_id] DEFAULT (''),
  [mode] nvarchar(max) NOT NULL CONSTRAINT [DF_authorization_actions_mode] DEFAULT ('none'),
  [allowed_roles] nvarchar(max) NOT NULL CONSTRAINT [DF_authorization_actions_allowed_roles] DEFAULT (N'[]'),
  [allowed_user_ids] nvarchar(max) NOT NULL CONSTRAINT [DF_authorization_actions_allowed_user_ids] DEFAULT (N'[]'),
  [requester_roles] nvarchar(max) NOT NULL CONSTRAINT [DF_authorization_actions_requester_roles] DEFAULT (N'[]'),
  [requester_user_ids] nvarchar(max) NOT NULL CONSTRAINT [DF_authorization_actions_requester_user_ids] DEFAULT (N'[]'),
  [authority_limits] nvarchar(max) NOT NULL CONSTRAINT [DF_authorization_actions_authority_limits] DEFAULT (N'[]'),
  [extra_authority] nvarchar(max) NOT NULL CONSTRAINT [DF_authorization_actions_extra_authority] DEFAULT (N'[]'),
  [absolute_ceilings] nvarchar(max) NOT NULL CONSTRAINT [DF_authorization_actions_absolute_ceilings] DEFAULT (N'[]'),
  [require_reason] bit NOT NULL CONSTRAINT [DF_authorization_actions_require_reason] DEFAULT (0),
  [threshold] decimal(38,12) NULL,
  [is_enabled] bit NOT NULL CONSTRAINT [DF_authorization_actions_is_enabled] DEFAULT (1),
  [created_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_authorization_actions_created_at] DEFAULT (SYSDATETIMEOFFSET()),
  [updated_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_authorization_actions_updated_at] DEFAULT (SYSDATETIMEOFFSET()),
  CONSTRAINT [PK_authorization_actions] PRIMARY KEY ([id])

); END;

IF OBJECT_ID(N'dbo.authorization_actions', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.change_tracking_tables WHERE object_id=OBJECT_ID(N'dbo.authorization_actions')) ALTER TABLE dbo.[authorization_actions] ENABLE CHANGE_TRACKING;

IF COL_LENGTH(N'dbo.authorization_actions', N'id') IS NULL ALTER TABLE dbo.[authorization_actions] ADD [id] uniqueidentifier NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.authorization_actions') AND c.name=N'id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[authorization_actions] ALTER COLUMN [id] uniqueidentifier NOT NULL;

IF COL_LENGTH(N'dbo.authorization_actions', N'action_key') IS NULL ALTER TABLE dbo.[authorization_actions] ADD [action_key] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.authorization_actions', N'scope_type') IS NULL ALTER TABLE dbo.[authorization_actions] ADD [scope_type] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.authorization_actions', N'scope_id') IS NULL ALTER TABLE dbo.[authorization_actions] ADD [scope_id] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.authorization_actions', N'mode') IS NULL ALTER TABLE dbo.[authorization_actions] ADD [mode] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.authorization_actions', N'allowed_roles') IS NULL ALTER TABLE dbo.[authorization_actions] ADD [allowed_roles] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.authorization_actions', N'allowed_user_ids') IS NULL ALTER TABLE dbo.[authorization_actions] ADD [allowed_user_ids] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.authorization_actions', N'requester_roles') IS NULL ALTER TABLE dbo.[authorization_actions] ADD [requester_roles] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.authorization_actions', N'requester_user_ids') IS NULL ALTER TABLE dbo.[authorization_actions] ADD [requester_user_ids] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.authorization_actions', N'authority_limits') IS NULL ALTER TABLE dbo.[authorization_actions] ADD [authority_limits] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.authorization_actions', N'extra_authority') IS NULL ALTER TABLE dbo.[authorization_actions] ADD [extra_authority] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.authorization_actions', N'absolute_ceilings') IS NULL ALTER TABLE dbo.[authorization_actions] ADD [absolute_ceilings] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.authorization_actions', N'require_reason') IS NULL ALTER TABLE dbo.[authorization_actions] ADD [require_reason] bit NULL;

IF COL_LENGTH(N'dbo.authorization_actions', N'threshold') IS NULL ALTER TABLE dbo.[authorization_actions] ADD [threshold] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.authorization_actions', N'is_enabled') IS NULL ALTER TABLE dbo.[authorization_actions] ADD [is_enabled] bit NULL;

IF COL_LENGTH(N'dbo.authorization_actions', N'created_at') IS NULL ALTER TABLE dbo.[authorization_actions] ADD [created_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.authorization_actions', N'updated_at') IS NULL ALTER TABLE dbo.[authorization_actions] ADD [updated_at] datetimeoffset(7) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.authorization_actions') AND c.name=N'updated_at' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[authorization_actions] ALTER COLUMN [updated_at] datetimeoffset(7) NOT NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.authorization_actions') AND name=N'IX_authorization_actions_updated_at') CREATE INDEX [IX_authorization_actions_updated_at] ON dbo.[authorization_actions]([updated_at]);

IF OBJECT_ID(N'dbo.authorization_requests', N'U') IS NULL BEGIN CREATE TABLE dbo.[authorization_requests] (

  [id] uniqueidentifier NOT NULL,
  [action_key] nvarchar(max) NOT NULL,
  [requested_by] nvarchar(max) NOT NULL,
  [requested_by_name] nvarchar(max) NOT NULL CONSTRAINT [DF_authorization_requests_requested_by_name] DEFAULT (''),
  [store_id] nvarchar(450) NOT NULL CONSTRAINT [DF_authorization_requests_store_id] DEFAULT (''),
  [terminal_id] nvarchar(max) NOT NULL CONSTRAINT [DF_authorization_requests_terminal_id] DEFAULT (''),
  [reason] nvarchar(max) NOT NULL CONSTRAINT [DF_authorization_requests_reason] DEFAULT (''),
  [payload] nvarchar(max) NOT NULL CONSTRAINT [DF_authorization_requests_payload] DEFAULT (N'[]'),
  [status] nvarchar(max) NOT NULL CONSTRAINT [DF_authorization_requests_status] DEFAULT ('pending'),
  [decided_by] nvarchar(max) NULL,
  [decided_by_name] nvarchar(max) NULL,
  [decided_at] datetimeoffset(7) NULL,
  [decision_note] nvarchar(max) NULL,
  [expires_at] datetimeoffset(7) NOT NULL,
  [consumed_at] datetimeoffset(7) NULL,
  [requester_direct_limit] decimal(38,12) NULL,
  [value_unit] nvarchar(max) NOT NULL CONSTRAINT [DF_authorization_requests_value_unit] DEFAULT ('number'),
  [created_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_authorization_requests_created_at] DEFAULT (SYSDATETIMEOFFSET()),
  [updated_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_authorization_requests_updated_at] DEFAULT (SYSDATETIMEOFFSET()),
  [requested_amount] decimal(38,12) NOT NULL CONSTRAINT [DF_authorization_requests_requested_amount] DEFAULT (N'[]'),
  CONSTRAINT [PK_authorization_requests] PRIMARY KEY ([id])

); END;

IF OBJECT_ID(N'dbo.authorization_requests', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.change_tracking_tables WHERE object_id=OBJECT_ID(N'dbo.authorization_requests')) ALTER TABLE dbo.[authorization_requests] ENABLE CHANGE_TRACKING;

IF COL_LENGTH(N'dbo.authorization_requests', N'id') IS NULL ALTER TABLE dbo.[authorization_requests] ADD [id] uniqueidentifier NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.authorization_requests') AND c.name=N'id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[authorization_requests] ALTER COLUMN [id] uniqueidentifier NOT NULL;

IF COL_LENGTH(N'dbo.authorization_requests', N'action_key') IS NULL ALTER TABLE dbo.[authorization_requests] ADD [action_key] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.authorization_requests', N'requested_by') IS NULL ALTER TABLE dbo.[authorization_requests] ADD [requested_by] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.authorization_requests', N'requested_by_name') IS NULL ALTER TABLE dbo.[authorization_requests] ADD [requested_by_name] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.authorization_requests', N'store_id') IS NULL ALTER TABLE dbo.[authorization_requests] ADD [store_id] nvarchar(450) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.authorization_requests') AND c.name=N'store_id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[authorization_requests] ALTER COLUMN [store_id] nvarchar(450) NOT NULL;

IF COL_LENGTH(N'dbo.authorization_requests', N'terminal_id') IS NULL ALTER TABLE dbo.[authorization_requests] ADD [terminal_id] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.authorization_requests', N'reason') IS NULL ALTER TABLE dbo.[authorization_requests] ADD [reason] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.authorization_requests', N'payload') IS NULL ALTER TABLE dbo.[authorization_requests] ADD [payload] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.authorization_requests', N'status') IS NULL ALTER TABLE dbo.[authorization_requests] ADD [status] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.authorization_requests', N'decided_by') IS NULL ALTER TABLE dbo.[authorization_requests] ADD [decided_by] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.authorization_requests', N'decided_by_name') IS NULL ALTER TABLE dbo.[authorization_requests] ADD [decided_by_name] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.authorization_requests', N'decided_at') IS NULL ALTER TABLE dbo.[authorization_requests] ADD [decided_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.authorization_requests', N'decision_note') IS NULL ALTER TABLE dbo.[authorization_requests] ADD [decision_note] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.authorization_requests', N'expires_at') IS NULL ALTER TABLE dbo.[authorization_requests] ADD [expires_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.authorization_requests', N'consumed_at') IS NULL ALTER TABLE dbo.[authorization_requests] ADD [consumed_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.authorization_requests', N'requester_direct_limit') IS NULL ALTER TABLE dbo.[authorization_requests] ADD [requester_direct_limit] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.authorization_requests', N'value_unit') IS NULL ALTER TABLE dbo.[authorization_requests] ADD [value_unit] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.authorization_requests', N'created_at') IS NULL ALTER TABLE dbo.[authorization_requests] ADD [created_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.authorization_requests', N'updated_at') IS NULL ALTER TABLE dbo.[authorization_requests] ADD [updated_at] datetimeoffset(7) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.authorization_requests') AND c.name=N'updated_at' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[authorization_requests] ALTER COLUMN [updated_at] datetimeoffset(7) NOT NULL;

IF COL_LENGTH(N'dbo.authorization_requests', N'requested_amount') IS NULL ALTER TABLE dbo.[authorization_requests] ADD [requested_amount] decimal(38,12) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.authorization_requests') AND name=N'IX_authorization_requests_store_id') CREATE INDEX [IX_authorization_requests_store_id] ON dbo.[authorization_requests]([store_id]);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.authorization_requests') AND name=N'IX_authorization_requests_updated_at') CREATE INDEX [IX_authorization_requests_updated_at] ON dbo.[authorization_requests]([updated_at]);

IF OBJECT_ID(N'dbo.authorization_log', N'U') IS NULL BEGIN CREATE TABLE dbo.[authorization_log] (

  [id] uniqueidentifier NOT NULL,
  [action_key] nvarchar(max) NOT NULL,
  [mode_used] nvarchar(max) NOT NULL,
  [request_id] uniqueidentifier NULL,
  [requested_by] nvarchar(max) NULL,
  [authorized_by] nvarchar(max) NULL,
  [authorizer_role] nvarchar(max) NULL,
  [store_id] nvarchar(450) NOT NULL CONSTRAINT [DF_authorization_log_store_id] DEFAULT (''),
  [terminal_id] nvarchar(max) NOT NULL CONSTRAINT [DF_authorization_log_terminal_id] DEFAULT (''),
  [outcome] nvarchar(max) NOT NULL,
  [detail] nvarchar(max) NOT NULL CONSTRAINT [DF_authorization_log_detail] DEFAULT (N'[]'),
  [created_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_authorization_log_created_at] DEFAULT (SYSDATETIMEOFFSET()),
  CONSTRAINT [PK_authorization_log] PRIMARY KEY ([id])

); END;

IF OBJECT_ID(N'dbo.authorization_log', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.change_tracking_tables WHERE object_id=OBJECT_ID(N'dbo.authorization_log')) ALTER TABLE dbo.[authorization_log] ENABLE CHANGE_TRACKING;

IF COL_LENGTH(N'dbo.authorization_log', N'id') IS NULL ALTER TABLE dbo.[authorization_log] ADD [id] uniqueidentifier NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.authorization_log') AND c.name=N'id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[authorization_log] ALTER COLUMN [id] uniqueidentifier NOT NULL;

IF COL_LENGTH(N'dbo.authorization_log', N'action_key') IS NULL ALTER TABLE dbo.[authorization_log] ADD [action_key] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.authorization_log', N'mode_used') IS NULL ALTER TABLE dbo.[authorization_log] ADD [mode_used] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.authorization_log', N'request_id') IS NULL ALTER TABLE dbo.[authorization_log] ADD [request_id] uniqueidentifier NULL;

IF COL_LENGTH(N'dbo.authorization_log', N'requested_by') IS NULL ALTER TABLE dbo.[authorization_log] ADD [requested_by] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.authorization_log', N'authorized_by') IS NULL ALTER TABLE dbo.[authorization_log] ADD [authorized_by] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.authorization_log', N'authorizer_role') IS NULL ALTER TABLE dbo.[authorization_log] ADD [authorizer_role] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.authorization_log', N'store_id') IS NULL ALTER TABLE dbo.[authorization_log] ADD [store_id] nvarchar(450) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.authorization_log') AND c.name=N'store_id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[authorization_log] ALTER COLUMN [store_id] nvarchar(450) NOT NULL;

IF COL_LENGTH(N'dbo.authorization_log', N'terminal_id') IS NULL ALTER TABLE dbo.[authorization_log] ADD [terminal_id] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.authorization_log', N'outcome') IS NULL ALTER TABLE dbo.[authorization_log] ADD [outcome] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.authorization_log', N'detail') IS NULL ALTER TABLE dbo.[authorization_log] ADD [detail] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.authorization_log', N'created_at') IS NULL ALTER TABLE dbo.[authorization_log] ADD [created_at] datetimeoffset(7) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.authorization_log') AND name=N'IX_authorization_log_store_id') CREATE INDEX [IX_authorization_log_store_id] ON dbo.[authorization_log]([store_id]);

IF OBJECT_ID(N'dbo.record_edits', N'U') IS NULL BEGIN CREATE TABLE dbo.[record_edits] (

  [id] uniqueidentifier NOT NULL CONSTRAINT [DF_record_edits_id] DEFAULT (NEWID()),
  [record_type] nvarchar(max) NOT NULL,
  [record_id] nvarchar(max) NOT NULL,
  [reference] nvarchar(max) NULL,
  [store_id] nvarchar(450) NULL,
  [terminal_id] nvarchar(max) NULL,
  [action_key] nvarchar(max) NOT NULL,
  [request_id] uniqueidentifier NULL,
  [edited_by] nvarchar(max) NULL,
  [edited_by_name] nvarchar(max) NULL,
  [authorized_by] nvarchar(max) NULL,
  [authorized_by_name] nvarchar(max) NULL,
  [mode_used] nvarchar(max) NULL,
  [before_value] nvarchar(max) NOT NULL CONSTRAINT [DF_record_edits_before_value] DEFAULT (N'[]'),
  [after_value] nvarchar(max) NOT NULL CONSTRAINT [DF_record_edits_after_value] DEFAULT (N'[]'),
  [stock_deltas] nvarchar(max) NOT NULL CONSTRAINT [DF_record_edits_stock_deltas] DEFAULT (N'[]'),
  [note] nvarchar(max) NULL,
  [created_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_record_edits_created_at] DEFAULT (SYSDATETIMEOFFSET()),
  CONSTRAINT [PK_record_edits] PRIMARY KEY ([id])

); END;

IF OBJECT_ID(N'dbo.record_edits', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.change_tracking_tables WHERE object_id=OBJECT_ID(N'dbo.record_edits')) ALTER TABLE dbo.[record_edits] ENABLE CHANGE_TRACKING;

IF COL_LENGTH(N'dbo.record_edits', N'id') IS NULL ALTER TABLE dbo.[record_edits] ADD [id] uniqueidentifier NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.record_edits') AND c.name=N'id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[record_edits] ALTER COLUMN [id] uniqueidentifier NOT NULL;

IF COL_LENGTH(N'dbo.record_edits', N'record_type') IS NULL ALTER TABLE dbo.[record_edits] ADD [record_type] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.record_edits', N'record_id') IS NULL ALTER TABLE dbo.[record_edits] ADD [record_id] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.record_edits', N'reference') IS NULL ALTER TABLE dbo.[record_edits] ADD [reference] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.record_edits', N'store_id') IS NULL ALTER TABLE dbo.[record_edits] ADD [store_id] nvarchar(450) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.record_edits') AND c.name=N'store_id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[record_edits] ALTER COLUMN [store_id] nvarchar(450) NULL;

IF COL_LENGTH(N'dbo.record_edits', N'terminal_id') IS NULL ALTER TABLE dbo.[record_edits] ADD [terminal_id] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.record_edits', N'action_key') IS NULL ALTER TABLE dbo.[record_edits] ADD [action_key] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.record_edits', N'request_id') IS NULL ALTER TABLE dbo.[record_edits] ADD [request_id] uniqueidentifier NULL;

IF COL_LENGTH(N'dbo.record_edits', N'edited_by') IS NULL ALTER TABLE dbo.[record_edits] ADD [edited_by] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.record_edits', N'edited_by_name') IS NULL ALTER TABLE dbo.[record_edits] ADD [edited_by_name] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.record_edits', N'authorized_by') IS NULL ALTER TABLE dbo.[record_edits] ADD [authorized_by] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.record_edits', N'authorized_by_name') IS NULL ALTER TABLE dbo.[record_edits] ADD [authorized_by_name] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.record_edits', N'mode_used') IS NULL ALTER TABLE dbo.[record_edits] ADD [mode_used] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.record_edits', N'before_value') IS NULL ALTER TABLE dbo.[record_edits] ADD [before_value] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.record_edits', N'after_value') IS NULL ALTER TABLE dbo.[record_edits] ADD [after_value] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.record_edits', N'stock_deltas') IS NULL ALTER TABLE dbo.[record_edits] ADD [stock_deltas] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.record_edits', N'note') IS NULL ALTER TABLE dbo.[record_edits] ADD [note] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.record_edits', N'created_at') IS NULL ALTER TABLE dbo.[record_edits] ADD [created_at] datetimeoffset(7) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.record_edits') AND name=N'IX_record_edits_store_id') CREATE INDEX [IX_record_edits_store_id] ON dbo.[record_edits]([store_id]);

IF OBJECT_ID(N'dbo.shift_cash_counts', N'U') IS NULL BEGIN CREATE TABLE dbo.[shift_cash_counts] (

  [id] uniqueidentifier NOT NULL CONSTRAINT [DF_shift_cash_counts_id] DEFAULT (NEWID()),
  [shift_id] uniqueidentifier NOT NULL,
  [store_id] nvarchar(450) NOT NULL,
  [terminal_id] nvarchar(max) NULL,
  [kind] nvarchar(max) NOT NULL CONSTRAINT [DF_shift_cash_counts_kind] DEFAULT ('ORIGINAL'),
  [counted_cash] decimal(38,12) NOT NULL,
  [counted_card] decimal(38,12) NULL,
  [counted_digital] decimal(38,12) NULL,
  [reason] nvarchar(max) NULL,
  [counted_by_name] nvarchar(max) NULL,
  [counted_by_staff_id] nvarchar(max) NULL,
  [counted_by_user_id] uniqueidentifier NULL,
  [client_key] nvarchar(max) NULL,
  [created_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_shift_cash_counts_created_at] DEFAULT (SYSDATETIMEOFFSET()),
  CONSTRAINT [PK_shift_cash_counts] PRIMARY KEY ([id])

); END;

IF OBJECT_ID(N'dbo.shift_cash_counts', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.change_tracking_tables WHERE object_id=OBJECT_ID(N'dbo.shift_cash_counts')) ALTER TABLE dbo.[shift_cash_counts] ENABLE CHANGE_TRACKING;

IF COL_LENGTH(N'dbo.shift_cash_counts', N'id') IS NULL ALTER TABLE dbo.[shift_cash_counts] ADD [id] uniqueidentifier NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.shift_cash_counts') AND c.name=N'id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[shift_cash_counts] ALTER COLUMN [id] uniqueidentifier NOT NULL;

IF COL_LENGTH(N'dbo.shift_cash_counts', N'shift_id') IS NULL ALTER TABLE dbo.[shift_cash_counts] ADD [shift_id] uniqueidentifier NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.shift_cash_counts') AND c.name=N'shift_id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[shift_cash_counts] ALTER COLUMN [shift_id] uniqueidentifier NOT NULL;

IF COL_LENGTH(N'dbo.shift_cash_counts', N'store_id') IS NULL ALTER TABLE dbo.[shift_cash_counts] ADD [store_id] nvarchar(450) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.shift_cash_counts') AND c.name=N'store_id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[shift_cash_counts] ALTER COLUMN [store_id] nvarchar(450) NOT NULL;

IF COL_LENGTH(N'dbo.shift_cash_counts', N'terminal_id') IS NULL ALTER TABLE dbo.[shift_cash_counts] ADD [terminal_id] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.shift_cash_counts', N'kind') IS NULL ALTER TABLE dbo.[shift_cash_counts] ADD [kind] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.shift_cash_counts', N'counted_cash') IS NULL ALTER TABLE dbo.[shift_cash_counts] ADD [counted_cash] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.shift_cash_counts', N'counted_card') IS NULL ALTER TABLE dbo.[shift_cash_counts] ADD [counted_card] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.shift_cash_counts', N'counted_digital') IS NULL ALTER TABLE dbo.[shift_cash_counts] ADD [counted_digital] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.shift_cash_counts', N'reason') IS NULL ALTER TABLE dbo.[shift_cash_counts] ADD [reason] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.shift_cash_counts', N'counted_by_name') IS NULL ALTER TABLE dbo.[shift_cash_counts] ADD [counted_by_name] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.shift_cash_counts', N'counted_by_staff_id') IS NULL ALTER TABLE dbo.[shift_cash_counts] ADD [counted_by_staff_id] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.shift_cash_counts', N'counted_by_user_id') IS NULL ALTER TABLE dbo.[shift_cash_counts] ADD [counted_by_user_id] uniqueidentifier NULL;

IF COL_LENGTH(N'dbo.shift_cash_counts', N'client_key') IS NULL ALTER TABLE dbo.[shift_cash_counts] ADD [client_key] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.shift_cash_counts', N'created_at') IS NULL ALTER TABLE dbo.[shift_cash_counts] ADD [created_at] datetimeoffset(7) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.shift_cash_counts') AND name=N'IX_shift_cash_counts_store_id') CREATE INDEX [IX_shift_cash_counts_store_id] ON dbo.[shift_cash_counts]([store_id]);

IF OBJECT_ID(N'dbo.shift_close_events', N'U') IS NULL BEGIN CREATE TABLE dbo.[shift_close_events] (

  [id] uniqueidentifier NOT NULL CONSTRAINT [DF_shift_close_events_id] DEFAULT (NEWID()),
  [shift_id] uniqueidentifier NOT NULL,
  [store_id] nvarchar(450) NOT NULL,
  [terminal_id] nvarchar(max) NULL,
  [event] nvarchar(max) NOT NULL,
  [from_state] nvarchar(max) NULL,
  [to_state] nvarchar(max) NULL,
  [detail] nvarchar(max) NOT NULL CONSTRAINT [DF_shift_close_events_detail] DEFAULT (N'[]'),
  [actor_name] nvarchar(max) NULL,
  [actor_staff_id] nvarchar(max) NULL,
  [actor_user_id] uniqueidentifier NULL,
  [created_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_shift_close_events_created_at] DEFAULT (SYSDATETIMEOFFSET()),
  CONSTRAINT [PK_shift_close_events] PRIMARY KEY ([id])

); END;

IF OBJECT_ID(N'dbo.shift_close_events', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.change_tracking_tables WHERE object_id=OBJECT_ID(N'dbo.shift_close_events')) ALTER TABLE dbo.[shift_close_events] ENABLE CHANGE_TRACKING;

IF COL_LENGTH(N'dbo.shift_close_events', N'id') IS NULL ALTER TABLE dbo.[shift_close_events] ADD [id] uniqueidentifier NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.shift_close_events') AND c.name=N'id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[shift_close_events] ALTER COLUMN [id] uniqueidentifier NOT NULL;

IF COL_LENGTH(N'dbo.shift_close_events', N'shift_id') IS NULL ALTER TABLE dbo.[shift_close_events] ADD [shift_id] uniqueidentifier NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.shift_close_events') AND c.name=N'shift_id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[shift_close_events] ALTER COLUMN [shift_id] uniqueidentifier NOT NULL;

IF COL_LENGTH(N'dbo.shift_close_events', N'store_id') IS NULL ALTER TABLE dbo.[shift_close_events] ADD [store_id] nvarchar(450) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.shift_close_events') AND c.name=N'store_id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[shift_close_events] ALTER COLUMN [store_id] nvarchar(450) NOT NULL;

IF COL_LENGTH(N'dbo.shift_close_events', N'terminal_id') IS NULL ALTER TABLE dbo.[shift_close_events] ADD [terminal_id] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.shift_close_events', N'event') IS NULL ALTER TABLE dbo.[shift_close_events] ADD [event] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.shift_close_events', N'from_state') IS NULL ALTER TABLE dbo.[shift_close_events] ADD [from_state] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.shift_close_events', N'to_state') IS NULL ALTER TABLE dbo.[shift_close_events] ADD [to_state] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.shift_close_events', N'detail') IS NULL ALTER TABLE dbo.[shift_close_events] ADD [detail] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.shift_close_events', N'actor_name') IS NULL ALTER TABLE dbo.[shift_close_events] ADD [actor_name] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.shift_close_events', N'actor_staff_id') IS NULL ALTER TABLE dbo.[shift_close_events] ADD [actor_staff_id] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.shift_close_events', N'actor_user_id') IS NULL ALTER TABLE dbo.[shift_close_events] ADD [actor_user_id] uniqueidentifier NULL;

IF COL_LENGTH(N'dbo.shift_close_events', N'created_at') IS NULL ALTER TABLE dbo.[shift_close_events] ADD [created_at] datetimeoffset(7) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.shift_close_events') AND name=N'IX_shift_close_events_store_id') CREATE INDEX [IX_shift_close_events_store_id] ON dbo.[shift_close_events]([store_id]);

IF OBJECT_ID(N'dbo.shift_reconciliations', N'U') IS NULL BEGIN CREATE TABLE dbo.[shift_reconciliations] (

  [id] uniqueidentifier NOT NULL CONSTRAINT [DF_shift_reconciliations_id] DEFAULT (NEWID()),
  [shift_id] uniqueidentifier NOT NULL,
  [store_id] nvarchar(450) NOT NULL,
  [count_id] uniqueidentifier NULL,
  [expected_cash] decimal(38,12) NOT NULL CONSTRAINT [DF_shift_reconciliations_expected_cash] DEFAULT (0),
  [expected_card] decimal(38,12) NOT NULL CONSTRAINT [DF_shift_reconciliations_expected_card] DEFAULT (0),
  [expected_digital] decimal(38,12) NOT NULL CONSTRAINT [DF_shift_reconciliations_expected_digital] DEFAULT (0),
  [counted_cash] decimal(38,12) NULL,
  [counted_card] decimal(38,12) NULL,
  [counted_digital] decimal(38,12) NULL,
  [variance_cash] decimal(38,12) NULL,
  [variance_card] decimal(38,12) NULL,
  [variance_digital] decimal(38,12) NULL,
  [variance_total] decimal(38,12) NULL,
  [variance_status] nvarchar(max) NOT NULL CONSTRAINT [DF_shift_reconciliations_variance_status] DEFAULT ('NO_VARIANCE'),
  [created_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_shift_reconciliations_created_at] DEFAULT (SYSDATETIMEOFFSET()),
  CONSTRAINT [PK_shift_reconciliations] PRIMARY KEY ([id])

); END;

IF OBJECT_ID(N'dbo.shift_reconciliations', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.change_tracking_tables WHERE object_id=OBJECT_ID(N'dbo.shift_reconciliations')) ALTER TABLE dbo.[shift_reconciliations] ENABLE CHANGE_TRACKING;

IF COL_LENGTH(N'dbo.shift_reconciliations', N'id') IS NULL ALTER TABLE dbo.[shift_reconciliations] ADD [id] uniqueidentifier NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.shift_reconciliations') AND c.name=N'id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[shift_reconciliations] ALTER COLUMN [id] uniqueidentifier NOT NULL;

IF COL_LENGTH(N'dbo.shift_reconciliations', N'shift_id') IS NULL ALTER TABLE dbo.[shift_reconciliations] ADD [shift_id] uniqueidentifier NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.shift_reconciliations') AND c.name=N'shift_id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[shift_reconciliations] ALTER COLUMN [shift_id] uniqueidentifier NOT NULL;

IF COL_LENGTH(N'dbo.shift_reconciliations', N'store_id') IS NULL ALTER TABLE dbo.[shift_reconciliations] ADD [store_id] nvarchar(450) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.shift_reconciliations') AND c.name=N'store_id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[shift_reconciliations] ALTER COLUMN [store_id] nvarchar(450) NOT NULL;

IF COL_LENGTH(N'dbo.shift_reconciliations', N'count_id') IS NULL ALTER TABLE dbo.[shift_reconciliations] ADD [count_id] uniqueidentifier NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.shift_reconciliations') AND c.name=N'count_id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[shift_reconciliations] ALTER COLUMN [count_id] uniqueidentifier NULL;

IF COL_LENGTH(N'dbo.shift_reconciliations', N'expected_cash') IS NULL ALTER TABLE dbo.[shift_reconciliations] ADD [expected_cash] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.shift_reconciliations', N'expected_card') IS NULL ALTER TABLE dbo.[shift_reconciliations] ADD [expected_card] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.shift_reconciliations', N'expected_digital') IS NULL ALTER TABLE dbo.[shift_reconciliations] ADD [expected_digital] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.shift_reconciliations', N'counted_cash') IS NULL ALTER TABLE dbo.[shift_reconciliations] ADD [counted_cash] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.shift_reconciliations', N'counted_card') IS NULL ALTER TABLE dbo.[shift_reconciliations] ADD [counted_card] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.shift_reconciliations', N'counted_digital') IS NULL ALTER TABLE dbo.[shift_reconciliations] ADD [counted_digital] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.shift_reconciliations', N'variance_cash') IS NULL ALTER TABLE dbo.[shift_reconciliations] ADD [variance_cash] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.shift_reconciliations', N'variance_card') IS NULL ALTER TABLE dbo.[shift_reconciliations] ADD [variance_card] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.shift_reconciliations', N'variance_digital') IS NULL ALTER TABLE dbo.[shift_reconciliations] ADD [variance_digital] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.shift_reconciliations', N'variance_total') IS NULL ALTER TABLE dbo.[shift_reconciliations] ADD [variance_total] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.shift_reconciliations', N'variance_status') IS NULL ALTER TABLE dbo.[shift_reconciliations] ADD [variance_status] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.shift_reconciliations', N'created_at') IS NULL ALTER TABLE dbo.[shift_reconciliations] ADD [created_at] datetimeoffset(7) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.shift_reconciliations') AND name=N'IX_shift_reconciliations_store_id') CREATE INDEX [IX_shift_reconciliations_store_id] ON dbo.[shift_reconciliations]([store_id]);

IF OBJECT_ID(N'dbo.shift_variance_alerts', N'U') IS NULL BEGIN CREATE TABLE dbo.[shift_variance_alerts] (

  [id] uniqueidentifier NOT NULL CONSTRAINT [DF_shift_variance_alerts_id] DEFAULT (NEWID()),
  [shift_id] uniqueidentifier NOT NULL,
  [store_id] nvarchar(450) NOT NULL,
  [reconciliation_id] uniqueidentifier NULL,
  [variance_total] decimal(38,12) NOT NULL,
  [variance_status] nvarchar(max) NOT NULL,
  [severity] nvarchar(max) NOT NULL CONSTRAINT [DF_shift_variance_alerts_severity] DEFAULT ('warning'),
  [message] nvarchar(max) NOT NULL,
  [delivery_status] nvarchar(max) NOT NULL CONSTRAINT [DF_shift_variance_alerts_delivery_status] DEFAULT ('pending'),
  [attempts] int NOT NULL CONSTRAINT [DF_shift_variance_alerts_attempts] DEFAULT (0),
  [last_error] nvarchar(max) NULL,
  [last_attempt_at] datetimeoffset(7) NULL,
  [acknowledged_at] datetimeoffset(7) NULL,
  [acknowledged_by] nvarchar(max) NULL,
  [created_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_shift_variance_alerts_created_at] DEFAULT (SYSDATETIMEOFFSET()),
  [updated_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_shift_variance_alerts_updated_at] DEFAULT (SYSDATETIMEOFFSET()),
  CONSTRAINT [PK_shift_variance_alerts] PRIMARY KEY ([id])

); END;

IF OBJECT_ID(N'dbo.shift_variance_alerts', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.change_tracking_tables WHERE object_id=OBJECT_ID(N'dbo.shift_variance_alerts')) ALTER TABLE dbo.[shift_variance_alerts] ENABLE CHANGE_TRACKING;

IF COL_LENGTH(N'dbo.shift_variance_alerts', N'id') IS NULL ALTER TABLE dbo.[shift_variance_alerts] ADD [id] uniqueidentifier NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.shift_variance_alerts') AND c.name=N'id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[shift_variance_alerts] ALTER COLUMN [id] uniqueidentifier NOT NULL;

IF COL_LENGTH(N'dbo.shift_variance_alerts', N'shift_id') IS NULL ALTER TABLE dbo.[shift_variance_alerts] ADD [shift_id] uniqueidentifier NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.shift_variance_alerts') AND c.name=N'shift_id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[shift_variance_alerts] ALTER COLUMN [shift_id] uniqueidentifier NOT NULL;

IF COL_LENGTH(N'dbo.shift_variance_alerts', N'store_id') IS NULL ALTER TABLE dbo.[shift_variance_alerts] ADD [store_id] nvarchar(450) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.shift_variance_alerts') AND c.name=N'store_id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[shift_variance_alerts] ALTER COLUMN [store_id] nvarchar(450) NOT NULL;

IF COL_LENGTH(N'dbo.shift_variance_alerts', N'reconciliation_id') IS NULL ALTER TABLE dbo.[shift_variance_alerts] ADD [reconciliation_id] uniqueidentifier NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.shift_variance_alerts') AND c.name=N'reconciliation_id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[shift_variance_alerts] ALTER COLUMN [reconciliation_id] uniqueidentifier NULL;

IF COL_LENGTH(N'dbo.shift_variance_alerts', N'variance_total') IS NULL ALTER TABLE dbo.[shift_variance_alerts] ADD [variance_total] decimal(38,12) NULL;

IF COL_LENGTH(N'dbo.shift_variance_alerts', N'variance_status') IS NULL ALTER TABLE dbo.[shift_variance_alerts] ADD [variance_status] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.shift_variance_alerts', N'severity') IS NULL ALTER TABLE dbo.[shift_variance_alerts] ADD [severity] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.shift_variance_alerts', N'message') IS NULL ALTER TABLE dbo.[shift_variance_alerts] ADD [message] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.shift_variance_alerts', N'delivery_status') IS NULL ALTER TABLE dbo.[shift_variance_alerts] ADD [delivery_status] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.shift_variance_alerts', N'attempts') IS NULL ALTER TABLE dbo.[shift_variance_alerts] ADD [attempts] int NULL;

IF COL_LENGTH(N'dbo.shift_variance_alerts', N'last_error') IS NULL ALTER TABLE dbo.[shift_variance_alerts] ADD [last_error] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.shift_variance_alerts', N'last_attempt_at') IS NULL ALTER TABLE dbo.[shift_variance_alerts] ADD [last_attempt_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.shift_variance_alerts', N'acknowledged_at') IS NULL ALTER TABLE dbo.[shift_variance_alerts] ADD [acknowledged_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.shift_variance_alerts', N'acknowledged_by') IS NULL ALTER TABLE dbo.[shift_variance_alerts] ADD [acknowledged_by] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.shift_variance_alerts', N'created_at') IS NULL ALTER TABLE dbo.[shift_variance_alerts] ADD [created_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.shift_variance_alerts', N'updated_at') IS NULL ALTER TABLE dbo.[shift_variance_alerts] ADD [updated_at] datetimeoffset(7) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.shift_variance_alerts') AND c.name=N'updated_at' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[shift_variance_alerts] ALTER COLUMN [updated_at] datetimeoffset(7) NOT NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.shift_variance_alerts') AND name=N'IX_shift_variance_alerts_store_id') CREATE INDEX [IX_shift_variance_alerts_store_id] ON dbo.[shift_variance_alerts]([store_id]);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.shift_variance_alerts') AND name=N'IX_shift_variance_alerts_updated_at') CREATE INDEX [IX_shift_variance_alerts_updated_at] ON dbo.[shift_variance_alerts]([updated_at]);

IF OBJECT_ID(N'dbo.entity_status_history', N'U') IS NULL BEGIN CREATE TABLE dbo.[entity_status_history] (

  [id] uniqueidentifier NOT NULL CONSTRAINT [DF_entity_status_history_id] DEFAULT (NEWID()),
  [entity_type] nvarchar(max) NOT NULL,
  [entity_id] nvarchar(max) NOT NULL,
  [status_kind] nvarchar(max) NOT NULL CONSTRAINT [DF_entity_status_history_status_kind] DEFAULT ('status'),
  [previous_status] nvarchar(max) NULL,
  [new_status] nvarchar(max) NOT NULL,
  [reason] nvarchar(max) NULL,
  [actor_id] nvarchar(max) NULL,
  [actor_name] nvarchar(max) NULL,
  [actor_role] nvarchar(max) NULL,
  [store_id] nvarchar(450) NULL,
  [branch_id] nvarchar(450) NULL,
  [terminal_id] nvarchar(max) NULL,
  [related_entity_type] nvarchar(max) NULL,
  [related_entity_id] nvarchar(max) NULL,
  [metadata] nvarchar(max) NOT NULL CONSTRAINT [DF_entity_status_history_metadata] DEFAULT (N'[]'),
  [client_event_id] nvarchar(max) NULL,
  [occurred_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_entity_status_history_occurred_at] DEFAULT (SYSDATETIMEOFFSET()),
  [created_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_entity_status_history_created_at] DEFAULT (SYSDATETIMEOFFSET()),
  [updated_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_entity_status_history_updated_at] DEFAULT (SYSDATETIMEOFFSET()),
  [row_version] bigint NOT NULL CONSTRAINT [DF_entity_status_history_row_version] DEFAULT (1),
  CONSTRAINT [PK_entity_status_history] PRIMARY KEY ([id])

); END;

IF OBJECT_ID(N'dbo.entity_status_history', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.change_tracking_tables WHERE object_id=OBJECT_ID(N'dbo.entity_status_history')) ALTER TABLE dbo.[entity_status_history] ENABLE CHANGE_TRACKING;

IF COL_LENGTH(N'dbo.entity_status_history', N'id') IS NULL ALTER TABLE dbo.[entity_status_history] ADD [id] uniqueidentifier NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.entity_status_history') AND c.name=N'id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[entity_status_history] ALTER COLUMN [id] uniqueidentifier NOT NULL;

IF COL_LENGTH(N'dbo.entity_status_history', N'entity_type') IS NULL ALTER TABLE dbo.[entity_status_history] ADD [entity_type] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.entity_status_history', N'entity_id') IS NULL ALTER TABLE dbo.[entity_status_history] ADD [entity_id] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.entity_status_history', N'status_kind') IS NULL ALTER TABLE dbo.[entity_status_history] ADD [status_kind] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.entity_status_history', N'previous_status') IS NULL ALTER TABLE dbo.[entity_status_history] ADD [previous_status] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.entity_status_history', N'new_status') IS NULL ALTER TABLE dbo.[entity_status_history] ADD [new_status] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.entity_status_history', N'reason') IS NULL ALTER TABLE dbo.[entity_status_history] ADD [reason] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.entity_status_history', N'actor_id') IS NULL ALTER TABLE dbo.[entity_status_history] ADD [actor_id] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.entity_status_history', N'actor_name') IS NULL ALTER TABLE dbo.[entity_status_history] ADD [actor_name] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.entity_status_history', N'actor_role') IS NULL ALTER TABLE dbo.[entity_status_history] ADD [actor_role] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.entity_status_history', N'store_id') IS NULL ALTER TABLE dbo.[entity_status_history] ADD [store_id] nvarchar(450) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.entity_status_history') AND c.name=N'store_id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[entity_status_history] ALTER COLUMN [store_id] nvarchar(450) NULL;

IF COL_LENGTH(N'dbo.entity_status_history', N'branch_id') IS NULL ALTER TABLE dbo.[entity_status_history] ADD [branch_id] nvarchar(450) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.entity_status_history') AND c.name=N'branch_id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[entity_status_history] ALTER COLUMN [branch_id] nvarchar(450) NULL;

IF COL_LENGTH(N'dbo.entity_status_history', N'terminal_id') IS NULL ALTER TABLE dbo.[entity_status_history] ADD [terminal_id] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.entity_status_history', N'related_entity_type') IS NULL ALTER TABLE dbo.[entity_status_history] ADD [related_entity_type] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.entity_status_history', N'related_entity_id') IS NULL ALTER TABLE dbo.[entity_status_history] ADD [related_entity_id] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.entity_status_history', N'metadata') IS NULL ALTER TABLE dbo.[entity_status_history] ADD [metadata] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.entity_status_history', N'client_event_id') IS NULL ALTER TABLE dbo.[entity_status_history] ADD [client_event_id] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.entity_status_history', N'occurred_at') IS NULL ALTER TABLE dbo.[entity_status_history] ADD [occurred_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.entity_status_history', N'created_at') IS NULL ALTER TABLE dbo.[entity_status_history] ADD [created_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.entity_status_history', N'updated_at') IS NULL ALTER TABLE dbo.[entity_status_history] ADD [updated_at] datetimeoffset(7) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.entity_status_history') AND c.name=N'updated_at' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[entity_status_history] ALTER COLUMN [updated_at] datetimeoffset(7) NOT NULL;

IF COL_LENGTH(N'dbo.entity_status_history', N'row_version') IS NULL ALTER TABLE dbo.[entity_status_history] ADD [row_version] bigint NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.entity_status_history') AND name=N'IX_entity_status_history_store_id') CREATE INDEX [IX_entity_status_history_store_id] ON dbo.[entity_status_history]([store_id]);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.entity_status_history') AND name=N'IX_entity_status_history_branch_id') CREATE INDEX [IX_entity_status_history_branch_id] ON dbo.[entity_status_history]([branch_id]);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.entity_status_history') AND name=N'IX_entity_status_history_updated_at') CREATE INDEX [IX_entity_status_history_updated_at] ON dbo.[entity_status_history]([updated_at]);

IF OBJECT_ID(N'dbo.nav_pins', N'U') IS NULL BEGIN CREATE TABLE dbo.[nav_pins] (

  [id] uniqueidentifier NOT NULL,
  [owner_id] uniqueidentifier NULL,
  [item_kind] nvarchar(max) NOT NULL,
  [item_key] nvarchar(max) NOT NULL,
  [sort_order] int NOT NULL CONSTRAINT [DF_nav_pins_sort_order] DEFAULT (0),
  [created_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_nav_pins_created_at] DEFAULT (SYSDATETIMEOFFSET()),
  [updated_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_nav_pins_updated_at] DEFAULT (SYSDATETIMEOFFSET()),
  CONSTRAINT [PK_nav_pins] PRIMARY KEY ([id])

); END;

IF OBJECT_ID(N'dbo.nav_pins', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.change_tracking_tables WHERE object_id=OBJECT_ID(N'dbo.nav_pins')) ALTER TABLE dbo.[nav_pins] ENABLE CHANGE_TRACKING;

IF COL_LENGTH(N'dbo.nav_pins', N'id') IS NULL ALTER TABLE dbo.[nav_pins] ADD [id] uniqueidentifier NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.nav_pins') AND c.name=N'id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[nav_pins] ALTER COLUMN [id] uniqueidentifier NOT NULL;

IF COL_LENGTH(N'dbo.nav_pins', N'owner_id') IS NULL ALTER TABLE dbo.[nav_pins] ADD [owner_id] uniqueidentifier NULL;

IF COL_LENGTH(N'dbo.nav_pins', N'item_kind') IS NULL ALTER TABLE dbo.[nav_pins] ADD [item_kind] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.nav_pins', N'item_key') IS NULL ALTER TABLE dbo.[nav_pins] ADD [item_key] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.nav_pins', N'sort_order') IS NULL ALTER TABLE dbo.[nav_pins] ADD [sort_order] int NULL;

IF COL_LENGTH(N'dbo.nav_pins', N'created_at') IS NULL ALTER TABLE dbo.[nav_pins] ADD [created_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.nav_pins', N'updated_at') IS NULL ALTER TABLE dbo.[nav_pins] ADD [updated_at] datetimeoffset(7) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.nav_pins') AND c.name=N'updated_at' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[nav_pins] ALTER COLUMN [updated_at] datetimeoffset(7) NOT NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.nav_pins') AND name=N'IX_nav_pins_updated_at') CREATE INDEX [IX_nav_pins_updated_at] ON dbo.[nav_pins]([updated_at]);

IF OBJECT_ID(N'dbo.store_groups', N'U') IS NULL BEGIN CREATE TABLE dbo.[store_groups] (

  [id] nvarchar(450) NOT NULL,
  [code] nvarchar(max) NOT NULL,
  [name] nvarchar(max) NOT NULL,
  [is_active] bit NOT NULL CONSTRAINT [DF_store_groups_is_active] DEFAULT (1),
  [archived_at] datetimeoffset(7) NULL,
  [created_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_store_groups_created_at] DEFAULT (SYSDATETIMEOFFSET()),
  [updated_at] datetimeoffset(7) NOT NULL CONSTRAINT [DF_store_groups_updated_at] DEFAULT (SYSDATETIMEOFFSET()),
  CONSTRAINT [PK_store_groups] PRIMARY KEY ([id])

); END;

IF OBJECT_ID(N'dbo.store_groups', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.change_tracking_tables WHERE object_id=OBJECT_ID(N'dbo.store_groups')) ALTER TABLE dbo.[store_groups] ENABLE CHANGE_TRACKING;

IF COL_LENGTH(N'dbo.store_groups', N'id') IS NULL ALTER TABLE dbo.[store_groups] ADD [id] nvarchar(450) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.store_groups') AND c.name=N'id' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[store_groups] ALTER COLUMN [id] nvarchar(450) NOT NULL;

IF COL_LENGTH(N'dbo.store_groups', N'code') IS NULL ALTER TABLE dbo.[store_groups] ADD [code] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.store_groups', N'name') IS NULL ALTER TABLE dbo.[store_groups] ADD [name] nvarchar(max) NULL;

IF COL_LENGTH(N'dbo.store_groups', N'is_active') IS NULL ALTER TABLE dbo.[store_groups] ADD [is_active] bit NULL;

IF COL_LENGTH(N'dbo.store_groups', N'archived_at') IS NULL ALTER TABLE dbo.[store_groups] ADD [archived_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.store_groups', N'created_at') IS NULL ALTER TABLE dbo.[store_groups] ADD [created_at] datetimeoffset(7) NULL;

IF COL_LENGTH(N'dbo.store_groups', N'updated_at') IS NULL ALTER TABLE dbo.[store_groups] ADD [updated_at] datetimeoffset(7) NULL;

IF EXISTS (SELECT 1 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.store_groups') AND c.name=N'updated_at' AND t.name IN (N'nvarchar',N'varchar') AND c.max_length=-1) ALTER TABLE dbo.[store_groups] ALTER COLUMN [updated_at] datetimeoffset(7) NOT NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.store_groups') AND name=N'IX_store_groups_updated_at') CREATE INDEX [IX_store_groups_updated_at] ON dbo.[store_groups]([updated_at]);

IF OBJECT_ID(N'dbo.coupon_campaigns',N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'dbo.issued_vouchers') AND name=N'FK_issued_vouchers_campaign_id') ALTER TABLE dbo.[issued_vouchers] ADD CONSTRAINT [FK_issued_vouchers_campaign_id] FOREIGN KEY ([campaign_id]) REFERENCES dbo.[coupon_campaigns]([id]);

IF OBJECT_ID(N'dbo.members',N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'dbo.issued_vouchers') AND name=N'FK_issued_vouchers_member_id') ALTER TABLE dbo.[issued_vouchers] ADD CONSTRAINT [FK_issued_vouchers_member_id] FOREIGN KEY ([member_id]) REFERENCES dbo.[members]([id]);

IF OBJECT_ID(N'dbo.bookings',N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'dbo.booking_payments') AND name=N'FK_booking_payments_booking_id') ALTER TABLE dbo.[booking_payments] ADD CONSTRAINT [FK_booking_payments_booking_id] FOREIGN KEY ([booking_id]) REFERENCES dbo.[bookings]([id]);

IF OBJECT_ID(N'dbo.members',N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'dbo.bookings') AND name=N'FK_bookings_member_id') ALTER TABLE dbo.[bookings] ADD CONSTRAINT [FK_bookings_member_id] FOREIGN KEY ([member_id]) REFERENCES dbo.[members]([id]);

IF OBJECT_ID(N'dbo.coupon_campaigns',N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'dbo.coupon_events') AND name=N'FK_coupon_events_campaign_id') ALTER TABLE dbo.[coupon_events] ADD CONSTRAINT [FK_coupon_events_campaign_id] FOREIGN KEY ([campaign_id]) REFERENCES dbo.[coupon_campaigns]([id]);

IF OBJECT_ID(N'dbo.members',N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'dbo.coupon_events') AND name=N'FK_coupon_events_member_id') ALTER TABLE dbo.[coupon_events] ADD CONSTRAINT [FK_coupon_events_member_id] FOREIGN KEY ([member_id]) REFERENCES dbo.[members]([id]);

IF OBJECT_ID(N'dbo.products',N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'dbo.item_activity_logs') AND name=N'FK_item_activity_logs_product_id') ALTER TABLE dbo.[item_activity_logs] ADD CONSTRAINT [FK_item_activity_logs_product_id] FOREIGN KEY ([product_id]) REFERENCES dbo.[products]([id]);

IF OBJECT_ID(N'dbo.members',N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'dbo.member_verifications') AND name=N'FK_member_verifications_member_id') ALTER TABLE dbo.[member_verifications] ADD CONSTRAINT [FK_member_verifications_member_id] FOREIGN KEY ([member_id]) REFERENCES dbo.[members]([id]);

IF OBJECT_ID(N'dbo.membership_tiers',N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'dbo.members') AND name=N'FK_members_tier_id') ALTER TABLE dbo.[members] ADD CONSTRAINT [FK_members_tier_id] FOREIGN KEY ([tier_id]) REFERENCES dbo.[membership_tiers]([id]);

IF OBJECT_ID(N'dbo.sales',N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'dbo.payment_transactions') AND name=N'FK_payment_transactions_sale_id') ALTER TABLE dbo.[payment_transactions] ADD CONSTRAINT [FK_payment_transactions_sale_id] FOREIGN KEY ([sale_id]) REFERENCES dbo.[sales]([id]);

IF OBJECT_ID(N'dbo.bookings',N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'dbo.payment_transactions') AND name=N'FK_payment_transactions_booking_id') ALTER TABLE dbo.[payment_transactions] ADD CONSTRAINT [FK_payment_transactions_booking_id] FOREIGN KEY ([booking_id]) REFERENCES dbo.[bookings]([id]);

IF OBJECT_ID(N'dbo.members',N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'dbo.payment_transactions') AND name=N'FK_payment_transactions_member_id') ALTER TABLE dbo.[payment_transactions] ADD CONSTRAINT [FK_payment_transactions_member_id] FOREIGN KEY ([member_id]) REFERENCES dbo.[members]([id]);

IF OBJECT_ID(N'dbo.products',N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'dbo.product_barcodes') AND name=N'FK_product_barcodes_product_id') ALTER TABLE dbo.[product_barcodes] ADD CONSTRAINT [FK_product_barcodes_product_id] FOREIGN KEY ([product_id]) REFERENCES dbo.[products]([id]);

IF OBJECT_ID(N'dbo.product_categories',N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'dbo.product_categories') AND name=N'FK_product_categories_parent_id') ALTER TABLE dbo.[product_categories] ADD CONSTRAINT [FK_product_categories_parent_id] FOREIGN KEY ([parent_id]) REFERENCES dbo.[product_categories]([id]);

IF OBJECT_ID(N'dbo.stores',N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'dbo.products') AND name=N'FK_products_owner_store_id') ALTER TABLE dbo.[products] ADD CONSTRAINT [FK_products_owner_store_id] FOREIGN KEY ([owner_store_id]) REFERENCES dbo.[stores]([id]);

IF OBJECT_ID(N'dbo.products',N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'dbo.promotions') AND name=N'FK_promotions_foc_product_id') ALTER TABLE dbo.[promotions] ADD CONSTRAINT [FK_promotions_foc_product_id] FOREIGN KEY ([foc_product_id]) REFERENCES dbo.[products]([id]);

IF OBJECT_ID(N'dbo.purchase_orders',N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'dbo.purchase_order_items') AND name=N'FK_purchase_order_items_po_id') ALTER TABLE dbo.[purchase_order_items] ADD CONSTRAINT [FK_purchase_order_items_po_id] FOREIGN KEY ([po_id]) REFERENCES dbo.[purchase_orders]([id]);

IF OBJECT_ID(N'dbo.products',N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'dbo.purchase_order_items') AND name=N'FK_purchase_order_items_product_id') ALTER TABLE dbo.[purchase_order_items] ADD CONSTRAINT [FK_purchase_order_items_product_id] FOREIGN KEY ([product_id]) REFERENCES dbo.[products]([id]);

IF OBJECT_ID(N'dbo.suppliers',N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'dbo.purchase_orders') AND name=N'FK_purchase_orders_supplier_id') ALTER TABLE dbo.[purchase_orders] ADD CONSTRAINT [FK_purchase_orders_supplier_id] FOREIGN KEY ([supplier_id]) REFERENCES dbo.[suppliers]([id]);

IF OBJECT_ID(N'dbo.sales',N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'dbo.sale_items') AND name=N'FK_sale_items_sale_id') ALTER TABLE dbo.[sale_items] ADD CONSTRAINT [FK_sale_items_sale_id] FOREIGN KEY ([sale_id]) REFERENCES dbo.[sales]([id]);

IF OBJECT_ID(N'dbo.products',N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'dbo.sale_items') AND name=N'FK_sale_items_product_id') ALTER TABLE dbo.[sale_items] ADD CONSTRAINT [FK_sale_items_product_id] FOREIGN KEY ([product_id]) REFERENCES dbo.[products]([id]);

IF OBJECT_ID(N'dbo.members',N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'dbo.sales') AND name=N'FK_sales_member_id') ALTER TABLE dbo.[sales] ADD CONSTRAINT [FK_sales_member_id] FOREIGN KEY ([member_id]) REFERENCES dbo.[members]([id]);

IF OBJECT_ID(N'dbo.products',N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'dbo.stock_adjustments') AND name=N'FK_stock_adjustments_product_id') ALTER TABLE dbo.[stock_adjustments] ADD CONSTRAINT [FK_stock_adjustments_product_id] FOREIGN KEY ([product_id]) REFERENCES dbo.[products]([id]);

IF OBJECT_ID(N'dbo.stock_transfers',N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'dbo.stock_transfer_items') AND name=N'FK_stock_transfer_items_transfer_id') ALTER TABLE dbo.[stock_transfer_items] ADD CONSTRAINT [FK_stock_transfer_items_transfer_id] FOREIGN KEY ([transfer_id]) REFERENCES dbo.[stock_transfers]([id]);

IF OBJECT_ID(N'dbo.products',N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'dbo.stock_transfer_items') AND name=N'FK_stock_transfer_items_product_id') ALTER TABLE dbo.[stock_transfer_items] ADD CONSTRAINT [FK_stock_transfer_items_product_id] FOREIGN KEY ([product_id]) REFERENCES dbo.[products]([id]);

IF OBJECT_ID(N'dbo.store_groups',N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'dbo.stores') AND name=N'FK_stores_group_id') ALTER TABLE dbo.[stores] ADD CONSTRAINT [FK_stores_group_id] FOREIGN KEY ([group_id]) REFERENCES dbo.[store_groups]([id]);

IF OBJECT_ID(N'dbo.stores',N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'dbo.stores') AND name=N'FK_stores_parent_id') ALTER TABLE dbo.[stores] ADD CONSTRAINT [FK_stores_parent_id] FOREIGN KEY ([parent_id]) REFERENCES dbo.[stores]([id]);

IF OBJECT_ID(N'dbo.stores',N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'dbo.terminal_tokens') AND name=N'FK_terminal_tokens_location_id') ALTER TABLE dbo.[terminal_tokens] ADD CONSTRAINT [FK_terminal_tokens_location_id] FOREIGN KEY ([location_id]) REFERENCES dbo.[stores]([id]);

IF OBJECT_ID(N'dbo.shifts',N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'dbo.shift_cash_counts') AND name=N'FK_shift_cash_counts_shift_id') ALTER TABLE dbo.[shift_cash_counts] ADD CONSTRAINT [FK_shift_cash_counts_shift_id] FOREIGN KEY ([shift_id]) REFERENCES dbo.[shifts]([id]);

IF OBJECT_ID(N'dbo.shifts',N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'dbo.shift_close_events') AND name=N'FK_shift_close_events_shift_id') ALTER TABLE dbo.[shift_close_events] ADD CONSTRAINT [FK_shift_close_events_shift_id] FOREIGN KEY ([shift_id]) REFERENCES dbo.[shifts]([id]);

IF OBJECT_ID(N'dbo.shifts',N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'dbo.shift_reconciliations') AND name=N'FK_shift_reconciliations_shift_id') ALTER TABLE dbo.[shift_reconciliations] ADD CONSTRAINT [FK_shift_reconciliations_shift_id] FOREIGN KEY ([shift_id]) REFERENCES dbo.[shifts]([id]);

IF OBJECT_ID(N'dbo.shift_cash_counts',N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'dbo.shift_reconciliations') AND name=N'FK_shift_reconciliations_count_id') ALTER TABLE dbo.[shift_reconciliations] ADD CONSTRAINT [FK_shift_reconciliations_count_id] FOREIGN KEY ([count_id]) REFERENCES dbo.[shift_cash_counts]([id]);

IF OBJECT_ID(N'dbo.shifts',N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'dbo.shift_variance_alerts') AND name=N'FK_shift_variance_alerts_shift_id') ALTER TABLE dbo.[shift_variance_alerts] ADD CONSTRAINT [FK_shift_variance_alerts_shift_id] FOREIGN KEY ([shift_id]) REFERENCES dbo.[shifts]([id]);

IF OBJECT_ID(N'dbo.shift_reconciliations',N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'dbo.shift_variance_alerts') AND name=N'FK_shift_variance_alerts_reconciliation_id') ALTER TABLE dbo.[shift_variance_alerts] ADD CONSTRAINT [FK_shift_variance_alerts_reconciliation_id] FOREIGN KEY ([reconciliation_id]) REFERENCES dbo.[shift_reconciliations]([id]);

IF OBJECT_ID(N'dbo.pos_jobs', N'U') IS NULL CREATE TABLE dbo.pos_jobs (
 job_id uniqueidentifier NOT NULL PRIMARY KEY, job_type nvarchar(40) NOT NULL, status nvarchar(20) NOT NULL,
 organization_id nvarchar(128) NULL, organization_name nvarchar(256) NULL, branch_id nvarchar(128) NULL,
 branch_name nvarchar(256) NULL, branch_code nvarchar(64) NULL, terminal_id nvarchar(128) NULL,
 terminal_name nvarchar(256) NULL, phase nvarchar(40) NULL, current_table nvarchar(128) NULL,
 dependency_index int NOT NULL DEFAULT 0, last_committed_cursor nvarchar(512) NULL,
 completed_rows bigint NOT NULL DEFAULT 0, estimated_total_rows bigint NULL, completed_bytes bigint NOT NULL DEFAULT 0,
 batch_number int NOT NULL DEFAULT 0, batch_size int NOT NULL DEFAULT 500, retry_count int NOT NULL DEFAULT 0,
 next_retry_at datetimeoffset(7) NULL, started_at datetimeoffset(7) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
 updated_at datetimeoffset(7) NOT NULL DEFAULT SYSDATETIMEOFFSET(), finished_at datetimeoffset(7) NULL,
 error_code nvarchar(64) NULL, error_message nvarchar(1000) NULL);

IF OBJECT_ID(N'dbo.sync_checkpoints', N'U') IS NULL CREATE TABLE dbo.sync_checkpoints (
 organization_id nvarchar(128) NOT NULL, branch_id nvarchar(128) NOT NULL, entity_type nvarchar(128) NOT NULL,
 direction nvarchar(8) NOT NULL, committed_cursor nvarchar(512) NULL, change_tracking_version bigint NULL,
 acknowledged_at datetimeoffset(7) NULL, updated_at datetimeoffset(7) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
 CONSTRAINT PK_sync_checkpoints PRIMARY KEY (organization_id,branch_id,entity_type,direction));

IF OBJECT_ID(N'dbo.sync_change_journal', N'U') IS NULL CREATE TABLE dbo.sync_change_journal (
 change_id bigint IDENTITY(1,1) NOT NULL PRIMARY KEY, entity_type nvarchar(128) NOT NULL,
 entity_id nvarchar(128) NOT NULL, operation nvarchar(10) NOT NULL, branch_id nvarchar(128) NOT NULL,
 entity_version bigint NOT NULL, aggregate_id uniqueidentifier NULL, acknowledged_at datetimeoffset(7) NULL,
 retry_count int NOT NULL DEFAULT 0, last_error nvarchar(1000) NULL,
 created_at datetimeoffset(7) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
 CONSTRAINT CK_sync_change_journal_metadata_only CHECK (operation IN ('insert','update','delete')));

IF COL_LENGTH(N'dbo.sync_change_journal',N'aggregate_id') IS NULL ALTER TABLE dbo.sync_change_journal ADD aggregate_id uniqueidentifier NULL;
IF COL_LENGTH(N'dbo.sync_change_journal',N'acknowledged_at') IS NULL ALTER TABLE dbo.sync_change_journal ADD acknowledged_at datetimeoffset(7) NULL;
IF COL_LENGTH(N'dbo.sync_change_journal',N'retry_count') IS NULL ALTER TABLE dbo.sync_change_journal ADD retry_count int NOT NULL CONSTRAINT DF_sync_change_journal_retry_count DEFAULT 0;
IF COL_LENGTH(N'dbo.sync_change_journal',N'last_error') IS NULL ALTER TABLE dbo.sync_change_journal ADD last_error nvarchar(1000) NULL;
IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.sync_change_journal') AND name=N'IX_sync_change_journal_pending') EXEC(N'CREATE INDEX IX_sync_change_journal_pending ON dbo.sync_change_journal(branch_id,acknowledged_at,aggregate_id,change_id)');

IF OBJECT_ID(N'dbo.sync_conflicts', N'U') IS NULL CREATE TABLE dbo.sync_conflicts (
 conflict_id uniqueidentifier NOT NULL PRIMARY KEY, entity_type nvarchar(128) NOT NULL, entity_id nvarchar(128) NOT NULL,
 branch_id nvarchar(128) NOT NULL, local_version bigint NULL, remote_version bigint NULL, reason nvarchar(1000) NOT NULL,
 status nvarchar(20) NOT NULL DEFAULT 'unresolved', created_at datetimeoffset(7) NOT NULL DEFAULT SYSDATETIMEOFFSET(), resolved_at datetimeoffset(7) NULL);

IF OBJECT_ID(N'dbo.local_operation_receipts', N'U') IS NULL CREATE TABLE dbo.local_operation_receipts (
 operation_id uniqueidentifier NOT NULL PRIMARY KEY, operation_type nvarchar(40) NOT NULL, entity_id nvarchar(128) NOT NULL,
 note nvarchar(400) NULL, committed_at datetimeoffset(7) NOT NULL DEFAULT SYSDATETIMEOFFSET());

IF OBJECT_ID(N'dbo.pos_schema_migrations', N'U') IS NULL CREATE TABLE dbo.pos_schema_migrations (
 version int NOT NULL PRIMARY KEY, name nvarchar(200) NOT NULL, applied_at datetimeoffset(7) NOT NULL DEFAULT SYSDATETIMEOFFSET());
IF NOT EXISTS(SELECT 1 FROM dbo.pos_schema_migrations WHERE version=1) INSERT dbo.pos_schema_migrations(version,name) VALUES(1,N'initial_sqlserver_parity');
