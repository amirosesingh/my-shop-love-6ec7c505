/* =====================================================================
   Lucky Charms POS — offline database for Microsoft SQL Server
   ---------------------------------------------------------------------
   Run this once on the till PC (SQL Server 2019+ or SQL Server Express).

     sqlcmd -S localhost\SQLEXPRESS -E -i pos-offline-sqlserver.sql

   or open it in SQL Server Management Studio and press Execute.

   It creates the POS_LOCAL database, a dedicated login, every offline
   table with its sync bookkeeping columns, and the indexes the till uses.
   The script is idempotent: running it again changes nothing.

   After it finishes, open the POS and go to
   System & Settings -> Local Database, then enter:
     Server    localhost\SQLEXPRESS   (or your instance)
     Database  POS_LOCAL
     User      pos_local
     Password  the password set below (change it first!)
   Press "Test connection" — the settings are sealed on the machine, so
   nobody can read them back afterwards.
   ===================================================================== */

SET NOCOUNT ON;
GO

IF DB_ID('POS_LOCAL') IS NULL
  CREATE DATABASE POS_LOCAL;
GO

USE POS_LOCAL;
GO

/* ---- dedicated login (change the password before running) ---- */
DECLARE @pwd NVARCHAR(128) = N'ChangeMe_Str0ng!';
IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = N'pos_local')
  EXEC('CREATE LOGIN pos_local WITH PASSWORD = ''' + @pwd + ''', CHECK_POLICY = ON');
GO
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'pos_local')
  CREATE USER pos_local FOR LOGIN pos_local;
GO
ALTER ROLE db_datareader ADD MEMBER pos_local;
ALTER ROLE db_datawriter ADD MEMBER pos_local;
GO

/* ---- tables (identical to the shape the till syncs to the cloud) ---- */
SET NOCOUNT ON;

IF OBJECT_ID('dbo.sync_state', 'U') IS NULL
CREATE TABLE dbo.sync_state (
  [key]      NVARCHAR(60)  NOT NULL PRIMARY KEY,
  [value]    NVARCHAR(400) NULL,
  updated_at DATETIME2(3)  NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

IF OBJECT_ID('dbo.products', 'U') IS NULL
CREATE TABLE dbo.products (
  id               UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
  barcode          NVARCHAR(80)     NOT NULL DEFAULT N'',
  sku              NVARCHAR(80)     NULL,
  name             NVARCHAR(200)    NOT NULL DEFAULT N'',
  category         NVARCHAR(120)    NULL,
  cost_price       DECIMAL(18, 4)   NOT NULL DEFAULT 0,
  selling_price    DECIMAL(18, 4)   NOT NULL DEFAULT 0,
  ecom_price       DECIMAL(18, 4)   NULL,
  ecom_visible     BIT              NOT NULL DEFAULT 1,
  stock_by_store   NVARCHAR(MAX)    NOT NULL DEFAULT N'{}',
  reorder_level    INT              NOT NULL DEFAULT 0,
  tax_rate         DECIMAL(9, 4)    NOT NULL DEFAULT 0,
  custom_points    DECIMAL(18, 4)   NULL,
  point_multiplier DECIMAL(9, 4)    NOT NULL DEFAULT 1,
  is_synced        BIT              NOT NULL DEFAULT 0,
  sync_status      NVARCHAR(20)     NOT NULL DEFAULT N'pending',
  created_at       DATETIME2(3)     NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at       DATETIME2(3)     NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

IF OBJECT_ID('dbo.membership_tiers', 'U') IS NULL
CREATE TABLE dbo.membership_tiers (
  id                  UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
  name                NVARCHAR(60)     NOT NULL,
  discount_percentage DECIMAL(9, 4)    NOT NULL DEFAULT 0,
  points_multiplier   DECIMAL(9, 4)    NOT NULL DEFAULT 1,
  is_synced           BIT              NOT NULL DEFAULT 0,
  sync_status         NVARCHAR(20)     NOT NULL DEFAULT N'pending',
  created_at          DATETIME2(3)     NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at          DATETIME2(3)     NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

IF OBJECT_ID('dbo.members', 'U') IS NULL
CREATE TABLE dbo.members (
  id             UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
  member_code    NVARCHAR(40)     NOT NULL DEFAULT N'',
  full_name      NVARCHAR(160)    NOT NULL DEFAULT N'',
  phone          NVARCHAR(40)     NOT NULL DEFAULT N'',
  email          NVARCHAR(160)    NULL,
  address        NVARCHAR(400)    NULL,
  date_of_birth  DATE             NULL,
  tier_id        UNIQUEIDENTIFIER NULL,
  loyalty_points DECIMAL(18, 4)   NOT NULL DEFAULT 0,
  total_spent    DECIMAL(18, 4)   NOT NULL DEFAULT 0,
  is_synced      BIT              NOT NULL DEFAULT 0,
  sync_status    NVARCHAR(20)     NOT NULL DEFAULT N'pending',
  created_at     DATETIME2(3)     NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at     DATETIME2(3)     NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

IF OBJECT_ID('dbo.sales', 'U') IS NULL
CREATE TABLE dbo.sales (
  id                       UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
  bill_number              NVARCHAR(60)     NOT NULL,
  member_id                UNIQUEIDENTIFIER NULL,
  store_id                 NVARCHAR(60)     NULL,
  shift_id                 NVARCHAR(60)     NULL,
  cashier_name             NVARCHAR(120)    NULL,
  subtotal_amount          DECIMAL(18, 4)   NOT NULL DEFAULT 0,
  discount_amount          DECIMAL(18, 4)   NOT NULL DEFAULT 0,
  tax_amount               DECIMAL(18, 4)   NOT NULL DEFAULT 0,
  total_amount             DECIMAL(18, 4)   NOT NULL DEFAULT 0,
  paid_amount              DECIMAL(18, 4)   NOT NULL DEFAULT 0,
  change_amount            DECIMAL(18, 4)   NOT NULL DEFAULT 0,
  payment_type             NVARCHAR(30)     NOT NULL DEFAULT N'cash',
  points_earned            DECIMAL(18, 4)   NOT NULL DEFAULT 0,
  points_redeemed          DECIMAL(18, 4)   NOT NULL DEFAULT 0,
  is_exchange              BIT              NOT NULL DEFAULT 0,
  original_bill_number     NVARCHAR(60)     NULL,
  exchanged_to_bill_number NVARCHAR(60)     NULL,
  exchange_credit          DECIMAL(18, 4)   NOT NULL DEFAULT 0,
  is_refunded              BIT              NOT NULL DEFAULT 0,
  is_synced                BIT              NOT NULL DEFAULT 0,
  sync_status              NVARCHAR(20)     NOT NULL DEFAULT N'pending',
  created_at               DATETIME2(3)     NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at               DATETIME2(3)     NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

IF OBJECT_ID('dbo.sale_items', 'U') IS NULL
CREATE TABLE dbo.sale_items (
  id               UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
  sale_id          UNIQUEIDENTIFIER NOT NULL,
  product_id       UNIQUEIDENTIFIER NULL,
  product_name     NVARCHAR(200)    NOT NULL DEFAULT N'',
  unit_price       DECIMAL(18, 4)   NOT NULL DEFAULT 0,
  quantity         INT              NOT NULL DEFAULT 1,
  discount_percent DECIMAL(9, 4)    NOT NULL DEFAULT 0,
  discount_amount  DECIMAL(18, 4)   NOT NULL DEFAULT 0,
  tax_rate         DECIMAL(9, 4)    NOT NULL DEFAULT 0,
  is_return        BIT              NOT NULL DEFAULT 0,
  is_foc           BIT              NOT NULL DEFAULT 0,
  promo_id         NVARCHAR(60)     NULL,
  is_synced        BIT              NOT NULL DEFAULT 0,
  sync_status      NVARCHAR(20)     NOT NULL DEFAULT N'pending',
  created_at       DATETIME2(3)     NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at       DATETIME2(3)     NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

IF OBJECT_ID('dbo.purchase_orders', 'U') IS NULL
CREATE TABLE dbo.purchase_orders (
  id                UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
  po_number         NVARCHAR(60)     NOT NULL,
  supplier_name     NVARCHAR(160)    NULL,
  operator_name     NVARCHAR(120)    NULL,
  total_cost        DECIMAL(18, 4)   NOT NULL DEFAULT 0,
  total_items_count INT              NOT NULL DEFAULT 0,
  is_synced         BIT              NOT NULL DEFAULT 0,
  sync_status       NVARCHAR(20)     NOT NULL DEFAULT N'pending',
  created_at        DATETIME2(3)     NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at        DATETIME2(3)     NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

IF OBJECT_ID('dbo.purchase_order_items', 'U') IS NULL
CREATE TABLE dbo.purchase_order_items (
  id                UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
  po_id             UNIQUEIDENTIFIER NOT NULL,
  product_id        UNIQUEIDENTIFIER NULL,
  barcode           NVARCHAR(80)     NULL,
  product_name      NVARCHAR(200)    NULL,
  cost_price        DECIMAL(18, 4)   NOT NULL DEFAULT 0,
  selling_price     DECIMAL(18, 4)   NOT NULL DEFAULT 0,
  quantity_received INT              NOT NULL DEFAULT 0,
  subtotal_cost     DECIMAL(18, 4)   NOT NULL DEFAULT 0,
  is_synced         BIT              NOT NULL DEFAULT 0,
  sync_status       NVARCHAR(20)     NOT NULL DEFAULT N'pending',
  created_at        DATETIME2(3)     NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at        DATETIME2(3)     NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

IF OBJECT_ID('dbo.promotions', 'U') IS NULL
CREATE TABLE dbo.promotions (
  id                UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
  title             NVARCHAR(160)    NOT NULL,
  promo_type        NVARCHAR(30)     NOT NULL,
  min_spend         DECIMAL(18, 4)   NOT NULL DEFAULT 0,
  discount_percent  DECIMAL(9, 4)    NOT NULL DEFAULT 0,
  discount_amount   DECIMAL(18, 4)   NOT NULL DEFAULT 0,
  foc_product_id    UNIQUEIDENTIFIER NULL,
  points_per_dollar DECIMAL(9, 4)    NOT NULL DEFAULT 1,
  tier_rates        NVARCHAR(MAX)    NULL,
  is_active         BIT              NOT NULL DEFAULT 1,
  start_date        DATE             NULL,
  end_date          DATE             NULL,
  is_synced         BIT              NOT NULL DEFAULT 0,
  sync_status       NVARCHAR(20)     NOT NULL DEFAULT N'pending',
  created_at        DATETIME2(3)     NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at        DATETIME2(3)     NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

IF OBJECT_ID('dbo.shifts', 'U') IS NULL
CREATE TABLE dbo.shifts (
  id            UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
  store_id      NVARCHAR(60)     NULL,
  cashier_name  NVARCHAR(120)    NULL,
  opened_at     DATETIME2(3)     NULL,
  closed_at     DATETIME2(3)     NULL,
  opening_float DECIMAL(18, 4)   NOT NULL DEFAULT 0,
  counted_cash  DECIMAL(18, 4)   NULL,
  note          NVARCHAR(400)    NULL,
  is_synced     BIT              NOT NULL DEFAULT 0,
  sync_status   NVARCHAR(20)     NOT NULL DEFAULT N'pending',
  created_at    DATETIME2(3)     NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at    DATETIME2(3)     NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

IF OBJECT_ID('dbo.bookings', 'U') IS NULL
CREATE TABLE dbo.bookings (
  id             UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
  booking_ref    NVARCHAR(60)     NOT NULL,
  store_id       NVARCHAR(60)     NULL,
  shift_id       NVARCHAR(60)     NULL,
  member_id      UNIQUEIDENTIFIER NULL,
  customer_name  NVARCHAR(160)    NULL,
  customer_phone NVARCHAR(40)     NULL,
  lines          NVARCHAR(MAX)    NOT NULL DEFAULT N'[]',
  subtotal       DECIMAL(18, 4)   NOT NULL DEFAULT 0,
  discount       DECIMAL(18, 4)   NOT NULL DEFAULT 0,
  tax            DECIMAL(18, 4)   NOT NULL DEFAULT 0,
  total          DECIMAL(18, 4)   NOT NULL DEFAULT 0,
  paid           DECIMAL(18, 4)   NOT NULL DEFAULT 0,
  due_date       DATE             NULL,
  status         NVARCHAR(20)     NOT NULL DEFAULT N'active',
  note           NVARCHAR(400)    NULL,
  cashier_name   NVARCHAR(120)    NULL,
  is_synced      BIT              NOT NULL DEFAULT 0,
  sync_status    NVARCHAR(20)     NOT NULL DEFAULT N'pending',
  created_at     DATETIME2(3)     NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at     DATETIME2(3)     NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

IF OBJECT_ID('dbo.booking_payments', 'U') IS NULL
CREATE TABLE dbo.booking_payments (
  id           UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
  booking_id   UNIQUEIDENTIFIER NOT NULL,
  amount       DECIMAL(18, 4)   NOT NULL DEFAULT 0,
  method       NVARCHAR(30)     NOT NULL DEFAULT N'cash',
  cashier_name NVARCHAR(120)    NULL,
  paid_at      DATETIME2(3)     NOT NULL DEFAULT SYSUTCDATETIME(),
  is_synced    BIT              NOT NULL DEFAULT 0,
  sync_status  NVARCHAR(20)     NOT NULL DEFAULT N'pending',
  created_at   DATETIME2(3)     NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at   DATETIME2(3)     NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

IF OBJECT_ID('dbo.transfers', 'U') IS NULL
CREATE TABLE dbo.transfers (
  id            UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
  transfer_ref  NVARCHAR(60)     NOT NULL,
  kind          NVARCHAR(20)     NOT NULL DEFAULT N'transfer',
  from_store_id NVARCHAR(60)     NULL,
  to_store_id   NVARCHAR(60)     NULL,
  items         NVARCHAR(MAX)    NOT NULL DEFAULT N'[]',
  status        NVARCHAR(20)     NOT NULL DEFAULT N'requested',
  note          NVARCHAR(400)    NULL,
  created_by    NVARCHAR(120)    NULL,
  is_synced     BIT              NOT NULL DEFAULT 0,
  sync_status   NVARCHAR(20)     NOT NULL DEFAULT N'pending',
  created_at    DATETIME2(3)     NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at    DATETIME2(3)     NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

IF OBJECT_ID('dbo.audit_logs', 'U') IS NULL
CREATE TABLE dbo.audit_logs (
  id              UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
  user_name       NVARCHAR(120)    NULL,
  action_category NVARCHAR(80)     NOT NULL,
  action_name     NVARCHAR(160)    NOT NULL,
  target_module   NVARCHAR(80)     NULL,
  details         NVARCHAR(MAX)    NULL,
  is_synced       BIT              NOT NULL DEFAULT 0,
  sync_status     NVARCHAR(20)     NOT NULL DEFAULT N'pending',
  created_at      DATETIME2(3)     NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at      DATETIME2(3)     NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

/* pos_settings is a single row (id = 1 in the cloud); locally it keeps a
   deterministic GUID so the upsert always targets the same record. */
IF OBJECT_ID('dbo.pos_settings', 'U') IS NULL
CREATE TABLE dbo.pos_settings (
  id                UNIQUEIDENTIFIER NOT NULL PRIMARY KEY
                    DEFAULT '00000000-0000-0000-0000-000000000001',
  payload           NVARCHAR(MAX)    NOT NULL DEFAULT N'{}',
  is_synced         BIT              NOT NULL DEFAULT 0,
  sync_status       NVARCHAR(20)     NOT NULL DEFAULT N'pending',
  created_at        DATETIME2(3)     NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at        DATETIME2(3)     NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

/* Push queries scan by sync flag then age — one index per table covers it. */
DECLARE @t SYSNAME, @sql NVARCHAR(MAX);
DECLARE tables CURSOR FOR
  SELECT name FROM sys.tables
   WHERE name IN ('products','membership_tiers','members','sales','sale_items',
                  'purchase_orders','purchase_order_items','promotions','shifts',
                  'bookings','booking_payments','transfers','audit_logs','pos_settings');
OPEN tables;
FETCH NEXT FROM tables INTO @t;
WHILE @@FETCH_STATUS = 0
BEGIN
  IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_' + @t + N'_sync'
                   AND object_id = OBJECT_ID('dbo.' + @t))
  BEGIN
    SET @sql = N'CREATE INDEX IX_' + @t + N'_sync ON dbo.' + QUOTENAME(@t)
             + N' (is_synced, created_at)';
    EXEC sp_executesql @sql;
  END

  /* Any edit re-queues the row for the cloud. */
  IF NOT EXISTS (SELECT 1 FROM sys.triggers WHERE name = N'TR_' + @t + N'_touch')
  BEGIN
    SET @sql = N'CREATE TRIGGER dbo.TR_' + @t + N'_touch ON dbo.' + QUOTENAME(@t)
      + N' AFTER UPDATE AS BEGIN
            SET NOCOUNT ON;
            IF UPDATE(is_synced) AND NOT UPDATE(updated_at) RETURN;
            UPDATE t SET updated_at = SYSUTCDATETIME()
              FROM dbo.' + QUOTENAME(@t) + N' t JOIN inserted i ON i.id = t.id;
          END';
    EXEC sp_executesql @sql;
  END

  FETCH NEXT FROM tables INTO @t;
END
CLOSE tables;
DEALLOCATE tables;
GO

/* ------------------------------------------------------------------
   Branch identity — this till belongs to exactly one branch, and every
   locally-created sale carries that id so the central server can tell
   the stores apart after a push.
   ------------------------------------------------------------------ */
IF COL_LENGTH('dbo.sales', 'branch_id') IS NULL
  ALTER TABLE dbo.sales ADD branch_id NVARCHAR(60) NULL;
GO

IF COL_LENGTH('dbo.sale_items', 'branch_id') IS NULL
  ALTER TABLE dbo.sale_items ADD branch_id NVARCHAR(60) NULL;
GO

IF COL_LENGTH('dbo.sale_items', 'unit_cost') IS NULL
  ALTER TABLE dbo.sale_items ADD unit_cost DECIMAL(18, 4) NOT NULL DEFAULT 0;
GO

/* Friendly branch-facing names used by the offline checkout path.
   Single-table views, so INSERT/UPDATE flow straight through. */
IF OBJECT_ID('dbo.BranchSales', 'V') IS NOT NULL DROP VIEW dbo.BranchSales;
GO
CREATE VIEW dbo.BranchSales AS SELECT * FROM dbo.sales;
GO

IF OBJECT_ID('dbo.BranchSaleItems', 'V') IS NOT NULL DROP VIEW dbo.BranchSaleItems;
GO
CREATE VIEW dbo.BranchSaleItems AS SELECT * FROM dbo.sale_items;
GO
/* ---- day-end shift summaries queued for the manager's phone ---- */
IF OBJECT_ID('dbo.shift_notifications', 'U') IS NULL
CREATE TABLE dbo.shift_notifications (
  id                UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
  shift_id          NVARCHAR(80)     NOT NULL,
  store_id          NVARCHAR(80)     NOT NULL,
  store_name        NVARCHAR(200)    NULL,
  terminal_id       NVARCHAR(120)    NULL,
  terminal_name     NVARCHAR(200)    NULL,
  closed_by         NVARCHAR(200)    NULL,
  opened_at         DATETIME2(3)     NULL,
  closed_at         DATETIME2(3)     NOT NULL DEFAULT SYSUTCDATETIME(),
  total_sales       DECIMAL(18, 4)   NOT NULL DEFAULT 0,
  transactions      INT              NOT NULL DEFAULT 0,
  discounts         DECIMAL(18, 4)   NOT NULL DEFAULT 0,
  refunds           DECIMAL(18, 4)   NOT NULL DEFAULT 0,
  expected_cash     DECIMAL(18, 4)   NOT NULL DEFAULT 0,
  counted_cash      DECIMAL(18, 4)   NOT NULL DEFAULT 0,
  payment_breakdown NVARCHAR(MAX)    NOT NULL DEFAULT N'{}',
  summary           NVARCHAR(MAX)    NOT NULL DEFAULT N'',
  is_synced         BIT              NOT NULL DEFAULT 0,
  sync_status       NVARCHAR(20)     NOT NULL DEFAULT N'pending',
  created_at        DATETIME2(3)     NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at        DATETIME2(3)     NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

/* ---- verification ---- */
SELECT name AS created_table FROM sys.tables ORDER BY name;
GO
