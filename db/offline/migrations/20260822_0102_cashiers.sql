/* ---------------------------------------------------------------------------
   20260822_0102_cashiers.sql   (LOCAL SHOP DATABASE — Microsoft SQL Server)

   Feature: Stage 1 — offline cashier sign-in (roster mirror).

   dbo.cashiers is the legacy roster the till still mirrors from head office.
   This adds the columns the offline sign-in list needs (role slug, permission
   blob, last sign-in stamp) plus sync bookkeeping, and makes the username
   unique so a replayed pull updates rather than duplicates a person.

   Required on every existing installation. Idempotent.
   Not applied automatically.
--------------------------------------------------------------------------- */

IF OBJECT_ID('dbo.cashiers', 'U') IS NULL
CREATE TABLE dbo.cashiers (
  id         UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
  username   NVARCHAR(120)    NOT NULL,
  full_name  NVARCHAR(200)    NULL,
  pin_hash   NVARCHAR(400)    NULL,
  store_id   NVARCHAR(80)     NULL,
  created_at DATETIME2(3)     NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

IF COL_LENGTH('dbo.cashiers', 'role_slug') IS NULL
  ALTER TABLE dbo.cashiers ADD role_slug NVARCHAR(60) NULL;
GO
IF COL_LENGTH('dbo.cashiers', 'permissions') IS NULL
  ALTER TABLE dbo.cashiers ADD permissions NVARCHAR(MAX) NOT NULL DEFAULT N'{}';
GO
IF COL_LENGTH('dbo.cashiers', 'is_active') IS NULL
  ALTER TABLE dbo.cashiers ADD is_active BIT NOT NULL DEFAULT 1;
GO
IF COL_LENGTH('dbo.cashiers', 'last_login_at') IS NULL
  ALTER TABLE dbo.cashiers ADD last_login_at DATETIME2(3) NULL;
GO
IF COL_LENGTH('dbo.cashiers', 'is_synced') IS NULL
  ALTER TABLE dbo.cashiers ADD is_synced BIT NOT NULL DEFAULT 1;
GO
IF COL_LENGTH('dbo.cashiers', 'sync_status') IS NULL
  ALTER TABLE dbo.cashiers ADD sync_status NVARCHAR(20) NOT NULL DEFAULT N'synced';
GO
IF COL_LENGTH('dbo.cashiers', 'updated_at') IS NULL
  ALTER TABLE dbo.cashiers ADD updated_at DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME();
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'cashiers_username_uidx'
                 AND object_id = OBJECT_ID('dbo.cashiers'))
BEGIN
  ;WITH ranked AS (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY LOWER(username)
                              ORDER BY updated_at DESC, created_at DESC) AS rn
      FROM dbo.cashiers
  )
  DELETE FROM dbo.cashiers WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

  CREATE UNIQUE INDEX cashiers_username_uidx ON dbo.cashiers (username);
END
GO

/* ---------------------------------- DOWN ----------------------------------
DROP INDEX cashiers_username_uidx ON dbo.cashiers;
ALTER TABLE dbo.cashiers DROP COLUMN role_slug, permissions, is_active,
  last_login_at, is_synced, sync_status, updated_at;
---------------------------------------------------------------------------- */
