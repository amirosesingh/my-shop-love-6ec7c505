/* ---------------------------------------------------------------------------
   20260822_0105_compare_indexes.sql  (LOCAL SHOP DATABASE — MS SQL Server)

   Feature: Stage 4 — Server vs. shop data comparison.

   The comparison page filters and orders every synced table by its newest
   change stamp. No column is added here; this only indexes the stamp each
   table already has (updated_at when present, otherwise created_at) so the
   comparison stays fast on a till with years of sales.

   Optional but recommended. Idempotent. Not applied automatically.
--------------------------------------------------------------------------- */

DECLARE @tables TABLE (name SYSNAME);
INSERT INTO @tables (name) VALUES
  (N'stores'), (N'membership_tiers'), (N'products'), (N'product_barcodes'),
  (N'product_categories'), (N'uom_units'), (N'members'), (N'promotions'),
  (N'pos_settings'), (N'suppliers'), (N'shifts'), (N'sales'), (N'sale_items'),
  (N'payment_transactions'), (N'item_activity_logs'), (N'purchase_orders'),
  (N'purchase_order_items'), (N'bookings'), (N'booking_payments'),
  (N'transfers'), (N'stock_transfers'), (N'stock_transfer_items'),
  (N'stock_adjustments'), (N'held_orders'), (N'audit_logs');

DECLARE @t SYSNAME, @col SYSNAME, @idx SYSNAME, @sql NVARCHAR(MAX);
DECLARE cur CURSOR LOCAL FAST_FORWARD FOR SELECT name FROM @tables;
OPEN cur;
FETCH NEXT FROM cur INTO @t;
WHILE @@FETCH_STATUS = 0
BEGIN
  IF OBJECT_ID(N'dbo.' + QUOTENAME(@t), 'U') IS NOT NULL
  BEGIN
    SET @col = CASE
      WHEN COL_LENGTH(N'dbo.' + QUOTENAME(@t), 'updated_at') IS NOT NULL THEN N'updated_at'
      WHEN COL_LENGTH(N'dbo.' + QUOTENAME(@t), 'created_at') IS NOT NULL THEN N'created_at'
      ELSE NULL END;

    IF @col IS NOT NULL
    BEGIN
      SET @idx = @t + N'_compare_stamp_idx';
      IF NOT EXISTS (SELECT 1 FROM sys.indexes
                      WHERE name = @idx AND object_id = OBJECT_ID(N'dbo.' + QUOTENAME(@t)))
      BEGIN
        SET @sql = N'CREATE INDEX ' + QUOTENAME(@idx) + N' ON dbo.' + QUOTENAME(@t)
                 + N' (' + QUOTENAME(@col) + N' DESC);';
        EXEC sp_executesql @sql;
      END
    END
  END
  FETCH NEXT FROM cur INTO @t;
END
CLOSE cur;
DEALLOCATE cur;
GO

/* ---------------------------------- DOWN ----------------------------------
   Drop each index named <table>_compare_stamp_idx, e.g.
DROP INDEX sales_compare_stamp_idx ON dbo.sales;
---------------------------------------------------------------------------- */
