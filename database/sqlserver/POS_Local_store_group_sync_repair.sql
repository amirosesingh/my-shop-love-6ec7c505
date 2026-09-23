/*
  POS_Local store-group synchronization repair

  Run this single file in Microsoft SQL Server Management Studio while
  connected to the SQL Server instance that hosts POS_Local.

  The script is transactional, re-runnable, and does not delete business data.
*/

USE [POS_Local];
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
  BEGIN TRANSACTION;

  IF OBJECT_ID(N'dbo.stores', N'U') IS NULL
    THROW 51100, 'POS_Local is missing dbo.stores. Run the complete POS_Local schema first.', 1;

  IF OBJECT_ID(N'dbo.store_groups', N'U') IS NULL
    THROW 51101, 'POS_Local is missing dbo.store_groups. Run the complete POS_Local schema first.', 1;

  /*
    0x434C4F5544 is the application's CLOUD change-tracking context. These
    repair rows satisfy local parent references and must not be uploaded as
    newly-authored local group changes. The next synchronization replaces
    their display fields with the authoritative Supabase rows.
  */
  WITH CHANGE_TRACKING_CONTEXT (0x434C4F5544)
  MERGE dbo.store_groups WITH (HOLDLOCK) AS target
  USING (
    SELECT
      source_group.id,
      source_group.code,
      source_group.name
    FROM (
      SELECT
        CAST(N'default' AS nvarchar(450)) AS id,
        CAST(N'DEFAULT' AS nvarchar(max)) AS code,
        CAST(N'Default group' AS nvarchar(max)) AS name
      UNION ALL
      SELECT DISTINCT
        CAST(LTRIM(RTRIM(store_row.group_id)) AS nvarchar(450)) AS id,
        CAST(LTRIM(RTRIM(store_row.group_id)) AS nvarchar(max)) AS code,
        CAST(LTRIM(RTRIM(store_row.group_id)) AS nvarchar(max)) AS name
      FROM dbo.stores AS store_row
      WHERE NULLIF(LTRIM(RTRIM(store_row.group_id)), N'') IS NOT NULL
        AND LTRIM(RTRIM(store_row.group_id)) <> N'default'
    ) AS source_group
  ) AS source
  ON target.id = source.id
  WHEN NOT MATCHED THEN
    INSERT (id, code, name, is_active, archived_at, created_at, updated_at)
    VALUES (source.id, source.code, source.name, 1, NULL, SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET());

  IF EXISTS (
    SELECT 1
    FROM dbo.stores AS store_row
    LEFT JOIN dbo.store_groups AS group_row ON group_row.id = store_row.group_id
    WHERE NULLIF(LTRIM(RTRIM(store_row.group_id)), N'') IS NOT NULL
      AND group_row.id IS NULL
  )
    THROW 51102, 'Some stores still reference a missing store group. The transaction was rolled back.', 1;

  IF NOT EXISTS (
    SELECT 1
    FROM sys.foreign_keys
    WHERE parent_object_id = OBJECT_ID(N'dbo.stores')
      AND name = N'FK_stores_group_id'
  )
    ALTER TABLE dbo.stores WITH CHECK
      ADD CONSTRAINT FK_stores_group_id
      FOREIGN KEY (group_id) REFERENCES dbo.store_groups(id);

  ALTER TABLE dbo.stores WITH CHECK CHECK CONSTRAINT FK_stores_group_id;

  COMMIT TRANSACTION;

  SELECT
    N'REPAIRED' AS status,
    (SELECT COUNT_BIG(*) FROM dbo.store_groups) AS local_store_groups,
    (SELECT COUNT_BIG(*) FROM dbo.stores WHERE group_id IS NOT NULL) AS stores_with_group;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
  THROW;
END CATCH;
GO
