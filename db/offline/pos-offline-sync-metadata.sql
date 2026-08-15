/*
  Sync bookkeeping for the local branch database (Microsoft SQL Server).

  Adds:
   * dbo.sync_metadata — one row per table, holding the high-water mark the
     puller resumes from and the last push outcome.
   * sync_attempts / last_error_at / row_version on every syncable table, so a
     restart does not forget how many times a row has already failed.

  Idempotent: safe to run on every app start.
*/

SET NOCOUNT ON;

IF OBJECT_ID('dbo.sync_metadata', 'U') IS NULL
CREATE TABLE dbo.sync_metadata (
  table_name     NVARCHAR(120) NOT NULL PRIMARY KEY,
  last_synced_at DATETIME2(3)  NULL,
  last_pushed_at DATETIME2(3)  NULL,
  rows_pushed    INT           NOT NULL DEFAULT 0,
  last_error     NVARCHAR(MAX) NULL,
  updated_at     DATETIME2(3)  NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

/* Per-row retry bookkeeping that survives an app restart. */
DECLARE @mt SYSNAME, @sqlMt NVARCHAR(MAX);
DECLARE metatbl CURSOR FOR
  SELECT name FROM sys.tables
   WHERE COL_LENGTH('dbo.' + name, 'is_synced') IS NOT NULL;
OPEN metatbl;
FETCH NEXT FROM metatbl INTO @mt;
WHILE @@FETCH_STATUS = 0
BEGIN
  IF COL_LENGTH('dbo.' + @mt, 'sync_attempts') IS NULL
  BEGIN
    SET @sqlMt = N'ALTER TABLE dbo.[' + @mt
      + N'] ADD [sync_attempts] INT NOT NULL CONSTRAINT [DF_' + @mt
      + N'_sync_attempts] DEFAULT 0;';
    EXEC sp_executesql @sqlMt;
  END
  IF COL_LENGTH('dbo.' + @mt, 'last_error_at') IS NULL
  BEGIN
    SET @sqlMt = N'ALTER TABLE dbo.[' + @mt + N'] ADD [last_error_at] DATETIME2(3) NULL;';
    EXEC sp_executesql @sqlMt;
  END
  IF COL_LENGTH('dbo.' + @mt, 'row_version') IS NULL
  BEGIN
    SET @sqlMt = N'ALTER TABLE dbo.[' + @mt
      + N'] ADD [row_version] INT NOT NULL CONSTRAINT [DF_' + @mt
      + N'_row_version] DEFAULT 0;';
    EXEC sp_executesql @sqlMt;
  END
  FETCH NEXT FROM metatbl INTO @mt;
END
CLOSE metatbl;
DEALLOCATE metatbl;
GO
