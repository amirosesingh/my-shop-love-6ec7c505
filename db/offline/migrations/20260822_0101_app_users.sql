/* ---------------------------------------------------------------------------
   20260822_0101_app_users.sql   (LOCAL SHOP DATABASE — Microsoft SQL Server)

   Feature: Stage 1 — offline cashier sign-in.

   Brings an older till's dbo.app_users in line with what the offline login
   needs: a locally stored PBKDF2 verifier (pin_hash), the PIN length, the last
   sign-in stamp, the role slug and permission blob mirrored from head office,
   the branch the person belongs to, and the sync bookkeeping columns the sync
   worker and the server/shop comparison read.

   Required on every existing installation. Safe to run repeatedly: every
   statement is guarded, and every added column is nullable or has a default so
   existing rows are untouched.

   Not applied automatically — run it by hand against the shop database.
--------------------------------------------------------------------------- */

IF OBJECT_ID('dbo.app_users', 'U') IS NULL
CREATE TABLE dbo.app_users (
  id            UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
  user_id       NVARCHAR(120)    NOT NULL,
  full_name     NVARCHAR(200)    NULL,
  email         NVARCHAR(200)    NULL,
  role          NVARCHAR(60)     NULL,
  created_at    DATETIME2(3)     NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

IF COL_LENGTH('dbo.app_users', 'role_slug') IS NULL
  ALTER TABLE dbo.app_users ADD role_slug NVARCHAR(60) NULL;
GO
IF COL_LENGTH('dbo.app_users', 'store_id') IS NULL
  ALTER TABLE dbo.app_users ADD store_id NVARCHAR(80) NULL;
GO
IF COL_LENGTH('dbo.app_users', 'is_active') IS NULL
  ALTER TABLE dbo.app_users ADD is_active BIT NOT NULL DEFAULT 1;
GO
IF COL_LENGTH('dbo.app_users', 'permissions') IS NULL
  ALTER TABLE dbo.app_users ADD permissions NVARCHAR(MAX) NOT NULL DEFAULT N'{}';
GO
IF COL_LENGTH('dbo.app_users', 'pin_hash') IS NULL
  ALTER TABLE dbo.app_users ADD pin_hash NVARCHAR(400) NULL;
GO
IF COL_LENGTH('dbo.app_users', 'pin_length') IS NULL
  ALTER TABLE dbo.app_users ADD pin_length SMALLINT NULL;
GO
IF COL_LENGTH('dbo.app_users', 'last_login_at') IS NULL
  ALTER TABLE dbo.app_users ADD last_login_at DATETIME2(3) NULL;
GO
IF COL_LENGTH('dbo.app_users', 'is_synced') IS NULL
  ALTER TABLE dbo.app_users ADD is_synced BIT NOT NULL DEFAULT 1;
GO
IF COL_LENGTH('dbo.app_users', 'sync_status') IS NULL
  ALTER TABLE dbo.app_users ADD sync_status NVARCHAR(20) NOT NULL DEFAULT N'synced';
GO
IF COL_LENGTH('dbo.app_users', 'row_version') IS NULL
  ALTER TABLE dbo.app_users ADD row_version INT NOT NULL DEFAULT 1;
GO
IF COL_LENGTH('dbo.app_users', 'updated_at') IS NULL
  ALTER TABLE dbo.app_users ADD updated_at DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME();
GO

/* One row per person. Older mirrors could hold duplicates from a replayed
   pull; keep the most recently updated row before the unique index goes on. */
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'app_users_user_id_uidx'
                 AND object_id = OBJECT_ID('dbo.app_users'))
BEGIN
  ;WITH ranked AS (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY LOWER(user_id)
                              ORDER BY updated_at DESC, created_at DESC) AS rn
      FROM dbo.app_users
  )
  DELETE FROM dbo.app_users WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

  CREATE UNIQUE INDEX app_users_user_id_uidx ON dbo.app_users (user_id);
END
GO

/* ---------------------------------- DOWN ----------------------------------
DROP INDEX app_users_user_id_uidx ON dbo.app_users;
ALTER TABLE dbo.app_users DROP COLUMN role_slug, store_id, is_active, permissions,
  pin_hash, pin_length, last_login_at, is_synced, sync_status, row_version, updated_at;
---------------------------------------------------------------------------- */
