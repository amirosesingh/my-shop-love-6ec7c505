/* ---------------------------------------------------------------------------
   20260822_0103_staff_roles.sql   (LOCAL SHOP DATABASE — Microsoft SQL Server)

   Feature: Stage 1 — offline cashier sign-in (permissions while offline).

   Without a mirrored role table an offline sign-in has no permissions to apply,
   so the till would either lock everything or, worse, allow everything. This
   creates dbo.staff_roles if it is missing and tops up the columns the
   permission resolver reads.

   Required on every existing installation. Idempotent.
   Not applied automatically.
--------------------------------------------------------------------------- */

IF OBJECT_ID('dbo.staff_roles', 'U') IS NULL
CREATE TABLE dbo.staff_roles (
  slug        NVARCHAR(60)  NOT NULL PRIMARY KEY,
  name        NVARCHAR(120) NOT NULL,
  base_level  NVARCHAR(40)  NULL,
  permissions NVARCHAR(MAX) NOT NULL DEFAULT N'{}',
  is_core     BIT           NOT NULL DEFAULT 0,
  created_at  DATETIME2(3)  NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at  DATETIME2(3)  NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

IF COL_LENGTH('dbo.staff_roles', 'base_level') IS NULL
  ALTER TABLE dbo.staff_roles ADD base_level NVARCHAR(40) NULL;
GO
IF COL_LENGTH('dbo.staff_roles', 'permissions') IS NULL
  ALTER TABLE dbo.staff_roles ADD permissions NVARCHAR(MAX) NOT NULL DEFAULT N'{}';
GO
IF COL_LENGTH('dbo.staff_roles', 'is_core') IS NULL
  ALTER TABLE dbo.staff_roles ADD is_core BIT NOT NULL DEFAULT 0;
GO
IF COL_LENGTH('dbo.staff_roles', 'created_at') IS NULL
  ALTER TABLE dbo.staff_roles ADD created_at DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME();
GO
IF COL_LENGTH('dbo.staff_roles', 'updated_at') IS NULL
  ALTER TABLE dbo.staff_roles ADD updated_at DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME();
GO

/* ---------------------------------- DOWN ----------------------------------
DROP TABLE dbo.staff_roles;   -- only if this file created it
---------------------------------------------------------------------------- */
