/* ---------------------------------------------------------------------------
   20260822_0104_audit_logs.sql   (LOCAL SHOP DATABASE — Microsoft SQL Server)

   Feature: Stage 1 — every offline sign-in is recorded and later uploaded.

   An offline sign-in is queued as an audit row whose id is derived from the
   terminal, the person and the minute, so a retry upserts onto the same row
   instead of creating a second record. That requires the id to be the key and
   the descriptive columns to exist.

   Required on every existing installation. Idempotent.
   Not applied automatically.
--------------------------------------------------------------------------- */

IF OBJECT_ID('dbo.audit_logs', 'U') IS NULL
CREATE TABLE dbo.audit_logs (
  id         UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
  created_at DATETIME2(3)     NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

IF COL_LENGTH('dbo.audit_logs', 'user_name') IS NULL
  ALTER TABLE dbo.audit_logs ADD user_name NVARCHAR(200) NULL;
GO
IF COL_LENGTH('dbo.audit_logs', 'action_category') IS NULL
  ALTER TABLE dbo.audit_logs ADD action_category NVARCHAR(60) NULL;
GO
IF COL_LENGTH('dbo.audit_logs', 'action_name') IS NULL
  ALTER TABLE dbo.audit_logs ADD action_name NVARCHAR(80) NULL;
GO
IF COL_LENGTH('dbo.audit_logs', 'target_module') IS NULL
  ALTER TABLE dbo.audit_logs ADD target_module NVARCHAR(80) NULL;
GO
IF COL_LENGTH('dbo.audit_logs', 'details') IS NULL
  ALTER TABLE dbo.audit_logs ADD details NVARCHAR(MAX) NULL;
GO
IF COL_LENGTH('dbo.audit_logs', 'store_id') IS NULL
  ALTER TABLE dbo.audit_logs ADD store_id NVARCHAR(80) NULL;
GO
IF COL_LENGTH('dbo.audit_logs', 'is_synced') IS NULL
  ALTER TABLE dbo.audit_logs ADD is_synced BIT NOT NULL DEFAULT 0;
GO
IF COL_LENGTH('dbo.audit_logs', 'sync_status') IS NULL
  ALTER TABLE dbo.audit_logs ADD sync_status NVARCHAR(20) NOT NULL DEFAULT N'pending';
GO
IF COL_LENGTH('dbo.audit_logs', 'updated_at') IS NULL
  ALTER TABLE dbo.audit_logs ADD updated_at DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME();
GO

/* The upload replays by id, so it must be unique even on a table that was
   created long ago without a primary key. */
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
   WHERE object_id = OBJECT_ID('dbo.audit_logs')
     AND (is_primary_key = 1 OR name = 'audit_logs_id_uidx')
)
  CREATE UNIQUE INDEX audit_logs_id_uidx ON dbo.audit_logs (id);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'audit_logs_created_idx'
                 AND object_id = OBJECT_ID('dbo.audit_logs'))
  CREATE INDEX audit_logs_created_idx ON dbo.audit_logs (created_at DESC);
GO

/* ---------------------------------- DOWN ----------------------------------
DROP INDEX audit_logs_created_idx ON dbo.audit_logs;
DROP INDEX audit_logs_id_uidx ON dbo.audit_logs;
ALTER TABLE dbo.audit_logs DROP COLUMN user_name, action_category, action_name,
  target_module, details, store_id, is_synced, sync_status, updated_at;
---------------------------------------------------------------------------- */
