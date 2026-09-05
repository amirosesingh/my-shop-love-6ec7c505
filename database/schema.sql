/*
  Local POS database for the Windows till.

  Every table mirrors its cloud counterpart column-for-column and adds the
  standard sync block, so a pending row can be batch-upserted straight into
  Supabase with no field mapping.

  Idempotent: safe to run on every app start.
*/

SET NOCOUNT ON;

IF OBJECT_ID('dbo.sync_state', 'U') IS NULL
CREATE TABLE dbo.sync_state (
  [key]      NVARCHAR(60)  NOT NULL PRIMARY KEY,
  [value]    NVARCHAR(400) NULL,
  updated_at DATETIME2(3)  NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

/*
  Device settings that must live in the branch database rather than browser
  storage: the terminal activation token, the branch it is bound to and the
  local database connection details.
*/
IF OBJECT_ID('dbo.system_settings', 'U') IS NULL
CREATE TABLE dbo.system_settings (
  [key]      NVARCHAR(120)  NOT NULL PRIMARY KEY,
  [value]    NVARCHAR(MAX)  NULL,
  updated_at DATETIME2(3)   NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

IF OBJECT_ID('dbo.stores', 'U') IS NULL
CREATE TABLE dbo.stores (
  id             UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
  code           NVARCHAR(80)     NOT NULL DEFAULT N'',
  name           NVARCHAR(200)    NOT NULL DEFAULT N'',
  address        NVARCHAR(400)    NULL,
  phone          NVARCHAR(40)     NULL,
  group_id       NVARCHAR(80)     NOT NULL DEFAULT N'default',
  receipt_prefix NVARCHAR(30)     NULL,
  is_synced      BIT              NOT NULL DEFAULT 1,
  sync_status    NVARCHAR(20)     NOT NULL DEFAULT N'synced',
  created_at     DATETIME2(3)     NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at     DATETIME2(3)     NOT NULL DEFAULT SYSUTCDATETIME()
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

IF COL_LENGTH('dbo.products', 'sub_category') IS NULL ALTER TABLE dbo.products ADD sub_category NVARCHAR(120) NULL;
IF COL_LENGTH('dbo.products', 'unit') IS NULL ALTER TABLE dbo.products ADD unit NVARCHAR(30) NULL;
IF COL_LENGTH('dbo.products', 'packs') IS NULL ALTER TABLE dbo.products ADD packs NVARCHAR(MAX) NULL;
IF COL_LENGTH('dbo.products', 'barcode_aliases') IS NULL ALTER TABLE dbo.products ADD barcode_aliases NVARCHAR(MAX) NULL;
IF COL_LENGTH('dbo.products', 'is_archived') IS NULL ALTER TABLE dbo.products ADD is_archived BIT NOT NULL DEFAULT 0;
IF COL_LENGTH('dbo.products', 'archived_at') IS NULL ALTER TABLE dbo.products ADD archived_at DATETIME2(3) NULL;
IF COL_LENGTH('dbo.products', 'stock_quantity') IS NULL ALTER TABLE dbo.products ADD stock_quantity INT NOT NULL DEFAULT 0;
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
  [reference]       NVARCHAR(60)     NULL,
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

/* ---- controlled shift closing: state, immutable counts and audit ---- */
IF OBJECT_ID('dbo.shifts', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.shifts', 'state') IS NULL ALTER TABLE dbo.shifts ADD [state] NVARCHAR(40) DEFAULT N'ACTIVE';
  IF COL_LENGTH('dbo.shifts', 'close_reason') IS NULL ALTER TABLE dbo.shifts ADD [close_reason] NVARCHAR(400);
  IF COL_LENGTH('dbo.shifts', 'closing_started_at') IS NULL ALTER TABLE dbo.shifts ADD [closing_started_at] DATETIME2(3);
  IF COL_LENGTH('dbo.shifts', 'closing_started_by') IS NULL ALTER TABLE dbo.shifts ADD [closing_started_by] NVARCHAR(200);
  IF COL_LENGTH('dbo.shifts', 'final_counted_cash') IS NULL ALTER TABLE dbo.shifts ADD [final_counted_cash] DECIMAL(18,4);
  IF COL_LENGTH('dbo.shifts', 'variance_status') IS NULL ALTER TABLE dbo.shifts ADD [variance_status] NVARCHAR(40);
END
GO

IF OBJECT_ID('dbo.shift_cash_counts', 'U') IS NULL
CREATE TABLE dbo.shift_cash_counts (
  id                  UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
  shift_id            NVARCHAR(80)     NOT NULL,
  store_id            NVARCHAR(60)     NULL,
  terminal_id         NVARCHAR(120)    NULL,
  kind                NVARCHAR(20)     NOT NULL DEFAULT N'ORIGINAL',
  counted_cash        DECIMAL(18,4)    NOT NULL DEFAULT 0,
  counted_card        DECIMAL(18,4)    NULL,
  counted_digital     DECIMAL(18,4)    NULL,
  reason              NVARCHAR(400)    NULL,
  counted_by_name     NVARCHAR(200)    NULL,
  counted_by_staff_id NVARCHAR(120)    NULL,
  client_key          NVARCHAR(160)    NULL,
  is_synced           BIT              NOT NULL DEFAULT 0,
  sync_status         NVARCHAR(20)     NOT NULL DEFAULT N'pending',
  created_at          DATETIME2(3)     NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at          DATETIME2(3)     NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

IF OBJECT_ID('dbo.shift_close_events', 'U') IS NULL
CREATE TABLE dbo.shift_close_events (
  id           UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
  shift_id     NVARCHAR(80)     NOT NULL,
  store_id     NVARCHAR(60)     NULL,
  terminal_id  NVARCHAR(120)    NULL,
  event        NVARCHAR(60)     NOT NULL,
  from_state   NVARCHAR(40)     NULL,
  to_state     NVARCHAR(40)     NULL,
  detail       NVARCHAR(MAX)    NULL,
  actor_name   NVARCHAR(200)    NULL,
  actor_staff_id NVARCHAR(120)  NULL,
  is_synced    BIT              NOT NULL DEFAULT 0,
  sync_status  NVARCHAR(20)     NOT NULL DEFAULT N'pending',
  created_at   DATETIME2(3)     NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

/* Offline close: a count taken with no connection is kept here until the
   central routine has recomputed the authoritative variance. */
IF OBJECT_ID('dbo.shift_cash_counts', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.shift_cash_counts', 'reconcile_state') IS NULL
    ALTER TABLE dbo.shift_cash_counts ADD [reconcile_state] NVARCHAR(20) NOT NULL DEFAULT N'pending';
END
GO

IF OBJECT_ID('dbo.shift_reconciliations', 'U') IS NULL
CREATE TABLE dbo.shift_reconciliations (
  id                UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
  shift_id          NVARCHAR(80)     NOT NULL,
  store_id          NVARCHAR(60)     NULL,
  count_id          NVARCHAR(80)     NULL,
  expected_cash     DECIMAL(18,4)    NOT NULL DEFAULT 0,
  expected_card     DECIMAL(18,4)    NULL,
  expected_digital  DECIMAL(18,4)    NULL,
  counted_cash      DECIMAL(18,4)    NOT NULL DEFAULT 0,
  counted_card      DECIMAL(18,4)    NULL,
  counted_digital   DECIMAL(18,4)    NULL,
  variance_cash     DECIMAL(18,4)    NOT NULL DEFAULT 0,
  variance_card     DECIMAL(18,4)    NULL,
  variance_digital  DECIMAL(18,4)    NULL,
  variance_total    DECIMAL(18,4)    NOT NULL DEFAULT 0,
  variance_status   NVARCHAR(40)     NULL,
  is_synced         BIT              NOT NULL DEFAULT 0,
  sync_status       NVARCHAR(20)     NOT NULL DEFAULT N'pending',
  created_at        DATETIME2(3)     NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

IF OBJECT_ID('dbo.shift_variance_alerts', 'U') IS NULL
CREATE TABLE dbo.shift_variance_alerts (
  id                 UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
  shift_id           NVARCHAR(80)     NOT NULL,
  store_id           NVARCHAR(60)     NULL,
  reconciliation_id  NVARCHAR(80)     NULL,
  variance_total     DECIMAL(18,4)    NOT NULL DEFAULT 0,
  variance_status    NVARCHAR(40)     NULL,
  severity           NVARCHAR(40)     NULL,
  message            NVARCHAR(MAX)    NULL,
  delivery_status    NVARCHAR(40)     NULL,
  attempts           INT              NOT NULL DEFAULT 0,
  last_error         NVARCHAR(MAX)    NULL,
  last_attempt_at    DATETIME2(3)     NULL,
  acknowledged_at    DATETIME2(3)     NULL,
  acknowledged_by    NVARCHAR(200)    NULL,
  is_synced          BIT              NOT NULL DEFAULT 0,
  sync_status        NVARCHAR(20)     NOT NULL DEFAULT N'pending',
  created_at         DATETIME2(3)     NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at         DATETIME2(3)     NOT NULL DEFAULT SYSUTCDATETIME()
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

IF OBJECT_ID('dbo.stock_transfers', 'U') IS NULL
CREATE TABLE dbo.stock_transfers (
  id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(), ref NVARCHAR(80) NOT NULL,
  kind NVARCHAR(20) NOT NULL DEFAULT N'transfer', transfer_scope NVARCHAR(30) NOT NULL DEFAULT N'INTRA_GROUP',
  from_store_id NVARCHAR(60) NOT NULL, from_store_name NVARCHAR(200) NULL, from_group_id NVARCHAR(80) NULL,
  to_store_id NVARCHAR(60) NOT NULL, to_store_name NVARCHAR(200) NULL, to_group_id NVARCHAR(80) NULL,
  status NVARCHAR(30) NOT NULL DEFAULT N'pending', note NVARCHAR(400) NOT NULL DEFAULT N'',
  created_by NVARCHAR(120) NULL, approved_by NVARCHAR(120) NULL, approved_at DATETIME2(3) NULL,
  dispatched_by NVARCHAR(120) NULL, dispatched_at DATETIME2(3) NULL,
  received_by NVARCHAR(120) NULL, received_at DATETIME2(3) NULL, rejected_reason NVARCHAR(400) NULL,
  verified_by NVARCHAR(120) NULL, verified_at DATETIME2(3) NULL, posted_at DATETIME2(3) NULL,
  discrepancy_reason NVARCHAR(400) NULL,
  rejected_by NVARCHAR(120) NULL, cancelled_reason NVARCHAR(400) NULL,
  closed_at DATETIME2(3) NULL, fulfilment NVARCHAR(20) NULL,
  is_synced BIT NOT NULL DEFAULT 0, sync_status NVARCHAR(20) NOT NULL DEFAULT N'pending',
  created_at DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(), updated_at DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

IF OBJECT_ID('dbo.stock_transfer_items', 'U') IS NULL
CREATE TABLE dbo.stock_transfer_items (
  id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(), transfer_id UNIQUEIDENTIFIER NOT NULL,
  product_id UNIQUEIDENTIFIER NULL, barcode NVARCHAR(80) NULL, sku NVARCHAR(80) NULL,
  product_name NVARCHAR(200) NULL, quantity INT NOT NULL DEFAULT 0,
  quantity_approved INT NULL, quantity_dispatched INT NULL, quantity_received INT NOT NULL DEFAULT 0,
  quantity_verified INT NULL,
  unit_cost DECIMAL(18,4) NOT NULL DEFAULT 0, is_synced BIT NOT NULL DEFAULT 0,
  sync_status NVARCHAR(20) NOT NULL DEFAULT N'pending', created_at DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

/* Suppliers back the purchasing screens; the cloud is authoritative for them,
   but a till must still be able to raise an invoice while the line is down. */
IF OBJECT_ID('dbo.suppliers', 'U') IS NULL
CREATE TABLE dbo.suppliers (
  id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(), name NVARCHAR(200) NOT NULL,
  contact_name NVARCHAR(200) NULL, phone NVARCHAR(60) NULL, email NVARCHAR(200) NULL,
  address NVARCHAR(400) NULL, tax_number NVARCHAR(80) NULL, notes NVARCHAR(MAX) NULL,
  is_active BIT NOT NULL DEFAULT 1,
  is_synced BIT NOT NULL DEFAULT 0, sync_status NVARCHAR(20) NOT NULL DEFAULT N'pending',
  created_at DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(), updated_at DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

/* Stock corrections raised at the till: damages, counts, write-offs. */
IF OBJECT_ID('dbo.stock_adjustments', 'U') IS NULL
CREATE TABLE dbo.stock_adjustments (
  id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(), product_id UNIQUEIDENTIFIER NULL,
  product_name NVARCHAR(200) NULL, sku NVARCHAR(80) NULL, barcode NVARCHAR(80) NULL,
  store_id NVARCHAR(60) NULL, terminal_id NVARCHAR(80) NULL,
  reason NVARCHAR(80) NOT NULL DEFAULT N'adjustment', note NVARCHAR(400) NOT NULL DEFAULT N'',
  previous_stock INT NOT NULL DEFAULT 0, updated_stock INT NOT NULL DEFAULT 0,
  delta INT NOT NULL DEFAULT 0, cost_impact DECIMAL(18,4) NOT NULL DEFAULT 0,
  staff_id NVARCHAR(80) NULL, staff_name NVARCHAR(200) NULL, role NVARCHAR(60) NULL,
  is_synced BIT NOT NULL DEFAULT 0, sync_status NVARCHAR(20) NOT NULL DEFAULT N'pending',
  created_at DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(), updated_at DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

/* Parked tickets. The id is the app's own string key, not a GUID. */
IF OBJECT_ID('dbo.held_orders', 'U') IS NULL
CREATE TABLE dbo.held_orders (
  id NVARCHAR(80) NOT NULL PRIMARY KEY, label NVARCHAR(200) NOT NULL DEFAULT N'',
  store_id NVARCHAR(60) NULL, shift_id NVARCHAR(80) NULL, held_by NVARCHAR(200) NULL,
  total DECIMAL(18,4) NOT NULL DEFAULT 0, lines NVARCHAR(MAX) NOT NULL DEFAULT N'[]',
  cart_discount DECIMAL(18,4) NOT NULL DEFAULT 0,
  cart_discount_type NVARCHAR(20) NOT NULL DEFAULT N'amount',
  exchange_ref NVARCHAR(80) NULL, member_id NVARCHAR(80) NULL, member_name NVARCHAR(200) NULL,
  coupon NVARCHAR(MAX) NULL, note NVARCHAR(400) NOT NULL DEFAULT N'',
  cancelled_from NVARCHAR(80) NULL, held_at DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
  is_synced BIT NOT NULL DEFAULT 0, sync_status NVARCHAR(20) NOT NULL DEFAULT N'pending',
  created_at DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(), updated_at DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME()
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
                   'bookings','booking_payments','transfers','stock_transfers',
                   'stock_transfer_items','stores','audit_logs','pos_settings');
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

/* ------------------------------------------------------------------
   Bill identity — one checkout attempt, one bill. The attempt id is
   written by the till before the save, so a retry after a network drop
   updates the same row instead of creating a second bill. Both keys are
   unique here exactly as they are in the central database.
   ------------------------------------------------------------------ */
IF COL_LENGTH('dbo.sales', 'client_transaction_id') IS NULL
  ALTER TABLE dbo.sales ADD client_transaction_id NVARCHAR(80) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_sales_client_txn'
                 AND object_id = OBJECT_ID('dbo.sales'))
  CREATE UNIQUE INDEX UX_sales_client_txn ON dbo.sales (client_transaction_id)
    WHERE client_transaction_id IS NOT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_sales_bill_number'
                 AND object_id = OBJECT_ID('dbo.sales'))
   AND NOT EXISTS (SELECT 1 FROM (SELECT bill_number FROM dbo.sales
                                   GROUP BY bill_number HAVING COUNT(*) > 1) d)
  CREATE UNIQUE INDEX UX_sales_bill_number ON dbo.sales (bill_number);
GO

/* Legacy single-table views from the first offline build. Nothing reads them
   any more; drop them so the local database matches the cloud shape. */
IF OBJECT_ID('dbo.BranchSales', 'V') IS NOT NULL DROP VIEW dbo.BranchSales;
GO
IF OBJECT_ID('dbo.BranchSaleItems', 'V') IS NOT NULL DROP VIEW dbo.BranchSaleItems;
GO
/* ------------------------------------------------------------------
   Activity notifications — sign-ins, shift changes, sales, voids and
   stock edits raised on this till, queued for the admin's screen and
   the WhatsApp fan-out.
   ------------------------------------------------------------------ */
IF OBJECT_ID('dbo.activity_events', 'U') IS NULL
CREATE TABLE dbo.activity_events (
  id           UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
  event_type   NVARCHAR(80)     NOT NULL,
  severity     NVARCHAR(20)     NOT NULL DEFAULT N'info',
  title        NVARCHAR(200)    NOT NULL DEFAULT N'',
  message      NVARCHAR(MAX)    NOT NULL DEFAULT N'',
  actor_id     NVARCHAR(80)     NULL,
  actor_name   NVARCHAR(200)    NULL,
  actor_role   NVARCHAR(60)     NULL,
  store_id     NVARCHAR(80)     NULL,
  store_name   NVARCHAR(200)    NULL,
  terminal_id  NVARCHAR(120)    NULL,
  branch_id    NVARCHAR(60)     NULL,
  metadata     NVARCHAR(MAX)    NOT NULL DEFAULT N'{}',
  is_synced    BIT              NOT NULL DEFAULT 0,
  sync_status  NVARCHAR(20)     NOT NULL DEFAULT N'pending',
  created_at   DATETIME2(3)     NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at   DATETIME2(3)     NOT NULL DEFAULT SYSUTCDATETIME()
);
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

/* ------------------------------------------------------------------
   Confirmation stamp — when the central database accepted this row.
   Lets a supervisor see how far behind a till is, per record.
   ------------------------------------------------------------------ */
DECLARE @t SYSNAME, @sqlAdd NVARCHAR(MAX);
DECLARE tbl CURSOR FOR
  SELECT name FROM sys.tables
   WHERE COL_LENGTH('dbo.' + name, 'is_synced') IS NOT NULL
     AND COL_LENGTH('dbo.' + name, 'synced_at') IS NULL;
OPEN tbl;
FETCH NEXT FROM tbl INTO @t;
WHILE @@FETCH_STATUS = 0
BEGIN
  SET @sqlAdd = N'ALTER TABLE dbo.[' + @t + N'] ADD synced_at DATETIME2 NULL;';
  EXEC sp_executesql @sqlAdd;
  FETCH NEXT FROM tbl INTO @t;
END
CLOSE tbl;
DEALLOCATE tbl;
GO

/* ------------------------------------------------------------------
   Cloud-parity sync block.

   pending_sync is the flag the sync engine reads: 1 while the row is
   still waiting to go up, 0 once the central database has taken it. It
   is computed from is_synced, so the two can never disagree.

   temp_id is the local identity a row is born with when it is created
   offline, so an upward push can be replayed without duplicating it.
   ------------------------------------------------------------------ */
DECLARE @st SYSNAME, @sqlSync NVARCHAR(MAX);
DECLARE synctbl CURSOR FOR
  SELECT name FROM sys.tables
   WHERE COL_LENGTH('dbo.' + name, 'is_synced') IS NOT NULL;
OPEN synctbl;
FETCH NEXT FROM synctbl INTO @st;
WHILE @@FETCH_STATUS = 0
BEGIN
  IF COL_LENGTH('dbo.' + @st, 'pending_sync') IS NULL
  BEGIN
    SET @sqlSync = N'ALTER TABLE dbo.[' + @st + N'] ADD pending_sync AS '
      + N'CAST(CASE WHEN [is_synced] = 1 THEN 0 ELSE 1 END AS BIT) PERSISTED;';
    EXEC sp_executesql @sqlSync;
  END
  IF COL_LENGTH('dbo.' + @st, 'temp_id') IS NULL
  BEGIN
    SET @sqlSync = N'ALTER TABLE dbo.[' + @st
      + N'] ADD temp_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_' + @st
      + N'_temp_id] DEFAULT NEWID();';
    EXEC sp_executesql @sqlSync;
  END
  FETCH NEXT FROM synctbl INTO @st;
END
CLOSE synctbl;
DEALLOCATE synctbl;
GO

/* Pending work is read constantly by the sync engine; index it once. */
DECLARE @it SYSNAME, @sqlIx NVARCHAR(MAX);
DECLARE ixtbl CURSOR FOR
  SELECT t.name FROM sys.tables AS t
   WHERE COL_LENGTH('dbo.' + t.name, 'pending_sync') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM sys.indexes i
        WHERE i.object_id = t.object_id
          AND i.name = 'IX_' + t.name + '_pending_sync');
OPEN ixtbl;
FETCH NEXT FROM ixtbl INTO @it;
WHILE @@FETCH_STATUS = 0
BEGIN
  SET @sqlIx = N'CREATE INDEX [IX_' + @it + N'_pending_sync] ON dbo.[' + @it
    + N'] ([pending_sync]);';
  EXEC sp_executesql @sqlIx;
  FETCH NEXT FROM ixtbl INTO @it;
END
CLOSE ixtbl;
DEALLOCATE ixtbl;
GO

/* Per-row failure reason so the sync table can explain a red badge. */
DECLARE @et SYSNAME, @sqlEr NVARCHAR(MAX);
DECLARE errtbl CURSOR FOR
  SELECT t.name FROM sys.tables AS t
   WHERE COL_LENGTH('dbo.' + t.name, 'sync_status') IS NOT NULL
     AND COL_LENGTH('dbo.' + t.name, 'sync_error') IS NULL;
OPEN errtbl;
FETCH NEXT FROM errtbl INTO @et;
WHILE @@FETCH_STATUS = 0
BEGIN
  SET @sqlEr = N'ALTER TABLE dbo.[' + @et + N'] ADD [sync_error] NVARCHAR(MAX) NULL;';
  EXEC sp_executesql @sqlEr;
  FETCH NEXT FROM errtbl INTO @et;
END
CLOSE errtbl;
DEALLOCATE errtbl;
GO

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

/* =====================================================================
   v1.3.5 alignment — mirrors the cloud shape so every entity the till
   touches has a local home, an idempotency key and a branch-scoped
   high-water mark. Idempotent: safe on every start.
   ===================================================================== */

IF OBJECT_ID('dbo.product_barcodes', 'U') IS NULL
CREATE TABLE dbo.product_barcodes (
  id          NVARCHAR(80)  NOT NULL PRIMARY KEY,
  product_id  NVARCHAR(80)  NOT NULL,
  barcode     NVARCHAR(120) NOT NULL,
  label       NVARCHAR(120) NULL,
  pack_size   DECIMAL(18,4) NOT NULL DEFAULT 1,
  is_primary  BIT           NOT NULL DEFAULT 0,
  is_synced   BIT           NOT NULL DEFAULT 0,
  sync_status NVARCHAR(20)  NOT NULL DEFAULT N'pending',
  created_at  DATETIME2(3)  NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at  DATETIME2(3)  NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

IF OBJECT_ID('dbo.product_categories', 'U') IS NULL
CREATE TABLE dbo.product_categories (
  id          NVARCHAR(80)  NOT NULL PRIMARY KEY,
  name        NVARCHAR(200) NOT NULL,
  kind        NVARCHAR(40)  NOT NULL DEFAULT N'category',
  sort        INT           NOT NULL DEFAULT 0,
  is_synced   BIT           NOT NULL DEFAULT 0,
  sync_status NVARCHAR(20)  NOT NULL DEFAULT N'pending',
  created_at  DATETIME2(3)  NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at  DATETIME2(3)  NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

IF OBJECT_ID('dbo.uom_units', 'U') IS NULL
CREATE TABLE dbo.uom_units (
  id            NVARCHAR(80)  NOT NULL PRIMARY KEY,
  code          NVARCHAR(40)  NOT NULL,
  name          NVARCHAR(120) NOT NULL,
  allow_decimal BIT           NOT NULL DEFAULT 0,
  sort          INT           NOT NULL DEFAULT 0,
  is_synced     BIT           NOT NULL DEFAULT 0,
  sync_status   NVARCHAR(20)  NOT NULL DEFAULT N'pending',
  created_at    DATETIME2(3)  NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at    DATETIME2(3)  NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

IF OBJECT_ID('dbo.payment_transactions', 'U') IS NULL
CREATE TABLE dbo.payment_transactions (
  id           NVARCHAR(80)  NOT NULL PRIMARY KEY,
  source_type  NVARCHAR(20)  NOT NULL DEFAULT N'sale',
  sale_id      NVARCHAR(80)  NULL,
  booking_id   NVARCHAR(80)  NULL,
  member_id    NVARCHAR(80)  NULL,
  store_id     NVARCHAR(60)  NULL,
  shift_id     NVARCHAR(80)  NULL,
  terminal_id  NVARCHAR(80)  NULL,
  amount       DECIMAL(18,4) NOT NULL DEFAULT 0,
  method       NVARCHAR(40)  NOT NULL DEFAULT N'cash',
  kind         NVARCHAR(40)  NOT NULL DEFAULT N'payment',
  reference    NVARCHAR(120) NULL,
  cashier_name NVARCHAR(200) NULL,
  note         NVARCHAR(400) NOT NULL DEFAULT N'',
  paid_at      DATETIME2(3)  NOT NULL DEFAULT SYSUTCDATETIME(),
  is_synced    BIT           NOT NULL DEFAULT 0,
  sync_status  NVARCHAR(20)  NOT NULL DEFAULT N'pending',
  created_at   DATETIME2(3)  NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at   DATETIME2(3)  NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

IF OBJECT_ID('dbo.item_activity_logs', 'U') IS NULL
CREATE TABLE dbo.item_activity_logs (
  id             NVARCHAR(80)  NOT NULL PRIMARY KEY,
  product_id     NVARCHAR(80)  NULL,
  product_name   NVARCHAR(300) NULL,
  sku            NVARCHAR(120) NULL,
  barcode        NVARCHAR(120) NULL,
  store_id       NVARCHAR(60)  NULL,
  terminal_id    NVARCHAR(80)  NULL,
  activity_type  NVARCHAR(60)  NOT NULL,
  reference      NVARCHAR(120) NULL,
  quantity_delta INT           NOT NULL DEFAULT 0,
  stock_before   INT           NULL,
  stock_after    INT           NULL,
  unit_cost      DECIMAL(18,4) NOT NULL DEFAULT 0,
  staff_name     NVARCHAR(200) NULL,
  note           NVARCHAR(400) NOT NULL DEFAULT N'',
  is_synced      BIT           NOT NULL DEFAULT 0,
  sync_status    NVARCHAR(20)  NOT NULL DEFAULT N'pending',
  created_at     DATETIME2(3)  NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at     DATETIME2(3)  NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

/* Movements already applied to local stock — a replay cannot deduct twice. */
IF OBJECT_ID('dbo.stock_delta_applied', 'U') IS NULL
CREATE TABLE dbo.stock_delta_applied (
  movement_id NVARCHAR(80) NOT NULL PRIMARY KEY,
  product_id  NVARCHAR(80) NULL,
  store_id    NVARCHAR(60) NULL,
  delta       INT          NOT NULL DEFAULT 0,
  applied_at  DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

/* Idempotency key on the transaction tables. */
IF COL_LENGTH('dbo.sale_items', 'client_transaction_id') IS NULL
  ALTER TABLE dbo.sale_items ADD client_transaction_id NVARCHAR(80) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_sale_items_client_txn')
  CREATE UNIQUE INDEX UX_sale_items_client_txn ON dbo.sale_items (client_transaction_id)
    WHERE client_transaction_id IS NOT NULL;
GO

/* Watermarks scoped to branch + till, so one machine can serve two branches. */
IF COL_LENGTH('dbo.sync_metadata', 'store_id') IS NULL
BEGIN
  ALTER TABLE dbo.sync_metadata ADD store_id NVARCHAR(60) NOT NULL
    CONSTRAINT DF_sync_metadata_store DEFAULT N'';
  ALTER TABLE dbo.sync_metadata ADD terminal_id NVARCHAR(80) NOT NULL
    CONSTRAINT DF_sync_metadata_terminal DEFAULT N'';
END
GO
DECLARE @pk SYSNAME = (
  SELECT name FROM sys.key_constraints
   WHERE parent_object_id = OBJECT_ID('dbo.sync_metadata') AND type = 'PK'
);
IF @pk IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM sys.index_columns ic
    JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
   WHERE ic.object_id = OBJECT_ID('dbo.sync_metadata') AND c.name = 'terminal_id'
)
BEGIN
  EXEC('ALTER TABLE dbo.sync_metadata DROP CONSTRAINT ' + @pk);
  ALTER TABLE dbo.sync_metadata
    ADD CONSTRAINT PK_sync_metadata PRIMARY KEY (table_name, store_id, terminal_id);
END
GO

/* ------------------------------------------------------------------ *
 * Multi-level locations (stores, warehouses, sub-warehouse levels).
 * Additive only: existing rows keep every value they already hold.
 * ------------------------------------------------------------------ */
IF COL_LENGTH('dbo.stores', 'location_type') IS NULL
  ALTER TABLE dbo.stores ADD location_type NVARCHAR(40) NOT NULL
    CONSTRAINT DF_stores_location_type DEFAULT N'store';
GO
IF COL_LENGTH('dbo.stores', 'parent_id') IS NULL
  ALTER TABLE dbo.stores ADD parent_id NVARCHAR(60) NULL;
GO
IF COL_LENGTH('dbo.stores', 'is_central') IS NULL
  ALTER TABLE dbo.stores ADD is_central BIT NOT NULL
    CONSTRAINT DF_stores_is_central DEFAULT 0;
GO
IF COL_LENGTH('dbo.stores', 'is_primary_sub') IS NULL
  ALTER TABLE dbo.stores ADD is_primary_sub BIT NOT NULL
    CONSTRAINT DF_stores_is_primary_sub DEFAULT 0;
GO
IF COL_LENGTH('dbo.stores', 'building_name') IS NULL
  ALTER TABLE dbo.stores ADD building_name NVARCHAR(200) NULL;
GO
IF COL_LENGTH('dbo.stores', 'floor_label') IS NULL
  ALTER TABLE dbo.stores ADD floor_label NVARCHAR(200) NULL;
GO
IF COL_LENGTH('dbo.stores', 'is_active') IS NULL
  ALTER TABLE dbo.stores ADD is_active BIT NOT NULL
    CONSTRAINT DF_stores_is_active DEFAULT 1;
GO
IF COL_LENGTH('dbo.stores', 'archived_at') IS NULL
  ALTER TABLE dbo.stores ADD archived_at DATETIME2(3) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_stores_parent_id')
  CREATE INDEX IX_stores_parent_id ON dbo.stores (parent_id);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_stores_location_type')
  CREATE INDEX IX_stores_location_type ON dbo.stores (location_type);
GO


/* ========================================================================
   Cloud-parity top-up (master offline schema)
   Generated from the live cloud schema. Additive and re-runnable:
   a table is only created when absent, a column only added when absent.
   No table is dropped, emptied or recreated - existing rows survive.
   ======================================================================== */

SET NOCOUNT ON;
GO

/* ---- app_users ---- */
IF OBJECT_ID('dbo.app_users', 'U') IS NULL
CREATE TABLE dbo.app_users (
  [id] UNIQUEIDENTIFIER DEFAULT NEWID() NOT NULL,
  [user_id] NVARCHAR(400),
  [full_name] NVARCHAR(400),
  [email] NVARCHAR(MAX),
  [role] NVARCHAR(40) DEFAULT N'staff' NOT NULL,
  [store_id] NVARCHAR(400),
  [is_active] BIT DEFAULT 1 NOT NULL,
  [permissions] NVARCHAR(MAX) NOT NULL,
  [pin_hash] NVARCHAR(MAX) DEFAULT N'' NOT NULL,
  [auth_user_id] UNIQUEIDENTIFIER,
  [last_login_at] DATETIME2(3),
  [created_at] DATETIME2(3) DEFAULT SYSUTCDATETIME() NOT NULL,
  [updated_at] DATETIME2(3) DEFAULT SYSUTCDATETIME() NOT NULL,
  [role_slug] NVARCHAR(400),
  [pin_length] SMALLINT DEFAULT 6 NOT NULL,
  [row_version] INT DEFAULT 1 NOT NULL,
  [is_synced] BIT DEFAULT 0,
  [sync_status] NVARCHAR(40) DEFAULT N'pending',
  [sync_attempts] INT DEFAULT 0,
  [last_error_at] DATETIME2(3),
  [client_transaction_id] NVARCHAR(120),
  CONSTRAINT [PK_app_users] PRIMARY KEY ([id])
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_app_users_store_id')
  CREATE INDEX [IX_app_users_store_id] ON dbo.app_users ([store_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_app_users_created_at')
  CREATE INDEX [IX_app_users_created_at] ON dbo.app_users ([created_at]);
GO

/* ---- branch_telemetry ---- */
IF OBJECT_ID('dbo.branch_telemetry', 'U') IS NULL
CREATE TABLE dbo.branch_telemetry (
  [terminal_id] NVARCHAR(400) NOT NULL,
  [store_id] NVARCHAR(400),
  [terminal_name] NVARCHAR(400),
  [staff_name] NVARCHAR(400),
  [staff_role] NVARCHAR(MAX),
  [db_mode] NVARCHAR(MAX) DEFAULT N'online' NOT NULL,
  [connection_status] NVARCHAR(MAX) DEFAULT N'online' NOT NULL,
  [storage_engine] NVARCHAR(MAX) DEFAULT N'cloud' NOT NULL,
  [pending_count] INT DEFAULT 0 NOT NULL,
  [conflict_count] INT DEFAULT 0 NOT NULL,
  [last_synced_at] DATETIME2(3),
  [app_version] NVARCHAR(MAX),
  [platform] NVARCHAR(MAX),
  [last_seen_at] DATETIME2(3) DEFAULT SYSUTCDATETIME() NOT NULL,
  [created_at] DATETIME2(3) DEFAULT SYSUTCDATETIME() NOT NULL,
  [updated_at] DATETIME2(3) DEFAULT SYSUTCDATETIME() NOT NULL,
  [branch_id] NVARCHAR(400),
  [pending_queue_count] INT,
  [last_ping] DATETIME2(3),
  [status] NVARCHAR(MAX),
  [is_synced] BIT DEFAULT 0,
  [sync_status] NVARCHAR(40) DEFAULT N'pending',
  [row_version] INT DEFAULT 0,
  [sync_attempts] INT DEFAULT 0,
  [last_error_at] DATETIME2(3),
  [client_transaction_id] NVARCHAR(120),
  CONSTRAINT [PK_branch_telemetry] PRIMARY KEY ([terminal_id])
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_branch_telemetry_store_id')
  CREATE INDEX [IX_branch_telemetry_store_id] ON dbo.branch_telemetry ([store_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_branch_telemetry_created_at')
  CREATE INDEX [IX_branch_telemetry_created_at] ON dbo.branch_telemetry ([created_at]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_branch_telemetry_status')
  CREATE INDEX [IX_branch_telemetry_status] ON dbo.branch_telemetry ([status]);
GO

/* ---- cashiers ---- */
IF OBJECT_ID('dbo.cashiers', 'U') IS NULL
CREATE TABLE dbo.cashiers (
  [id] UNIQUEIDENTIFIER DEFAULT NEWID() NOT NULL,
  [username] NVARCHAR(400),
  [full_name] NVARCHAR(400) DEFAULT N'' NOT NULL,
  [pin_hash] NVARCHAR(MAX),
  [store_id] NVARCHAR(400),
  [permissions] NVARCHAR(MAX) DEFAULT N'{}' NOT NULL,
  [is_active] BIT DEFAULT 1 NOT NULL,
  [last_login_at] DATETIME2(3),
  [created_at] DATETIME2(3) DEFAULT SYSUTCDATETIME() NOT NULL,
  [updated_at] DATETIME2(3) DEFAULT SYSUTCDATETIME() NOT NULL,
  [role_slug] NVARCHAR(400),
  [is_synced] BIT DEFAULT 0,
  [sync_status] NVARCHAR(40) DEFAULT N'pending',
  [row_version] INT DEFAULT 0,
  [sync_attempts] INT DEFAULT 0,
  [last_error_at] DATETIME2(3),
  [client_transaction_id] NVARCHAR(120),
  CONSTRAINT [PK_cashiers] PRIMARY KEY ([id])
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_cashiers_store_id')
  CREATE INDEX [IX_cashiers_store_id] ON dbo.cashiers ([store_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_cashiers_created_at')
  CREATE INDEX [IX_cashiers_created_at] ON dbo.cashiers ([created_at]);
GO

/* ---- coupon_campaigns ---- */
IF OBJECT_ID('dbo.coupon_campaigns', 'U') IS NULL
CREATE TABLE dbo.coupon_campaigns (
  [id] UNIQUEIDENTIFIER DEFAULT NEWID() NOT NULL,
  [name] NVARCHAR(400),
  [slug] NVARCHAR(400),
  [discount_type] NVARCHAR(MAX) DEFAULT N'PERCENTAGE' NOT NULL,
  [discount_value] DECIMAL(18,4) DEFAULT 0 NOT NULL,
  [scope] NVARCHAR(MAX) DEFAULT N'BILL' NOT NULL,
  [scope_value] NVARCHAR(MAX),
  [max_claims] INT,
  [max_per_member] INT DEFAULT 1,
  [claims_count] INT DEFAULT 0 NOT NULL,
  [starts_at] DATETIME2(3),
  [expires_at] DATETIME2(3),
  [is_active] BIT DEFAULT 1 NOT NULL,
  [is_welcome] BIT DEFAULT 0 NOT NULL,
  [created_at] DATETIME2(3) DEFAULT SYSUTCDATETIME() NOT NULL,
  [updated_at] DATETIME2(3) DEFAULT SYSUTCDATETIME() NOT NULL,
  [row_version] INT DEFAULT 1 NOT NULL,
  [is_synced] BIT DEFAULT 0,
  [sync_status] NVARCHAR(40) DEFAULT N'pending',
  [sync_attempts] INT DEFAULT 0,
  [last_error_at] DATETIME2(3),
  [client_transaction_id] NVARCHAR(120),
  CONSTRAINT [PK_coupon_campaigns] PRIMARY KEY ([id])
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_coupon_campaigns_created_at')
  CREATE INDEX [IX_coupon_campaigns_created_at] ON dbo.coupon_campaigns ([created_at]);
GO

/* ---- coupon_events ---- */
IF OBJECT_ID('dbo.coupon_events', 'U') IS NULL
CREATE TABLE dbo.coupon_events (
  [id] UNIQUEIDENTIFIER DEFAULT NEWID() NOT NULL,
  [event_type] NVARCHAR(MAX),
  [campaign_id] UNIQUEIDENTIFIER,
  [campaign_name] NVARCHAR(400),
  [voucher_token] NVARCHAR(400),
  [member_id] UNIQUEIDENTIFIER,
  [member_phone] NVARCHAR(400),
  [store_id] NVARCHAR(400),
  [terminal_id] NVARCHAR(400),
  [staff_name] NVARCHAR(400),
  [staff_role] NVARCHAR(MAX),
  [sale_id] NVARCHAR(400),
  [note] NVARCHAR(MAX),
  [created_at] DATETIME2(3) DEFAULT SYSUTCDATETIME() NOT NULL,
  [is_synced] BIT DEFAULT 0,
  [sync_status] NVARCHAR(40) DEFAULT N'pending',
  [row_version] INT DEFAULT 0,
  [sync_attempts] INT DEFAULT 0,
  [last_error_at] DATETIME2(3),
  [client_transaction_id] NVARCHAR(120),
  CONSTRAINT [PK_coupon_events] PRIMARY KEY ([id])
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_coupon_events_store_id')
  CREATE INDEX [IX_coupon_events_store_id] ON dbo.coupon_events ([store_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_coupon_events_sale_id')
  CREATE INDEX [IX_coupon_events_sale_id] ON dbo.coupon_events ([sale_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_coupon_events_created_at')
  CREATE INDEX [IX_coupon_events_created_at] ON dbo.coupon_events ([created_at]);
GO

/* ---- drawer_events ---- */
IF OBJECT_ID('dbo.drawer_events', 'U') IS NULL
CREATE TABLE dbo.drawer_events (
  [id] UNIQUEIDENTIFIER DEFAULT NEWID() NOT NULL,
  [store_id] NVARCHAR(400),
  [terminal_id] NVARCHAR(400),
  [shift_id] NVARCHAR(400),
  [staff_id] NVARCHAR(400),
  [staff_name] NVARCHAR(400),
  [role] NVARCHAR(MAX),
  [reason] NVARCHAR(MAX),
  [note] NVARCHAR(MAX),
  [approved_by] NVARCHAR(MAX),
  [created_at] DATETIME2(3) DEFAULT SYSUTCDATETIME() NOT NULL,
  [is_synced] BIT DEFAULT 0,
  [sync_status] NVARCHAR(40) DEFAULT N'pending',
  [row_version] INT DEFAULT 0,
  [sync_attempts] INT DEFAULT 0,
  [last_error_at] DATETIME2(3),
  [client_transaction_id] NVARCHAR(120),
  CONSTRAINT [PK_drawer_events] PRIMARY KEY ([id])
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_drawer_events_store_id')
  CREATE INDEX [IX_drawer_events_store_id] ON dbo.drawer_events ([store_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_drawer_events_created_at')
  CREATE INDEX [IX_drawer_events_created_at] ON dbo.drawer_events ([created_at]);
GO

/* ---- integration_settings ---- */
IF OBJECT_ID('dbo.integration_settings', 'U') IS NULL
CREATE TABLE dbo.integration_settings (
  [id] UNIQUEIDENTIFIER DEFAULT NEWID() NOT NULL,
  [provider_name] NVARCHAR(400),
  [api_keys_encrypted] NVARCHAR(MAX) DEFAULT N'{}' NOT NULL,
  [verification_channel] NVARCHAR(MAX) DEFAULT N'whatsapp' NOT NULL,
  [strict_verification] BIT DEFAULT 0 NOT NULL,
  [is_active] BIT DEFAULT 1 NOT NULL,
  [updated_by] NVARCHAR(MAX),
  [created_at] DATETIME2(3) DEFAULT SYSUTCDATETIME() NOT NULL,
  [updated_at] DATETIME2(3) DEFAULT SYSUTCDATETIME() NOT NULL,
  [is_synced] BIT DEFAULT 0,
  [sync_status] NVARCHAR(40) DEFAULT N'pending',
  [row_version] INT DEFAULT 0,
  [sync_attempts] INT DEFAULT 0,
  [last_error_at] DATETIME2(3),
  [client_transaction_id] NVARCHAR(120),
  CONSTRAINT [PK_integration_settings] PRIMARY KEY ([id])
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_integration_settings_created_at')
  CREATE INDEX [IX_integration_settings_created_at] ON dbo.integration_settings ([created_at]);
GO

/* ---- issued_vouchers ---- */
IF OBJECT_ID('dbo.issued_vouchers', 'U') IS NULL
CREATE TABLE dbo.issued_vouchers (
  [id] UNIQUEIDENTIFIER DEFAULT NEWID() NOT NULL,
  [token_slug] NVARCHAR(400),
  [campaign_id] UNIQUEIDENTIFIER,
  [member_id] UNIQUEIDENTIFIER,
  [status] NVARCHAR(MAX) DEFAULT N'ISSUED' NOT NULL,
  [issued_at] DATETIME2(3) DEFAULT SYSUTCDATETIME() NOT NULL,
  [expires_at] DATETIME2(3),
  [issued_by] NVARCHAR(MAX),
  [issued_source] NVARCHAR(MAX) DEFAULT N'PUBLIC' NOT NULL,
  [redeemed_at] DATETIME2(3),
  [redeemed_by] NVARCHAR(MAX),
  [redeemed_sale_id] NVARCHAR(400),
  [disabled_at] DATETIME2(3),
  [disabled_by] NVARCHAR(MAX),
  [disable_reason] NVARCHAR(MAX),
  [store_id] NVARCHAR(400),
  [row_version] INT DEFAULT 1 NOT NULL,
  [is_synced] BIT DEFAULT 0,
  [sync_status] NVARCHAR(40) DEFAULT N'pending',
  [sync_attempts] INT DEFAULT 0,
  [last_error_at] DATETIME2(3),
  [client_transaction_id] NVARCHAR(120),
  CONSTRAINT [PK_issued_vouchers] PRIMARY KEY ([id])
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_issued_vouchers_status')
  CREATE INDEX [IX_issued_vouchers_status] ON dbo.issued_vouchers ([status]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_issued_vouchers_store_id')
  CREATE INDEX [IX_issued_vouchers_store_id] ON dbo.issued_vouchers ([store_id]);
GO

/* ---- member_verifications ---- */
IF OBJECT_ID('dbo.member_verifications', 'U') IS NULL
CREATE TABLE dbo.member_verifications (
  [id] UNIQUEIDENTIFIER DEFAULT NEWID() NOT NULL,
  [member_id] UNIQUEIDENTIFIER,
  [phone] NVARCHAR(400),
  [email] NVARCHAR(MAX),
  [channel] NVARCHAR(MAX) DEFAULT N'whatsapp' NOT NULL,
  [otp_code] NVARCHAR(400),
  [attempts] INT DEFAULT 0 NOT NULL,
  [status] NVARCHAR(MAX) DEFAULT N'pending' NOT NULL,
  [sent_by] NVARCHAR(MAX),
  [store_id] NVARCHAR(400),
  [expires_at] DATETIME2(3) DEFAULT SYSUTCDATETIME() NOT NULL,
  [verified_at] DATETIME2(3),
  [created_at] DATETIME2(3) DEFAULT SYSUTCDATETIME() NOT NULL,
  [is_synced] BIT DEFAULT 0,
  [sync_status] NVARCHAR(40) DEFAULT N'pending',
  [row_version] INT DEFAULT 0,
  [sync_attempts] INT DEFAULT 0,
  [last_error_at] DATETIME2(3),
  [client_transaction_id] NVARCHAR(120),
  CONSTRAINT [PK_member_verifications] PRIMARY KEY ([id])
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_member_verifications_phone')
  CREATE INDEX [IX_member_verifications_phone] ON dbo.member_verifications ([phone]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_member_verifications_status')
  CREATE INDEX [IX_member_verifications_status] ON dbo.member_verifications ([status]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_member_verifications_store_id')
  CREATE INDEX [IX_member_verifications_store_id] ON dbo.member_verifications ([store_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_member_verifications_created_at')
  CREATE INDEX [IX_member_verifications_created_at] ON dbo.member_verifications ([created_at]);
GO

/* ---- offline_sync_audit_log ---- */
IF OBJECT_ID('dbo.offline_sync_audit_log', 'U') IS NULL
CREATE TABLE dbo.offline_sync_audit_log (
  [id] UNIQUEIDENTIFIER DEFAULT NEWID() NOT NULL,
  [terminal_id] NVARCHAR(400),
  [store_id] NVARCHAR(400),
  [direction] NVARCHAR(MAX),
  [table_name] NVARCHAR(400),
  [record_id] NVARCHAR(400),
  [records] INT DEFAULT 0 NOT NULL,
  [status] NVARCHAR(MAX) DEFAULT N'ok' NOT NULL,
  [error_message] NVARCHAR(MAX),
  [started_at] DATETIME2(3) DEFAULT SYSUTCDATETIME() NOT NULL,
  [finished_at] DATETIME2(3),
  [created_at] DATETIME2(3) DEFAULT SYSUTCDATETIME() NOT NULL,
  [is_synced] BIT DEFAULT 0,
  [sync_status] NVARCHAR(40) DEFAULT N'pending',
  [row_version] INT DEFAULT 0,
  [sync_attempts] INT DEFAULT 0,
  [last_error_at] DATETIME2(3),
  [client_transaction_id] NVARCHAR(120),
  CONSTRAINT [PK_offline_sync_audit_log] PRIMARY KEY ([id])
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_offline_sync_audit_log_store_id')
  CREATE INDEX [IX_offline_sync_audit_log_store_id] ON dbo.offline_sync_audit_log ([store_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_offline_sync_audit_log_status')
  CREATE INDEX [IX_offline_sync_audit_log_status] ON dbo.offline_sync_audit_log ([status]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_offline_sync_audit_log_created_at')
  CREATE INDEX [IX_offline_sync_audit_log_created_at] ON dbo.offline_sync_audit_log ([created_at]);
GO

/* ---- payment_types ---- */
IF OBJECT_ID('dbo.payment_types', 'U') IS NULL
CREATE TABLE dbo.payment_types (
  [id] UNIQUEIDENTIFIER DEFAULT NEWID() NOT NULL,
  [name] NVARCHAR(400),
  [type_code] NVARCHAR(400),
  [requires_reference] BIT DEFAULT 0 NOT NULL,
  [is_active] BIT DEFAULT 1 NOT NULL,
  [icon] NVARCHAR(MAX) DEFAULT N'Wallet' NOT NULL,
  [sort_order] INT DEFAULT 0 NOT NULL,
  [is_system] BIT DEFAULT 0 NOT NULL,
  [created_at] DATETIME2(3) DEFAULT SYSUTCDATETIME() NOT NULL,
  [updated_at] DATETIME2(3) DEFAULT SYSUTCDATETIME() NOT NULL,
  [row_version] INT DEFAULT 1 NOT NULL,
  [is_synced] BIT DEFAULT 0,
  [sync_status] NVARCHAR(40) DEFAULT N'pending',
  [sync_attempts] INT DEFAULT 0,
  [last_error_at] DATETIME2(3),
  [client_transaction_id] NVARCHAR(120),
  CONSTRAINT [PK_payment_types] PRIMARY KEY ([id])
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_payment_types_created_at')
  CREATE INDEX [IX_payment_types_created_at] ON dbo.payment_types ([created_at]);
GO

/* ---- pin_attempts ---- */
IF OBJECT_ID('dbo.pin_attempts', 'U') IS NULL
CREATE TABLE dbo.pin_attempts (
  [key] NVARCHAR(400) NOT NULL,
  [attempts] INT DEFAULT 0 NOT NULL,
  [window_started_at] DATETIME2(3) DEFAULT SYSUTCDATETIME() NOT NULL,
  [locked_until] DATETIME2(3),
  [created_at] DATETIME2(3) DEFAULT SYSUTCDATETIME() NOT NULL,
  [updated_at] DATETIME2(3) DEFAULT SYSUTCDATETIME() NOT NULL,
  [is_synced] BIT DEFAULT 0,
  [sync_status] NVARCHAR(40) DEFAULT N'pending',
  [row_version] INT DEFAULT 0,
  [sync_attempts] INT DEFAULT 0,
  [last_error_at] DATETIME2(3),
  [client_transaction_id] NVARCHAR(120),
  CONSTRAINT [PK_pin_attempts] PRIMARY KEY ([key])
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_pin_attempts_created_at')
  CREATE INDEX [IX_pin_attempts_created_at] ON dbo.pin_attempts ([created_at]);
GO

/* ---- public_flags ---- */
IF OBJECT_ID('dbo.public_flags', 'U') IS NULL
CREATE TABLE dbo.public_flags (
  [key] NVARCHAR(400) NOT NULL,
  [enabled] BIT DEFAULT 1 NOT NULL,
  [updated_at] DATETIME2(3) DEFAULT SYSUTCDATETIME() NOT NULL,
  [is_synced] BIT DEFAULT 0,
  [sync_status] NVARCHAR(40) DEFAULT N'pending',
  [row_version] INT DEFAULT 0,
  [sync_attempts] INT DEFAULT 0,
  [last_error_at] DATETIME2(3),
  [client_transaction_id] NVARCHAR(120),
  CONSTRAINT [PK_public_flags] PRIMARY KEY ([key])
);
GO

/* ---- secure_settings ---- */
IF OBJECT_ID('dbo.secure_settings', 'U') IS NULL
CREATE TABLE dbo.secure_settings (
  [key] NVARCHAR(400) NOT NULL,
  [ciphertext] NVARCHAR(MAX),
  [hint] NVARCHAR(MAX),
  [updated_by] NVARCHAR(MAX),
  [created_at] DATETIME2(3) DEFAULT SYSUTCDATETIME() NOT NULL,
  [updated_at] DATETIME2(3) DEFAULT SYSUTCDATETIME() NOT NULL,
  [is_synced] BIT DEFAULT 0,
  [sync_status] NVARCHAR(40) DEFAULT N'pending',
  [row_version] INT DEFAULT 0,
  [sync_attempts] INT DEFAULT 0,
  [last_error_at] DATETIME2(3),
  [client_transaction_id] NVARCHAR(120),
  CONSTRAINT [PK_secure_settings] PRIMARY KEY ([key])
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_secure_settings_created_at')
  CREATE INDEX [IX_secure_settings_created_at] ON dbo.secure_settings ([created_at]);
GO

/* ---- security_findings ---- */
IF OBJECT_ID('dbo.security_findings', 'U') IS NULL
CREATE TABLE dbo.security_findings (
  [id] UNIQUEIDENTIFIER DEFAULT NEWID() NOT NULL,
  [fingerprint] NVARCHAR(MAX),
  [source] NVARCHAR(MAX),
  [severity] NVARCHAR(MAX) DEFAULT N'medium' NOT NULL,
  [title] NVARCHAR(MAX),
  [detail] NVARCHAR(MAX) DEFAULT N'' NOT NULL,
  [deployment_ref] NVARCHAR(MAX),
  [status] NVARCHAR(MAX) DEFAULT N'open' NOT NULL,
  [first_seen_at] DATETIME2(3) DEFAULT SYSUTCDATETIME() NOT NULL,
  [last_seen_at] DATETIME2(3) DEFAULT SYSUTCDATETIME() NOT NULL,
  [acknowledged_by] NVARCHAR(MAX),
  [acknowledged_at] DATETIME2(3),
  [resolved_at] DATETIME2(3),
  [created_at] DATETIME2(3) DEFAULT SYSUTCDATETIME() NOT NULL,
  [updated_at] DATETIME2(3) DEFAULT SYSUTCDATETIME() NOT NULL,
  [is_synced] BIT DEFAULT 0,
  [sync_status] NVARCHAR(40) DEFAULT N'pending',
  [row_version] INT DEFAULT 0,
  [sync_attempts] INT DEFAULT 0,
  [last_error_at] DATETIME2(3),
  [client_transaction_id] NVARCHAR(120),
  CONSTRAINT [PK_security_findings] PRIMARY KEY ([id])
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_security_findings_status')
  CREATE INDEX [IX_security_findings_status] ON dbo.security_findings ([status]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_security_findings_created_at')
  CREATE INDEX [IX_security_findings_created_at] ON dbo.security_findings ([created_at]);
GO

/* ---- settings_locks ---- */
IF OBJECT_ID('dbo.settings_locks', 'U') IS NULL
CREATE TABLE dbo.settings_locks (
  [section] NVARCHAR(MAX) NOT NULL,
  [locked] BIT DEFAULT 0 NOT NULL,
  [updated_by] NVARCHAR(MAX),
  [created_at] DATETIME2(3) DEFAULT SYSUTCDATETIME() NOT NULL,
  [updated_at] DATETIME2(3) DEFAULT SYSUTCDATETIME() NOT NULL,
  [is_synced] BIT DEFAULT 0,
  [sync_status] NVARCHAR(40) DEFAULT N'pending',
  [row_version] INT DEFAULT 0,
  [sync_attempts] INT DEFAULT 0,
  [last_error_at] DATETIME2(3),
  [client_transaction_id] NVARCHAR(120),
  CONSTRAINT [PK_settings_locks] PRIMARY KEY ([section])
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_settings_locks_created_at')
  CREATE INDEX [IX_settings_locks_created_at] ON dbo.settings_locks ([created_at]);
GO

/* ---- settings_overrides ---- */
IF OBJECT_ID('dbo.settings_overrides', 'U') IS NULL
CREATE TABLE dbo.settings_overrides (
  [scope] NVARCHAR(MAX) DEFAULT N'BRANCH' NOT NULL,
  [scope_id] NVARCHAR(400) DEFAULT N'' NOT NULL,
  [section] NVARCHAR(MAX) NOT NULL,
  [patch] NVARCHAR(MAX) DEFAULT N'{}' NOT NULL,
  [updated_by] NVARCHAR(MAX),
  [created_at] DATETIME2(3) DEFAULT SYSUTCDATETIME() NOT NULL,
  [updated_at] DATETIME2(3) DEFAULT SYSUTCDATETIME() NOT NULL,
  [is_synced] BIT DEFAULT 0,
  [sync_status] NVARCHAR(40) DEFAULT N'pending',
  [row_version] INT DEFAULT 0,
  [sync_attempts] INT DEFAULT 0,
  [last_error_at] DATETIME2(3),
  [client_transaction_id] NVARCHAR(120),
  CONSTRAINT [PK_settings_overrides] PRIMARY KEY ([scope], [scope_id], [section])
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_settings_overrides_created_at')
  CREATE INDEX [IX_settings_overrides_created_at] ON dbo.settings_overrides ([created_at]);
GO

/* ---- shift_sessions ---- */
IF OBJECT_ID('dbo.shift_sessions', 'U') IS NULL
CREATE TABLE dbo.shift_sessions (
  [id] UNIQUEIDENTIFIER DEFAULT NEWID() NOT NULL,
  [shift_id] NVARCHAR(400),
  [store_id] NVARCHAR(400),
  [terminal_id] NVARCHAR(400),
  [terminal_name] NVARCHAR(400),
  [staff_id] NVARCHAR(400),
  [staff_name] NVARCHAR(400),
  [role] NVARCHAR(MAX),
  [signed_in_at] DATETIME2(3) DEFAULT SYSUTCDATETIME() NOT NULL,
  [signed_out_at] DATETIME2(3),
  [created_at] DATETIME2(3) DEFAULT SYSUTCDATETIME() NOT NULL,
  [updated_at] DATETIME2(3) DEFAULT SYSUTCDATETIME() NOT NULL,
  [row_version] INT DEFAULT 1 NOT NULL,
  [is_synced] BIT DEFAULT 0,
  [sync_status] NVARCHAR(40) DEFAULT N'pending',
  [sync_attempts] INT DEFAULT 0,
  [last_error_at] DATETIME2(3),
  [client_transaction_id] NVARCHAR(120),
  CONSTRAINT [PK_shift_sessions] PRIMARY KEY ([id])
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_shift_sessions_store_id')
  CREATE INDEX [IX_shift_sessions_store_id] ON dbo.shift_sessions ([store_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_shift_sessions_created_at')
  CREATE INDEX [IX_shift_sessions_created_at] ON dbo.shift_sessions ([created_at]);
GO

/* ---- sku_audit ---- */
IF OBJECT_ID('dbo.sku_audit', 'U') IS NULL
CREATE TABLE dbo.sku_audit (
  [id] UNIQUEIDENTIFIER DEFAULT NEWID() NOT NULL,
  [sku] NVARCHAR(400),
  [product_id] UNIQUEIDENTIFIER,
  [product_name] NVARCHAR(400),
  [source] NVARCHAR(MAX) DEFAULT N'auto' NOT NULL,
  [previous_sku] NVARCHAR(400),
  [store_id] NVARCHAR(400),
  [store_name] NVARCHAR(400),
  [terminal_id] NVARCHAR(400),
  [staff_id] NVARCHAR(400),
  [staff_name] NVARCHAR(400),
  [role] NVARCHAR(MAX),
  [created_at] DATETIME2(3) DEFAULT SYSUTCDATETIME() NOT NULL,
  [is_synced] BIT DEFAULT 0,
  [sync_status] NVARCHAR(40) DEFAULT N'pending',
  [row_version] INT DEFAULT 0,
  [sync_attempts] INT DEFAULT 0,
  [last_error_at] DATETIME2(3),
  [client_transaction_id] NVARCHAR(120),
  CONSTRAINT [PK_sku_audit] PRIMARY KEY ([id])
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_sku_audit_sku')
  CREATE INDEX [IX_sku_audit_sku] ON dbo.sku_audit ([sku]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_sku_audit_product_id')
  CREATE INDEX [IX_sku_audit_product_id] ON dbo.sku_audit ([product_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_sku_audit_store_id')
  CREATE INDEX [IX_sku_audit_store_id] ON dbo.sku_audit ([store_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_sku_audit_created_at')
  CREATE INDEX [IX_sku_audit_created_at] ON dbo.sku_audit ([created_at]);
GO

/* ---- staff_roles ---- */
IF OBJECT_ID('dbo.staff_roles', 'U') IS NULL
CREATE TABLE dbo.staff_roles (
  [slug] NVARCHAR(400) NOT NULL,
  [name] NVARCHAR(400),
  [base_level] NVARCHAR(MAX) DEFAULT N'cashier' NOT NULL,
  [permissions] NVARCHAR(MAX) DEFAULT N'{}' NOT NULL,
  [is_core] BIT DEFAULT 0 NOT NULL,
  [created_at] DATETIME2(3) DEFAULT SYSUTCDATETIME() NOT NULL,
  [updated_at] DATETIME2(3) DEFAULT SYSUTCDATETIME() NOT NULL,
  [is_synced] BIT DEFAULT 0,
  [sync_status] NVARCHAR(40) DEFAULT N'pending',
  [row_version] INT DEFAULT 0,
  [sync_attempts] INT DEFAULT 0,
  [last_error_at] DATETIME2(3),
  [client_transaction_id] NVARCHAR(120),
  CONSTRAINT [PK_staff_roles] PRIMARY KEY ([slug])
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_staff_roles_created_at')
  CREATE INDEX [IX_staff_roles_created_at] ON dbo.staff_roles ([created_at]);
GO

/* ---- system_audit_logs ---- */
IF OBJECT_ID('dbo.system_audit_logs', 'U') IS NULL
CREATE TABLE dbo.system_audit_logs (
  [id] UNIQUEIDENTIFIER DEFAULT NEWID() NOT NULL,
  [actor_id] NVARCHAR(400),
  [actor_name] NVARCHAR(400),
  [actor_role] NVARCHAR(MAX),
  [action_type] NVARCHAR(MAX),
  [entity_affected] NVARCHAR(MAX),
  [entity_id] NVARCHAR(400),
  [old_value] NVARCHAR(MAX),
  [new_value] NVARCHAR(MAX),
  [terminal_id] NVARCHAR(400),
  [ip_address] NVARCHAR(MAX),
  [store_id] NVARCHAR(400),
  [note] NVARCHAR(MAX),
  [created_at] DATETIME2(3) DEFAULT SYSUTCDATETIME() NOT NULL,
  [is_synced] BIT DEFAULT 0,
  [sync_status] NVARCHAR(40) DEFAULT N'pending',
  [row_version] INT DEFAULT 0,
  [sync_attempts] INT DEFAULT 0,
  [last_error_at] DATETIME2(3),
  [client_transaction_id] NVARCHAR(120),
  CONSTRAINT [PK_system_audit_logs] PRIMARY KEY ([id])
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_system_audit_logs_store_id')
  CREATE INDEX [IX_system_audit_logs_store_id] ON dbo.system_audit_logs ([store_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_system_audit_logs_created_at')
  CREATE INDEX [IX_system_audit_logs_created_at] ON dbo.system_audit_logs ([created_at]);
GO

/* ---- terminal_commands ---- */
IF OBJECT_ID('dbo.terminal_commands', 'U') IS NULL
CREATE TABLE dbo.terminal_commands (
  [id] UNIQUEIDENTIFIER DEFAULT NEWID() NOT NULL,
  [terminal_id] NVARCHAR(400),
  [store_id] NVARCHAR(400),
  [command] NVARCHAR(MAX),
  [status] NVARCHAR(MAX) DEFAULT N'pending' NOT NULL,
  [note] NVARCHAR(MAX),
  [result] NVARCHAR(MAX),
  [issued_by] NVARCHAR(MAX),
  [issued_role] NVARCHAR(MAX),
  [picked_up_at] DATETIME2(3),
  [finished_at] DATETIME2(3),
  [created_at] DATETIME2(3) DEFAULT SYSUTCDATETIME() NOT NULL,
  [updated_at] DATETIME2(3) DEFAULT SYSUTCDATETIME() NOT NULL,
  [is_synced] BIT DEFAULT 0,
  [sync_status] NVARCHAR(40) DEFAULT N'pending',
  [row_version] INT DEFAULT 0,
  [sync_attempts] INT DEFAULT 0,
  [last_error_at] DATETIME2(3),
  [client_transaction_id] NVARCHAR(120),
  CONSTRAINT [PK_terminal_commands] PRIMARY KEY ([id])
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_terminal_commands_store_id')
  CREATE INDEX [IX_terminal_commands_store_id] ON dbo.terminal_commands ([store_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_terminal_commands_status')
  CREATE INDEX [IX_terminal_commands_status] ON dbo.terminal_commands ([status]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_terminal_commands_created_at')
  CREATE INDEX [IX_terminal_commands_created_at] ON dbo.terminal_commands ([created_at]);
GO

/* ---- terminal_tokens ---- */
IF OBJECT_ID('dbo.terminal_tokens', 'U') IS NULL
CREATE TABLE dbo.terminal_tokens (
  [id] UNIQUEIDENTIFIER DEFAULT NEWID() NOT NULL,
  [location_id] NVARCHAR(400),
  [location_name] NVARCHAR(400),
  [device_name] NVARCHAR(400),
  [status] NVARCHAR(MAX) DEFAULT N'active' NOT NULL,
  [created_at] DATETIME2(3) DEFAULT SYSUTCDATETIME() NOT NULL,
  [activated_at] DATETIME2(3),
  [revoked_at] DATETIME2(3),
  [last_seen_at] DATETIME2(3),
  [reissued_at] DATETIME2(3),
  [replaced_by] UNIQUEIDENTIFIER,
  [claimed_by_device] NVARCHAR(MAX),
  [claimed_at] DATETIME2(3),
  [platform] NVARCHAR(MAX) DEFAULT N'unknown' NOT NULL,
  [expires_at] DATETIME2(3),
  [claimed_os] NVARCHAR(200),
  [claim_proof] NVARCHAR(400),
  [row_version] INT DEFAULT 1 NOT NULL,
  [is_synced] BIT DEFAULT 0,
  [sync_status] NVARCHAR(40) DEFAULT N'pending',
  [sync_attempts] INT DEFAULT 0,
  [last_error_at] DATETIME2(3),
  [client_transaction_id] NVARCHAR(120),
  CONSTRAINT [PK_terminal_tokens] PRIMARY KEY ([id])
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_terminal_tokens_status')
  CREATE INDEX [IX_terminal_tokens_status] ON dbo.terminal_tokens ([status]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_terminal_tokens_created_at')
  CREATE INDEX [IX_terminal_tokens_created_at] ON dbo.terminal_tokens ([created_at]);
GO

/* ---- user_roles ---- */
IF OBJECT_ID('dbo.user_roles', 'U') IS NULL
CREATE TABLE dbo.user_roles (
  [id] UNIQUEIDENTIFIER DEFAULT NEWID() NOT NULL,
  [user_id] UNIQUEIDENTIFIER,
  [role] NVARCHAR(40),
  [created_at] DATETIME2(3) DEFAULT SYSUTCDATETIME() NOT NULL,
  [is_synced] BIT DEFAULT 0,
  [sync_status] NVARCHAR(40) DEFAULT N'pending',
  [row_version] INT DEFAULT 0,
  [sync_attempts] INT DEFAULT 0,
  [last_error_at] DATETIME2(3),
  [client_transaction_id] NVARCHAR(120),
  CONSTRAINT [PK_user_roles] PRIMARY KEY ([id])
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_user_roles_created_at')
  CREATE INDEX [IX_user_roles_created_at] ON dbo.user_roles ([created_at]);
GO

/* ---- whatsapp_queue ---- */
IF OBJECT_ID('dbo.whatsapp_queue', 'U') IS NULL
CREATE TABLE dbo.whatsapp_queue (
  [id] UNIQUEIDENTIFIER DEFAULT NEWID() NOT NULL,
  [phone_number_id] NVARCHAR(400) DEFAULT N'' NOT NULL,
  [recipient] NVARCHAR(MAX),
  [body] NVARCHAR(MAX) DEFAULT N'' NOT NULL,
  [reference] NVARCHAR(MAX),
  [store_id] NVARCHAR(400),
  [status] NVARCHAR(MAX) DEFAULT N'QUEUED' NOT NULL,
  [error] NVARCHAR(MAX),
  [queued_at] DATETIME2(3) DEFAULT SYSUTCDATETIME() NOT NULL,
  [sent_at] DATETIME2(3),
  [created_at] DATETIME2(3) DEFAULT SYSUTCDATETIME() NOT NULL,
  [updated_at] DATETIME2(3) DEFAULT SYSUTCDATETIME() NOT NULL,
  [is_synced] BIT DEFAULT 0,
  [sync_status] NVARCHAR(40) DEFAULT N'pending',
  [row_version] INT DEFAULT 0,
  [sync_attempts] INT DEFAULT 0,
  [last_error_at] DATETIME2(3),
  [client_transaction_id] NVARCHAR(120),
  CONSTRAINT [PK_whatsapp_queue] PRIMARY KEY ([id])
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_whatsapp_queue_store_id')
  CREATE INDEX [IX_whatsapp_queue_store_id] ON dbo.whatsapp_queue ([store_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_whatsapp_queue_status')
  CREATE INDEX [IX_whatsapp_queue_status] ON dbo.whatsapp_queue ([status]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_whatsapp_queue_created_at')
  CREATE INDEX [IX_whatsapp_queue_created_at] ON dbo.whatsapp_queue ([created_at]);
GO

/* ---- column top-up for tables that already exist ---- */
IF OBJECT_ID('dbo.activity_events', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.activity_events', 'id') IS NULL ALTER TABLE dbo.activity_events ADD [id] UNIQUEIDENTIFIER DEFAULT NEWID();
  IF COL_LENGTH('dbo.activity_events', 'event_type') IS NULL ALTER TABLE dbo.activity_events ADD [event_type] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.activity_events', 'severity') IS NULL ALTER TABLE dbo.activity_events ADD [severity] NVARCHAR(MAX) DEFAULT N'info';
  IF COL_LENGTH('dbo.activity_events', 'title') IS NULL ALTER TABLE dbo.activity_events ADD [title] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.activity_events', 'message') IS NULL ALTER TABLE dbo.activity_events ADD [message] NVARCHAR(MAX) DEFAULT N'';
  IF COL_LENGTH('dbo.activity_events', 'actor_id') IS NULL ALTER TABLE dbo.activity_events ADD [actor_id] NVARCHAR(400);
  IF COL_LENGTH('dbo.activity_events', 'actor_name') IS NULL ALTER TABLE dbo.activity_events ADD [actor_name] NVARCHAR(400);
  IF COL_LENGTH('dbo.activity_events', 'actor_role') IS NULL ALTER TABLE dbo.activity_events ADD [actor_role] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.activity_events', 'terminal_id') IS NULL ALTER TABLE dbo.activity_events ADD [terminal_id] NVARCHAR(400);
  IF COL_LENGTH('dbo.activity_events', 'terminal_name') IS NULL ALTER TABLE dbo.activity_events ADD [terminal_name] NVARCHAR(400);
  IF COL_LENGTH('dbo.activity_events', 'store_id') IS NULL ALTER TABLE dbo.activity_events ADD [store_id] NVARCHAR(400);
  IF COL_LENGTH('dbo.activity_events', 'entity_type') IS NULL ALTER TABLE dbo.activity_events ADD [entity_type] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.activity_events', 'entity_id') IS NULL ALTER TABLE dbo.activity_events ADD [entity_id] NVARCHAR(400);
  IF COL_LENGTH('dbo.activity_events', 'amount') IS NULL ALTER TABLE dbo.activity_events ADD [amount] DECIMAL(18,4);
  IF COL_LENGTH('dbo.activity_events', 'meta') IS NULL ALTER TABLE dbo.activity_events ADD [meta] NVARCHAR(MAX) DEFAULT N'{}';
  IF COL_LENGTH('dbo.activity_events', 'whatsapp_status') IS NULL ALTER TABLE dbo.activity_events ADD [whatsapp_status] NVARCHAR(MAX) DEFAULT N'skipped';
  IF COL_LENGTH('dbo.activity_events', 'whatsapp_error') IS NULL ALTER TABLE dbo.activity_events ADD [whatsapp_error] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.activity_events', 'client_event_id') IS NULL ALTER TABLE dbo.activity_events ADD [client_event_id] NVARCHAR(400);
  IF COL_LENGTH('dbo.activity_events', 'created_at') IS NULL ALTER TABLE dbo.activity_events ADD [created_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.activity_events', 'is_synced') IS NULL ALTER TABLE dbo.activity_events ADD [is_synced] BIT DEFAULT 0;
  IF COL_LENGTH('dbo.activity_events', 'sync_status') IS NULL ALTER TABLE dbo.activity_events ADD [sync_status] NVARCHAR(40) DEFAULT N'pending';
  IF COL_LENGTH('dbo.activity_events', 'row_version') IS NULL ALTER TABLE dbo.activity_events ADD [row_version] INT DEFAULT 0;
  IF COL_LENGTH('dbo.activity_events', 'sync_attempts') IS NULL ALTER TABLE dbo.activity_events ADD [sync_attempts] INT DEFAULT 0;
  IF COL_LENGTH('dbo.activity_events', 'last_error_at') IS NULL ALTER TABLE dbo.activity_events ADD [last_error_at] DATETIME2(3);
  IF COL_LENGTH('dbo.activity_events', 'client_transaction_id') IS NULL ALTER TABLE dbo.activity_events ADD [client_transaction_id] NVARCHAR(120);
END
GO
IF OBJECT_ID('dbo.app_users', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.app_users', 'id') IS NULL ALTER TABLE dbo.app_users ADD [id] UNIQUEIDENTIFIER DEFAULT NEWID();
  IF COL_LENGTH('dbo.app_users', 'user_id') IS NULL ALTER TABLE dbo.app_users ADD [user_id] NVARCHAR(400);
  IF COL_LENGTH('dbo.app_users', 'full_name') IS NULL ALTER TABLE dbo.app_users ADD [full_name] NVARCHAR(400);
  IF COL_LENGTH('dbo.app_users', 'email') IS NULL ALTER TABLE dbo.app_users ADD [email] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.app_users', 'role') IS NULL ALTER TABLE dbo.app_users ADD [role] NVARCHAR(40) DEFAULT N'staff';
  IF COL_LENGTH('dbo.app_users', 'store_id') IS NULL ALTER TABLE dbo.app_users ADD [store_id] NVARCHAR(400);
  IF COL_LENGTH('dbo.app_users', 'is_active') IS NULL ALTER TABLE dbo.app_users ADD [is_active] BIT DEFAULT 1;
  IF COL_LENGTH('dbo.app_users', 'permissions') IS NULL ALTER TABLE dbo.app_users ADD [permissions] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.app_users', 'pin_hash') IS NULL ALTER TABLE dbo.app_users ADD [pin_hash] NVARCHAR(MAX) DEFAULT N'';
  IF COL_LENGTH('dbo.app_users', 'auth_user_id') IS NULL ALTER TABLE dbo.app_users ADD [auth_user_id] UNIQUEIDENTIFIER;
  IF COL_LENGTH('dbo.app_users', 'last_login_at') IS NULL ALTER TABLE dbo.app_users ADD [last_login_at] DATETIME2(3);
  IF COL_LENGTH('dbo.app_users', 'created_at') IS NULL ALTER TABLE dbo.app_users ADD [created_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.app_users', 'updated_at') IS NULL ALTER TABLE dbo.app_users ADD [updated_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.app_users', 'role_slug') IS NULL ALTER TABLE dbo.app_users ADD [role_slug] NVARCHAR(400);
  IF COL_LENGTH('dbo.app_users', 'pin_length') IS NULL ALTER TABLE dbo.app_users ADD [pin_length] SMALLINT DEFAULT 6;
  IF COL_LENGTH('dbo.app_users', 'row_version') IS NULL ALTER TABLE dbo.app_users ADD [row_version] INT DEFAULT 1;
  IF COL_LENGTH('dbo.app_users', 'is_synced') IS NULL ALTER TABLE dbo.app_users ADD [is_synced] BIT DEFAULT 0;
  IF COL_LENGTH('dbo.app_users', 'sync_status') IS NULL ALTER TABLE dbo.app_users ADD [sync_status] NVARCHAR(40) DEFAULT N'pending';
  IF COL_LENGTH('dbo.app_users', 'sync_attempts') IS NULL ALTER TABLE dbo.app_users ADD [sync_attempts] INT DEFAULT 0;
  IF COL_LENGTH('dbo.app_users', 'last_error_at') IS NULL ALTER TABLE dbo.app_users ADD [last_error_at] DATETIME2(3);
  IF COL_LENGTH('dbo.app_users', 'client_transaction_id') IS NULL ALTER TABLE dbo.app_users ADD [client_transaction_id] NVARCHAR(120);
END
GO
IF OBJECT_ID('dbo.audit_logs', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.audit_logs', 'id') IS NULL ALTER TABLE dbo.audit_logs ADD [id] UNIQUEIDENTIFIER DEFAULT NEWID();
  IF COL_LENGTH('dbo.audit_logs', 'user_name') IS NULL ALTER TABLE dbo.audit_logs ADD [user_name] NVARCHAR(400);
  IF COL_LENGTH('dbo.audit_logs', 'action_category') IS NULL ALTER TABLE dbo.audit_logs ADD [action_category] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.audit_logs', 'action_name') IS NULL ALTER TABLE dbo.audit_logs ADD [action_name] NVARCHAR(400);
  IF COL_LENGTH('dbo.audit_logs', 'target_module') IS NULL ALTER TABLE dbo.audit_logs ADD [target_module] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.audit_logs', 'details') IS NULL ALTER TABLE dbo.audit_logs ADD [details] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.audit_logs', 'created_at') IS NULL ALTER TABLE dbo.audit_logs ADD [created_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.audit_logs', 'user_id') IS NULL ALTER TABLE dbo.audit_logs ADD [user_id] NVARCHAR(400);
  IF COL_LENGTH('dbo.audit_logs', 'action') IS NULL ALTER TABLE dbo.audit_logs ADD [action] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.audit_logs', 'entity') IS NULL ALTER TABLE dbo.audit_logs ADD [entity] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.audit_logs', 'before_state') IS NULL ALTER TABLE dbo.audit_logs ADD [before_state] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.audit_logs', 'after_state') IS NULL ALTER TABLE dbo.audit_logs ADD [after_state] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.audit_logs', 'is_synced') IS NULL ALTER TABLE dbo.audit_logs ADD [is_synced] BIT DEFAULT 0;
  IF COL_LENGTH('dbo.audit_logs', 'sync_status') IS NULL ALTER TABLE dbo.audit_logs ADD [sync_status] NVARCHAR(40) DEFAULT N'pending';
  IF COL_LENGTH('dbo.audit_logs', 'row_version') IS NULL ALTER TABLE dbo.audit_logs ADD [row_version] INT DEFAULT 0;
  IF COL_LENGTH('dbo.audit_logs', 'sync_attempts') IS NULL ALTER TABLE dbo.audit_logs ADD [sync_attempts] INT DEFAULT 0;
  IF COL_LENGTH('dbo.audit_logs', 'last_error_at') IS NULL ALTER TABLE dbo.audit_logs ADD [last_error_at] DATETIME2(3);
  IF COL_LENGTH('dbo.audit_logs', 'client_transaction_id') IS NULL ALTER TABLE dbo.audit_logs ADD [client_transaction_id] NVARCHAR(120);
END
GO
IF OBJECT_ID('dbo.booking_payments', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.booking_payments', 'id') IS NULL ALTER TABLE dbo.booking_payments ADD [id] UNIQUEIDENTIFIER DEFAULT NEWID();
  IF COL_LENGTH('dbo.booking_payments', 'booking_id') IS NULL ALTER TABLE dbo.booking_payments ADD [booking_id] UNIQUEIDENTIFIER;
  IF COL_LENGTH('dbo.booking_payments', 'amount') IS NULL ALTER TABLE dbo.booking_payments ADD [amount] DECIMAL(18,4) DEFAULT 0;
  IF COL_LENGTH('dbo.booking_payments', 'method') IS NULL ALTER TABLE dbo.booking_payments ADD [method] NVARCHAR(MAX) DEFAULT N'cash';
  IF COL_LENGTH('dbo.booking_payments', 'cashier') IS NULL ALTER TABLE dbo.booking_payments ADD [cashier] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.booking_payments', 'paid_at') IS NULL ALTER TABLE dbo.booking_payments ADD [paid_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.booking_payments', 'created_at') IS NULL ALTER TABLE dbo.booking_payments ADD [created_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.booking_payments', 'row_version') IS NULL ALTER TABLE dbo.booking_payments ADD [row_version] INT DEFAULT 1;
  IF COL_LENGTH('dbo.booking_payments', 'is_synced') IS NULL ALTER TABLE dbo.booking_payments ADD [is_synced] BIT DEFAULT 0;
  IF COL_LENGTH('dbo.booking_payments', 'sync_status') IS NULL ALTER TABLE dbo.booking_payments ADD [sync_status] NVARCHAR(40) DEFAULT N'pending';
  IF COL_LENGTH('dbo.booking_payments', 'sync_attempts') IS NULL ALTER TABLE dbo.booking_payments ADD [sync_attempts] INT DEFAULT 0;
  IF COL_LENGTH('dbo.booking_payments', 'last_error_at') IS NULL ALTER TABLE dbo.booking_payments ADD [last_error_at] DATETIME2(3);
  IF COL_LENGTH('dbo.booking_payments', 'client_transaction_id') IS NULL ALTER TABLE dbo.booking_payments ADD [client_transaction_id] NVARCHAR(120);
  IF COL_LENGTH('dbo.booking_payments', 'status') IS NULL ALTER TABLE dbo.booking_payments ADD [status] NVARCHAR(20) DEFAULT N'settled';
  IF COL_LENGTH('dbo.booking_payments', 'reference') IS NULL ALTER TABLE dbo.booking_payments ADD [reference] NVARCHAR(200);
  IF COL_LENGTH('dbo.booking_payments', 'client_payment_id') IS NULL ALTER TABLE dbo.booking_payments ADD [client_payment_id] NVARCHAR(120);
  IF COL_LENGTH('dbo.booking_payments', 'kind') IS NULL ALTER TABLE dbo.booking_payments ADD [kind] NVARCHAR(20) DEFAULT N'payment';
  IF COL_LENGTH('dbo.booking_payments', 'refund_reason') IS NULL ALTER TABLE dbo.booking_payments ADD [refund_reason] NVARCHAR(400);
  IF COL_LENGTH('dbo.booking_payments', 'refunds_payment_id') IS NULL ALTER TABLE dbo.booking_payments ADD [refunds_payment_id] UNIQUEIDENTIFIER;
  IF COL_LENGTH('dbo.booking_payments', 'change_given') IS NULL ALTER TABLE dbo.booking_payments ADD [change_given] DECIMAL(18,4) DEFAULT 0;
END
GO
IF OBJECT_ID('dbo.bookings', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.bookings', 'id') IS NULL ALTER TABLE dbo.bookings ADD [id] UNIQUEIDENTIFIER DEFAULT NEWID();
  IF COL_LENGTH('dbo.bookings', 'ref') IS NULL ALTER TABLE dbo.bookings ADD [ref] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.bookings', 'store_id') IS NULL ALTER TABLE dbo.bookings ADD [store_id] NVARCHAR(400);
  IF COL_LENGTH('dbo.bookings', 'shift_id') IS NULL ALTER TABLE dbo.bookings ADD [shift_id] NVARCHAR(400);
  IF COL_LENGTH('dbo.bookings', 'customer_name') IS NULL ALTER TABLE dbo.bookings ADD [customer_name] NVARCHAR(400) DEFAULT N'';
  IF COL_LENGTH('dbo.bookings', 'customer_phone') IS NULL ALTER TABLE dbo.bookings ADD [customer_phone] NVARCHAR(400) DEFAULT N'';
  IF COL_LENGTH('dbo.bookings', 'member_id') IS NULL ALTER TABLE dbo.bookings ADD [member_id] UNIQUEIDENTIFIER;
  IF COL_LENGTH('dbo.bookings', 'service_type_id') IS NULL ALTER TABLE dbo.bookings ADD [service_type_id] NVARCHAR(400);
  IF COL_LENGTH('dbo.bookings', 'service_name') IS NULL ALTER TABLE dbo.bookings ADD [service_name] NVARCHAR(400);
  IF COL_LENGTH('dbo.bookings', 'service_fee') IS NULL ALTER TABLE dbo.bookings ADD [service_fee] DECIMAL(18,4) DEFAULT 0;
  IF COL_LENGTH('dbo.bookings', 'payment_timing') IS NULL ALTER TABLE dbo.bookings ADD [payment_timing] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.bookings', 'lines') IS NULL ALTER TABLE dbo.bookings ADD [lines] NVARCHAR(MAX) DEFAULT N'[]';
  IF COL_LENGTH('dbo.bookings', 'subtotal') IS NULL ALTER TABLE dbo.bookings ADD [subtotal] DECIMAL(18,4) DEFAULT 0;
  IF COL_LENGTH('dbo.bookings', 'discount') IS NULL ALTER TABLE dbo.bookings ADD [discount] DECIMAL(18,4) DEFAULT 0;
  IF COL_LENGTH('dbo.bookings', 'tax') IS NULL ALTER TABLE dbo.bookings ADD [tax] DECIMAL(18,4) DEFAULT 0;
  IF COL_LENGTH('dbo.bookings', 'total') IS NULL ALTER TABLE dbo.bookings ADD [total] DECIMAL(18,4) DEFAULT 0;
  IF COL_LENGTH('dbo.bookings', 'paid') IS NULL ALTER TABLE dbo.bookings ADD [paid] DECIMAL(18,4) DEFAULT 0;
  IF COL_LENGTH('dbo.bookings', 'due_date') IS NULL ALTER TABLE dbo.bookings ADD [due_date] DATE;
  IF COL_LENGTH('dbo.bookings', 'note') IS NULL ALTER TABLE dbo.bookings ADD [note] NVARCHAR(MAX) DEFAULT N'';
  IF COL_LENGTH('dbo.bookings', 'cashier') IS NULL ALTER TABLE dbo.bookings ADD [cashier] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.bookings', 'status') IS NULL ALTER TABLE dbo.bookings ADD [status] NVARCHAR(MAX) DEFAULT N'active';
  IF COL_LENGTH('dbo.bookings', 'sale_receipt_no') IS NULL ALTER TABLE dbo.bookings ADD [sale_receipt_no] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.bookings', 'closed_at') IS NULL ALTER TABLE dbo.bookings ADD [closed_at] DATETIME2(3);
  IF COL_LENGTH('dbo.bookings', 'racket_model') IS NULL ALTER TABLE dbo.bookings ADD [racket_model] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.bookings', 'string_type') IS NULL ALTER TABLE dbo.bookings ADD [string_type] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.bookings', 'tension_main') IS NULL ALTER TABLE dbo.bookings ADD [tension_main] DECIMAL(18,4);
  IF COL_LENGTH('dbo.bookings', 'tension_cross') IS NULL ALTER TABLE dbo.bookings ADD [tension_cross] DECIMAL(18,4);
  IF COL_LENGTH('dbo.bookings', 'tension_unit') IS NULL ALTER TABLE dbo.bookings ADD [tension_unit] NVARCHAR(MAX) DEFAULT N'lb';
  IF COL_LENGTH('dbo.bookings', 'grommet_notes') IS NULL ALTER TABLE dbo.bookings ADD [grommet_notes] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.bookings', 'job_notes') IS NULL ALTER TABLE dbo.bookings ADD [job_notes] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.bookings', 'dropped_off_at') IS NULL ALTER TABLE dbo.bookings ADD [dropped_off_at] DATETIME2(3);
  IF COL_LENGTH('dbo.bookings', 'promised_at') IS NULL ALTER TABLE dbo.bookings ADD [promised_at] DATETIME2(3);
  IF COL_LENGTH('dbo.bookings', 'job_status') IS NULL ALTER TABLE dbo.bookings ADD [job_status] NVARCHAR(MAX) DEFAULT N'received';
  IF COL_LENGTH('dbo.bookings', 'job_status_by') IS NULL ALTER TABLE dbo.bookings ADD [job_status_by] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.bookings', 'job_status_at') IS NULL ALTER TABLE dbo.bookings ADD [job_status_at] DATETIME2(3);
  IF COL_LENGTH('dbo.bookings', 'notify_whatsapp') IS NULL ALTER TABLE dbo.bookings ADD [notify_whatsapp] BIT DEFAULT 0;
  IF COL_LENGTH('dbo.bookings', 'created_at') IS NULL ALTER TABLE dbo.bookings ADD [created_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.bookings', 'updated_at') IS NULL ALTER TABLE dbo.bookings ADD [updated_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.bookings', 'tag_id') IS NULL ALTER TABLE dbo.bookings ADD [tag_id] NVARCHAR(400);
  IF COL_LENGTH('dbo.bookings', 'intake_note') IS NULL ALTER TABLE dbo.bookings ADD [intake_note] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.bookings', 'string_origin') IS NULL ALTER TABLE dbo.bookings ADD [string_origin] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.bookings', 'string_source_product_id') IS NULL ALTER TABLE dbo.bookings ADD [string_source_product_id] UNIQUEIDENTIFIER;
  IF COL_LENGTH('dbo.bookings', 'grip_product_id') IS NULL ALTER TABLE dbo.bookings ADD [grip_product_id] UNIQUEIDENTIFIER;
  IF COL_LENGTH('dbo.bookings', 'charges') IS NULL ALTER TABLE dbo.bookings ADD [charges] NVARCHAR(MAX) DEFAULT N'{}';
  IF COL_LENGTH('dbo.bookings', 'technician') IS NULL ALTER TABLE dbo.bookings ADD [technician] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.bookings', 'liability_accepted') IS NULL ALTER TABLE dbo.bookings ADD [liability_accepted] BIT DEFAULT 0;
  IF COL_LENGTH('dbo.bookings', 'incident_note') IS NULL ALTER TABLE dbo.bookings ADD [incident_note] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.bookings', 'cancel_reason') IS NULL ALTER TABLE dbo.bookings ADD [cancel_reason] NVARCHAR(400);
  IF COL_LENGTH('dbo.bookings', 'cancelled_by') IS NULL ALTER TABLE dbo.bookings ADD [cancelled_by] NVARCHAR(200);
  IF COL_LENGTH('dbo.bookings', 'cancelled_at') IS NULL ALTER TABLE dbo.bookings ADD [cancelled_at] DATETIME2(3);
  IF COL_LENGTH('dbo.bookings', 'cancelled_terminal') IS NULL ALTER TABLE dbo.bookings ADD [cancelled_terminal] NVARCHAR(120);
  IF COL_LENGTH('dbo.bookings', 'cancel_money_action') IS NULL ALTER TABLE dbo.bookings ADD [cancel_money_action] NVARCHAR(20);
  IF COL_LENGTH('dbo.bookings', 'row_version') IS NULL ALTER TABLE dbo.bookings ADD [row_version] INT DEFAULT 1;
  IF COL_LENGTH('dbo.bookings', 'is_synced') IS NULL ALTER TABLE dbo.bookings ADD [is_synced] BIT DEFAULT 0;
  IF COL_LENGTH('dbo.bookings', 'sync_status') IS NULL ALTER TABLE dbo.bookings ADD [sync_status] NVARCHAR(40) DEFAULT N'pending';
  IF COL_LENGTH('dbo.bookings', 'sync_attempts') IS NULL ALTER TABLE dbo.bookings ADD [sync_attempts] INT DEFAULT 0;
  IF COL_LENGTH('dbo.bookings', 'last_error_at') IS NULL ALTER TABLE dbo.bookings ADD [last_error_at] DATETIME2(3);
  IF COL_LENGTH('dbo.bookings', 'client_transaction_id') IS NULL ALTER TABLE dbo.bookings ADD [client_transaction_id] NVARCHAR(120);
END
GO
IF OBJECT_ID('dbo.branch_telemetry', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.branch_telemetry', 'terminal_id') IS NULL ALTER TABLE dbo.branch_telemetry ADD [terminal_id] NVARCHAR(400);
  IF COL_LENGTH('dbo.branch_telemetry', 'store_id') IS NULL ALTER TABLE dbo.branch_telemetry ADD [store_id] NVARCHAR(400);
  IF COL_LENGTH('dbo.branch_telemetry', 'terminal_name') IS NULL ALTER TABLE dbo.branch_telemetry ADD [terminal_name] NVARCHAR(400);
  IF COL_LENGTH('dbo.branch_telemetry', 'staff_name') IS NULL ALTER TABLE dbo.branch_telemetry ADD [staff_name] NVARCHAR(400);
  IF COL_LENGTH('dbo.branch_telemetry', 'staff_role') IS NULL ALTER TABLE dbo.branch_telemetry ADD [staff_role] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.branch_telemetry', 'db_mode') IS NULL ALTER TABLE dbo.branch_telemetry ADD [db_mode] NVARCHAR(MAX) DEFAULT N'online';
  IF COL_LENGTH('dbo.branch_telemetry', 'connection_status') IS NULL ALTER TABLE dbo.branch_telemetry ADD [connection_status] NVARCHAR(MAX) DEFAULT N'online';
  IF COL_LENGTH('dbo.branch_telemetry', 'storage_engine') IS NULL ALTER TABLE dbo.branch_telemetry ADD [storage_engine] NVARCHAR(MAX) DEFAULT N'cloud';
  IF COL_LENGTH('dbo.branch_telemetry', 'pending_count') IS NULL ALTER TABLE dbo.branch_telemetry ADD [pending_count] INT DEFAULT 0;
  IF COL_LENGTH('dbo.branch_telemetry', 'conflict_count') IS NULL ALTER TABLE dbo.branch_telemetry ADD [conflict_count] INT DEFAULT 0;
  IF COL_LENGTH('dbo.branch_telemetry', 'last_synced_at') IS NULL ALTER TABLE dbo.branch_telemetry ADD [last_synced_at] DATETIME2(3);
  IF COL_LENGTH('dbo.branch_telemetry', 'app_version') IS NULL ALTER TABLE dbo.branch_telemetry ADD [app_version] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.branch_telemetry', 'platform') IS NULL ALTER TABLE dbo.branch_telemetry ADD [platform] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.branch_telemetry', 'last_seen_at') IS NULL ALTER TABLE dbo.branch_telemetry ADD [last_seen_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.branch_telemetry', 'created_at') IS NULL ALTER TABLE dbo.branch_telemetry ADD [created_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.branch_telemetry', 'updated_at') IS NULL ALTER TABLE dbo.branch_telemetry ADD [updated_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.branch_telemetry', 'branch_id') IS NULL ALTER TABLE dbo.branch_telemetry ADD [branch_id] NVARCHAR(400);
  IF COL_LENGTH('dbo.branch_telemetry', 'pending_queue_count') IS NULL ALTER TABLE dbo.branch_telemetry ADD [pending_queue_count] INT;
  IF COL_LENGTH('dbo.branch_telemetry', 'last_ping') IS NULL ALTER TABLE dbo.branch_telemetry ADD [last_ping] DATETIME2(3);
  IF COL_LENGTH('dbo.branch_telemetry', 'status') IS NULL ALTER TABLE dbo.branch_telemetry ADD [status] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.branch_telemetry', 'is_synced') IS NULL ALTER TABLE dbo.branch_telemetry ADD [is_synced] BIT DEFAULT 0;
  IF COL_LENGTH('dbo.branch_telemetry', 'sync_status') IS NULL ALTER TABLE dbo.branch_telemetry ADD [sync_status] NVARCHAR(40) DEFAULT N'pending';
  IF COL_LENGTH('dbo.branch_telemetry', 'row_version') IS NULL ALTER TABLE dbo.branch_telemetry ADD [row_version] INT DEFAULT 0;
  IF COL_LENGTH('dbo.branch_telemetry', 'sync_attempts') IS NULL ALTER TABLE dbo.branch_telemetry ADD [sync_attempts] INT DEFAULT 0;
  IF COL_LENGTH('dbo.branch_telemetry', 'last_error_at') IS NULL ALTER TABLE dbo.branch_telemetry ADD [last_error_at] DATETIME2(3);
  IF COL_LENGTH('dbo.branch_telemetry', 'client_transaction_id') IS NULL ALTER TABLE dbo.branch_telemetry ADD [client_transaction_id] NVARCHAR(120);
END
GO
IF OBJECT_ID('dbo.cashiers', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.cashiers', 'id') IS NULL ALTER TABLE dbo.cashiers ADD [id] UNIQUEIDENTIFIER DEFAULT NEWID();
  IF COL_LENGTH('dbo.cashiers', 'username') IS NULL ALTER TABLE dbo.cashiers ADD [username] NVARCHAR(400);
  IF COL_LENGTH('dbo.cashiers', 'full_name') IS NULL ALTER TABLE dbo.cashiers ADD [full_name] NVARCHAR(400) DEFAULT N'';
  IF COL_LENGTH('dbo.cashiers', 'pin_hash') IS NULL ALTER TABLE dbo.cashiers ADD [pin_hash] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.cashiers', 'store_id') IS NULL ALTER TABLE dbo.cashiers ADD [store_id] NVARCHAR(400);
  IF COL_LENGTH('dbo.cashiers', 'permissions') IS NULL ALTER TABLE dbo.cashiers ADD [permissions] NVARCHAR(MAX) DEFAULT N'{}';
  IF COL_LENGTH('dbo.cashiers', 'is_active') IS NULL ALTER TABLE dbo.cashiers ADD [is_active] BIT DEFAULT 1;
  IF COL_LENGTH('dbo.cashiers', 'last_login_at') IS NULL ALTER TABLE dbo.cashiers ADD [last_login_at] DATETIME2(3);
  IF COL_LENGTH('dbo.cashiers', 'created_at') IS NULL ALTER TABLE dbo.cashiers ADD [created_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.cashiers', 'updated_at') IS NULL ALTER TABLE dbo.cashiers ADD [updated_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.cashiers', 'role_slug') IS NULL ALTER TABLE dbo.cashiers ADD [role_slug] NVARCHAR(400);
  IF COL_LENGTH('dbo.cashiers', 'is_synced') IS NULL ALTER TABLE dbo.cashiers ADD [is_synced] BIT DEFAULT 0;
  IF COL_LENGTH('dbo.cashiers', 'sync_status') IS NULL ALTER TABLE dbo.cashiers ADD [sync_status] NVARCHAR(40) DEFAULT N'pending';
  IF COL_LENGTH('dbo.cashiers', 'row_version') IS NULL ALTER TABLE dbo.cashiers ADD [row_version] INT DEFAULT 0;
  IF COL_LENGTH('dbo.cashiers', 'sync_attempts') IS NULL ALTER TABLE dbo.cashiers ADD [sync_attempts] INT DEFAULT 0;
  IF COL_LENGTH('dbo.cashiers', 'last_error_at') IS NULL ALTER TABLE dbo.cashiers ADD [last_error_at] DATETIME2(3);
  IF COL_LENGTH('dbo.cashiers', 'client_transaction_id') IS NULL ALTER TABLE dbo.cashiers ADD [client_transaction_id] NVARCHAR(120);
END
GO
IF OBJECT_ID('dbo.coupon_campaigns', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.coupon_campaigns', 'id') IS NULL ALTER TABLE dbo.coupon_campaigns ADD [id] UNIQUEIDENTIFIER DEFAULT NEWID();
  IF COL_LENGTH('dbo.coupon_campaigns', 'name') IS NULL ALTER TABLE dbo.coupon_campaigns ADD [name] NVARCHAR(400);
  IF COL_LENGTH('dbo.coupon_campaigns', 'slug') IS NULL ALTER TABLE dbo.coupon_campaigns ADD [slug] NVARCHAR(400);
  IF COL_LENGTH('dbo.coupon_campaigns', 'discount_type') IS NULL ALTER TABLE dbo.coupon_campaigns ADD [discount_type] NVARCHAR(MAX) DEFAULT N'PERCENTAGE';
  IF COL_LENGTH('dbo.coupon_campaigns', 'discount_value') IS NULL ALTER TABLE dbo.coupon_campaigns ADD [discount_value] DECIMAL(18,4) DEFAULT 0;
  IF COL_LENGTH('dbo.coupon_campaigns', 'scope') IS NULL ALTER TABLE dbo.coupon_campaigns ADD [scope] NVARCHAR(MAX) DEFAULT N'BILL';
  IF COL_LENGTH('dbo.coupon_campaigns', 'scope_value') IS NULL ALTER TABLE dbo.coupon_campaigns ADD [scope_value] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.coupon_campaigns', 'max_claims') IS NULL ALTER TABLE dbo.coupon_campaigns ADD [max_claims] INT;
  IF COL_LENGTH('dbo.coupon_campaigns', 'max_per_member') IS NULL ALTER TABLE dbo.coupon_campaigns ADD [max_per_member] INT DEFAULT 1;
  IF COL_LENGTH('dbo.coupon_campaigns', 'claims_count') IS NULL ALTER TABLE dbo.coupon_campaigns ADD [claims_count] INT DEFAULT 0;
  IF COL_LENGTH('dbo.coupon_campaigns', 'starts_at') IS NULL ALTER TABLE dbo.coupon_campaigns ADD [starts_at] DATETIME2(3);
  IF COL_LENGTH('dbo.coupon_campaigns', 'expires_at') IS NULL ALTER TABLE dbo.coupon_campaigns ADD [expires_at] DATETIME2(3);
  IF COL_LENGTH('dbo.coupon_campaigns', 'is_active') IS NULL ALTER TABLE dbo.coupon_campaigns ADD [is_active] BIT DEFAULT 1;
  IF COL_LENGTH('dbo.coupon_campaigns', 'is_welcome') IS NULL ALTER TABLE dbo.coupon_campaigns ADD [is_welcome] BIT DEFAULT 0;
  IF COL_LENGTH('dbo.coupon_campaigns', 'created_at') IS NULL ALTER TABLE dbo.coupon_campaigns ADD [created_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.coupon_campaigns', 'updated_at') IS NULL ALTER TABLE dbo.coupon_campaigns ADD [updated_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.coupon_campaigns', 'row_version') IS NULL ALTER TABLE dbo.coupon_campaigns ADD [row_version] INT DEFAULT 1;
  IF COL_LENGTH('dbo.coupon_campaigns', 'is_synced') IS NULL ALTER TABLE dbo.coupon_campaigns ADD [is_synced] BIT DEFAULT 0;
  IF COL_LENGTH('dbo.coupon_campaigns', 'sync_status') IS NULL ALTER TABLE dbo.coupon_campaigns ADD [sync_status] NVARCHAR(40) DEFAULT N'pending';
  IF COL_LENGTH('dbo.coupon_campaigns', 'sync_attempts') IS NULL ALTER TABLE dbo.coupon_campaigns ADD [sync_attempts] INT DEFAULT 0;
  IF COL_LENGTH('dbo.coupon_campaigns', 'last_error_at') IS NULL ALTER TABLE dbo.coupon_campaigns ADD [last_error_at] DATETIME2(3);
  IF COL_LENGTH('dbo.coupon_campaigns', 'client_transaction_id') IS NULL ALTER TABLE dbo.coupon_campaigns ADD [client_transaction_id] NVARCHAR(120);
END
GO
IF OBJECT_ID('dbo.coupon_events', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.coupon_events', 'id') IS NULL ALTER TABLE dbo.coupon_events ADD [id] UNIQUEIDENTIFIER DEFAULT NEWID();
  IF COL_LENGTH('dbo.coupon_events', 'event_type') IS NULL ALTER TABLE dbo.coupon_events ADD [event_type] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.coupon_events', 'campaign_id') IS NULL ALTER TABLE dbo.coupon_events ADD [campaign_id] UNIQUEIDENTIFIER;
  IF COL_LENGTH('dbo.coupon_events', 'campaign_name') IS NULL ALTER TABLE dbo.coupon_events ADD [campaign_name] NVARCHAR(400);
  IF COL_LENGTH('dbo.coupon_events', 'voucher_token') IS NULL ALTER TABLE dbo.coupon_events ADD [voucher_token] NVARCHAR(400);
  IF COL_LENGTH('dbo.coupon_events', 'member_id') IS NULL ALTER TABLE dbo.coupon_events ADD [member_id] UNIQUEIDENTIFIER;
  IF COL_LENGTH('dbo.coupon_events', 'member_phone') IS NULL ALTER TABLE dbo.coupon_events ADD [member_phone] NVARCHAR(400);
  IF COL_LENGTH('dbo.coupon_events', 'store_id') IS NULL ALTER TABLE dbo.coupon_events ADD [store_id] NVARCHAR(400);
  IF COL_LENGTH('dbo.coupon_events', 'terminal_id') IS NULL ALTER TABLE dbo.coupon_events ADD [terminal_id] NVARCHAR(400);
  IF COL_LENGTH('dbo.coupon_events', 'staff_name') IS NULL ALTER TABLE dbo.coupon_events ADD [staff_name] NVARCHAR(400);
  IF COL_LENGTH('dbo.coupon_events', 'staff_role') IS NULL ALTER TABLE dbo.coupon_events ADD [staff_role] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.coupon_events', 'sale_id') IS NULL ALTER TABLE dbo.coupon_events ADD [sale_id] NVARCHAR(400);
  IF COL_LENGTH('dbo.coupon_events', 'note') IS NULL ALTER TABLE dbo.coupon_events ADD [note] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.coupon_events', 'created_at') IS NULL ALTER TABLE dbo.coupon_events ADD [created_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.coupon_events', 'is_synced') IS NULL ALTER TABLE dbo.coupon_events ADD [is_synced] BIT DEFAULT 0;
  IF COL_LENGTH('dbo.coupon_events', 'sync_status') IS NULL ALTER TABLE dbo.coupon_events ADD [sync_status] NVARCHAR(40) DEFAULT N'pending';
  IF COL_LENGTH('dbo.coupon_events', 'row_version') IS NULL ALTER TABLE dbo.coupon_events ADD [row_version] INT DEFAULT 0;
  IF COL_LENGTH('dbo.coupon_events', 'sync_attempts') IS NULL ALTER TABLE dbo.coupon_events ADD [sync_attempts] INT DEFAULT 0;
  IF COL_LENGTH('dbo.coupon_events', 'last_error_at') IS NULL ALTER TABLE dbo.coupon_events ADD [last_error_at] DATETIME2(3);
  IF COL_LENGTH('dbo.coupon_events', 'client_transaction_id') IS NULL ALTER TABLE dbo.coupon_events ADD [client_transaction_id] NVARCHAR(120);
END
GO
IF OBJECT_ID('dbo.drawer_events', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.drawer_events', 'id') IS NULL ALTER TABLE dbo.drawer_events ADD [id] UNIQUEIDENTIFIER DEFAULT NEWID();
  IF COL_LENGTH('dbo.drawer_events', 'store_id') IS NULL ALTER TABLE dbo.drawer_events ADD [store_id] NVARCHAR(400);
  IF COL_LENGTH('dbo.drawer_events', 'terminal_id') IS NULL ALTER TABLE dbo.drawer_events ADD [terminal_id] NVARCHAR(400);
  IF COL_LENGTH('dbo.drawer_events', 'shift_id') IS NULL ALTER TABLE dbo.drawer_events ADD [shift_id] NVARCHAR(400);
  IF COL_LENGTH('dbo.drawer_events', 'staff_id') IS NULL ALTER TABLE dbo.drawer_events ADD [staff_id] NVARCHAR(400);
  IF COL_LENGTH('dbo.drawer_events', 'staff_name') IS NULL ALTER TABLE dbo.drawer_events ADD [staff_name] NVARCHAR(400);
  IF COL_LENGTH('dbo.drawer_events', 'role') IS NULL ALTER TABLE dbo.drawer_events ADD [role] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.drawer_events', 'reason') IS NULL ALTER TABLE dbo.drawer_events ADD [reason] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.drawer_events', 'note') IS NULL ALTER TABLE dbo.drawer_events ADD [note] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.drawer_events', 'approved_by') IS NULL ALTER TABLE dbo.drawer_events ADD [approved_by] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.drawer_events', 'created_at') IS NULL ALTER TABLE dbo.drawer_events ADD [created_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.drawer_events', 'is_synced') IS NULL ALTER TABLE dbo.drawer_events ADD [is_synced] BIT DEFAULT 0;
  IF COL_LENGTH('dbo.drawer_events', 'sync_status') IS NULL ALTER TABLE dbo.drawer_events ADD [sync_status] NVARCHAR(40) DEFAULT N'pending';
  IF COL_LENGTH('dbo.drawer_events', 'row_version') IS NULL ALTER TABLE dbo.drawer_events ADD [row_version] INT DEFAULT 0;
  IF COL_LENGTH('dbo.drawer_events', 'sync_attempts') IS NULL ALTER TABLE dbo.drawer_events ADD [sync_attempts] INT DEFAULT 0;
  IF COL_LENGTH('dbo.drawer_events', 'last_error_at') IS NULL ALTER TABLE dbo.drawer_events ADD [last_error_at] DATETIME2(3);
  IF COL_LENGTH('dbo.drawer_events', 'client_transaction_id') IS NULL ALTER TABLE dbo.drawer_events ADD [client_transaction_id] NVARCHAR(120);
END
GO
IF OBJECT_ID('dbo.held_orders', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.held_orders', 'id') IS NULL ALTER TABLE dbo.held_orders ADD [id] NVARCHAR(400) DEFAULT NEWID();
  IF COL_LENGTH('dbo.held_orders', 'label') IS NULL ALTER TABLE dbo.held_orders ADD [label] NVARCHAR(MAX) DEFAULT N'';
  IF COL_LENGTH('dbo.held_orders', 'store_id') IS NULL ALTER TABLE dbo.held_orders ADD [store_id] NVARCHAR(400);
  IF COL_LENGTH('dbo.held_orders', 'shift_id') IS NULL ALTER TABLE dbo.held_orders ADD [shift_id] NVARCHAR(400);
  IF COL_LENGTH('dbo.held_orders', 'held_by') IS NULL ALTER TABLE dbo.held_orders ADD [held_by] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.held_orders', 'total') IS NULL ALTER TABLE dbo.held_orders ADD [total] DECIMAL(18,4) DEFAULT 0;
  IF COL_LENGTH('dbo.held_orders', 'lines') IS NULL ALTER TABLE dbo.held_orders ADD [lines] NVARCHAR(MAX) DEFAULT N'[]';
  IF COL_LENGTH('dbo.held_orders', 'cart_discount') IS NULL ALTER TABLE dbo.held_orders ADD [cart_discount] DECIMAL(18,4) DEFAULT 0;
  IF COL_LENGTH('dbo.held_orders', 'cart_discount_type') IS NULL ALTER TABLE dbo.held_orders ADD [cart_discount_type] NVARCHAR(MAX) DEFAULT N'amount';
  IF COL_LENGTH('dbo.held_orders', 'exchange_ref') IS NULL ALTER TABLE dbo.held_orders ADD [exchange_ref] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.held_orders', 'member_id') IS NULL ALTER TABLE dbo.held_orders ADD [member_id] NVARCHAR(400);
  IF COL_LENGTH('dbo.held_orders', 'member_name') IS NULL ALTER TABLE dbo.held_orders ADD [member_name] NVARCHAR(400);
  IF COL_LENGTH('dbo.held_orders', 'coupon') IS NULL ALTER TABLE dbo.held_orders ADD [coupon] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.held_orders', 'note') IS NULL ALTER TABLE dbo.held_orders ADD [note] NVARCHAR(MAX) DEFAULT N'';
  IF COL_LENGTH('dbo.held_orders', 'cancelled_from') IS NULL ALTER TABLE dbo.held_orders ADD [cancelled_from] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.held_orders', 'held_at') IS NULL ALTER TABLE dbo.held_orders ADD [held_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.held_orders', 'created_at') IS NULL ALTER TABLE dbo.held_orders ADD [created_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.held_orders', 'updated_at') IS NULL ALTER TABLE dbo.held_orders ADD [updated_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.held_orders', 'row_version') IS NULL ALTER TABLE dbo.held_orders ADD [row_version] INT DEFAULT 1;
  IF COL_LENGTH('dbo.held_orders', 'is_synced') IS NULL ALTER TABLE dbo.held_orders ADD [is_synced] BIT DEFAULT 0;
  IF COL_LENGTH('dbo.held_orders', 'sync_status') IS NULL ALTER TABLE dbo.held_orders ADD [sync_status] NVARCHAR(40) DEFAULT N'pending';
  IF COL_LENGTH('dbo.held_orders', 'sync_attempts') IS NULL ALTER TABLE dbo.held_orders ADD [sync_attempts] INT DEFAULT 0;
  IF COL_LENGTH('dbo.held_orders', 'last_error_at') IS NULL ALTER TABLE dbo.held_orders ADD [last_error_at] DATETIME2(3);
  IF COL_LENGTH('dbo.held_orders', 'client_transaction_id') IS NULL ALTER TABLE dbo.held_orders ADD [client_transaction_id] NVARCHAR(120);
  IF COL_LENGTH('dbo.held_orders', 'status') IS NULL ALTER TABLE dbo.held_orders ADD [status] NVARCHAR(40) DEFAULT N'held';
  IF COL_LENGTH('dbo.held_orders', 'pending_request_id') IS NULL ALTER TABLE dbo.held_orders ADD [pending_request_id] NVARCHAR(400);
  IF COL_LENGTH('dbo.held_orders', 'decided_at') IS NULL ALTER TABLE dbo.held_orders ADD [decided_at] DATETIME2(3);
END
GO
IF OBJECT_ID('dbo.integration_settings', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.integration_settings', 'id') IS NULL ALTER TABLE dbo.integration_settings ADD [id] UNIQUEIDENTIFIER DEFAULT NEWID();
  IF COL_LENGTH('dbo.integration_settings', 'provider_name') IS NULL ALTER TABLE dbo.integration_settings ADD [provider_name] NVARCHAR(400);
  IF COL_LENGTH('dbo.integration_settings', 'api_keys_encrypted') IS NULL ALTER TABLE dbo.integration_settings ADD [api_keys_encrypted] NVARCHAR(MAX) DEFAULT N'{}';
  IF COL_LENGTH('dbo.integration_settings', 'verification_channel') IS NULL ALTER TABLE dbo.integration_settings ADD [verification_channel] NVARCHAR(MAX) DEFAULT N'whatsapp';
  IF COL_LENGTH('dbo.integration_settings', 'strict_verification') IS NULL ALTER TABLE dbo.integration_settings ADD [strict_verification] BIT DEFAULT 0;
  IF COL_LENGTH('dbo.integration_settings', 'is_active') IS NULL ALTER TABLE dbo.integration_settings ADD [is_active] BIT DEFAULT 1;
  IF COL_LENGTH('dbo.integration_settings', 'updated_by') IS NULL ALTER TABLE dbo.integration_settings ADD [updated_by] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.integration_settings', 'created_at') IS NULL ALTER TABLE dbo.integration_settings ADD [created_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.integration_settings', 'updated_at') IS NULL ALTER TABLE dbo.integration_settings ADD [updated_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.integration_settings', 'is_synced') IS NULL ALTER TABLE dbo.integration_settings ADD [is_synced] BIT DEFAULT 0;
  IF COL_LENGTH('dbo.integration_settings', 'sync_status') IS NULL ALTER TABLE dbo.integration_settings ADD [sync_status] NVARCHAR(40) DEFAULT N'pending';
  IF COL_LENGTH('dbo.integration_settings', 'row_version') IS NULL ALTER TABLE dbo.integration_settings ADD [row_version] INT DEFAULT 0;
  IF COL_LENGTH('dbo.integration_settings', 'sync_attempts') IS NULL ALTER TABLE dbo.integration_settings ADD [sync_attempts] INT DEFAULT 0;
  IF COL_LENGTH('dbo.integration_settings', 'last_error_at') IS NULL ALTER TABLE dbo.integration_settings ADD [last_error_at] DATETIME2(3);
  IF COL_LENGTH('dbo.integration_settings', 'client_transaction_id') IS NULL ALTER TABLE dbo.integration_settings ADD [client_transaction_id] NVARCHAR(120);
END
GO
IF OBJECT_ID('dbo.issued_vouchers', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.issued_vouchers', 'id') IS NULL ALTER TABLE dbo.issued_vouchers ADD [id] UNIQUEIDENTIFIER DEFAULT NEWID();
  IF COL_LENGTH('dbo.issued_vouchers', 'token_slug') IS NULL ALTER TABLE dbo.issued_vouchers ADD [token_slug] NVARCHAR(400);
  IF COL_LENGTH('dbo.issued_vouchers', 'campaign_id') IS NULL ALTER TABLE dbo.issued_vouchers ADD [campaign_id] UNIQUEIDENTIFIER;
  IF COL_LENGTH('dbo.issued_vouchers', 'member_id') IS NULL ALTER TABLE dbo.issued_vouchers ADD [member_id] UNIQUEIDENTIFIER;
  IF COL_LENGTH('dbo.issued_vouchers', 'status') IS NULL ALTER TABLE dbo.issued_vouchers ADD [status] NVARCHAR(MAX) DEFAULT N'ISSUED';
  IF COL_LENGTH('dbo.issued_vouchers', 'issued_at') IS NULL ALTER TABLE dbo.issued_vouchers ADD [issued_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.issued_vouchers', 'expires_at') IS NULL ALTER TABLE dbo.issued_vouchers ADD [expires_at] DATETIME2(3);
  IF COL_LENGTH('dbo.issued_vouchers', 'issued_by') IS NULL ALTER TABLE dbo.issued_vouchers ADD [issued_by] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.issued_vouchers', 'issued_source') IS NULL ALTER TABLE dbo.issued_vouchers ADD [issued_source] NVARCHAR(MAX) DEFAULT N'PUBLIC';
  IF COL_LENGTH('dbo.issued_vouchers', 'redeemed_at') IS NULL ALTER TABLE dbo.issued_vouchers ADD [redeemed_at] DATETIME2(3);
  IF COL_LENGTH('dbo.issued_vouchers', 'redeemed_by') IS NULL ALTER TABLE dbo.issued_vouchers ADD [redeemed_by] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.issued_vouchers', 'redeemed_sale_id') IS NULL ALTER TABLE dbo.issued_vouchers ADD [redeemed_sale_id] NVARCHAR(400);
  IF COL_LENGTH('dbo.issued_vouchers', 'disabled_at') IS NULL ALTER TABLE dbo.issued_vouchers ADD [disabled_at] DATETIME2(3);
  IF COL_LENGTH('dbo.issued_vouchers', 'disabled_by') IS NULL ALTER TABLE dbo.issued_vouchers ADD [disabled_by] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.issued_vouchers', 'disable_reason') IS NULL ALTER TABLE dbo.issued_vouchers ADD [disable_reason] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.issued_vouchers', 'store_id') IS NULL ALTER TABLE dbo.issued_vouchers ADD [store_id] NVARCHAR(400);
  IF COL_LENGTH('dbo.issued_vouchers', 'row_version') IS NULL ALTER TABLE dbo.issued_vouchers ADD [row_version] INT DEFAULT 1;
  IF COL_LENGTH('dbo.issued_vouchers', 'is_synced') IS NULL ALTER TABLE dbo.issued_vouchers ADD [is_synced] BIT DEFAULT 0;
  IF COL_LENGTH('dbo.issued_vouchers', 'sync_status') IS NULL ALTER TABLE dbo.issued_vouchers ADD [sync_status] NVARCHAR(40) DEFAULT N'pending';
  IF COL_LENGTH('dbo.issued_vouchers', 'sync_attempts') IS NULL ALTER TABLE dbo.issued_vouchers ADD [sync_attempts] INT DEFAULT 0;
  IF COL_LENGTH('dbo.issued_vouchers', 'last_error_at') IS NULL ALTER TABLE dbo.issued_vouchers ADD [last_error_at] DATETIME2(3);
  IF COL_LENGTH('dbo.issued_vouchers', 'client_transaction_id') IS NULL ALTER TABLE dbo.issued_vouchers ADD [client_transaction_id] NVARCHAR(120);
END
GO
IF OBJECT_ID('dbo.item_activity_logs', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.item_activity_logs', 'id') IS NULL ALTER TABLE dbo.item_activity_logs ADD [id] UNIQUEIDENTIFIER DEFAULT NEWID();
  IF COL_LENGTH('dbo.item_activity_logs', 'product_id') IS NULL ALTER TABLE dbo.item_activity_logs ADD [product_id] UNIQUEIDENTIFIER;
  IF COL_LENGTH('dbo.item_activity_logs', 'product_name') IS NULL ALTER TABLE dbo.item_activity_logs ADD [product_name] NVARCHAR(400);
  IF COL_LENGTH('dbo.item_activity_logs', 'sku') IS NULL ALTER TABLE dbo.item_activity_logs ADD [sku] NVARCHAR(400);
  IF COL_LENGTH('dbo.item_activity_logs', 'barcode') IS NULL ALTER TABLE dbo.item_activity_logs ADD [barcode] NVARCHAR(400);
  IF COL_LENGTH('dbo.item_activity_logs', 'store_id') IS NULL ALTER TABLE dbo.item_activity_logs ADD [store_id] NVARCHAR(400);
  IF COL_LENGTH('dbo.item_activity_logs', 'terminal_id') IS NULL ALTER TABLE dbo.item_activity_logs ADD [terminal_id] NVARCHAR(400);
  IF COL_LENGTH('dbo.item_activity_logs', 'activity_type') IS NULL ALTER TABLE dbo.item_activity_logs ADD [activity_type] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.item_activity_logs', 'reference') IS NULL ALTER TABLE dbo.item_activity_logs ADD [reference] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.item_activity_logs', 'quantity_delta') IS NULL ALTER TABLE dbo.item_activity_logs ADD [quantity_delta] INT DEFAULT 0;
  IF COL_LENGTH('dbo.item_activity_logs', 'stock_before') IS NULL ALTER TABLE dbo.item_activity_logs ADD [stock_before] INT;
  IF COL_LENGTH('dbo.item_activity_logs', 'stock_after') IS NULL ALTER TABLE dbo.item_activity_logs ADD [stock_after] INT;
  IF COL_LENGTH('dbo.item_activity_logs', 'unit_cost') IS NULL ALTER TABLE dbo.item_activity_logs ADD [unit_cost] DECIMAL(18,4) DEFAULT 0;
  IF COL_LENGTH('dbo.item_activity_logs', 'staff_id') IS NULL ALTER TABLE dbo.item_activity_logs ADD [staff_id] NVARCHAR(400);
  IF COL_LENGTH('dbo.item_activity_logs', 'staff_name') IS NULL ALTER TABLE dbo.item_activity_logs ADD [staff_name] NVARCHAR(400);
  IF COL_LENGTH('dbo.item_activity_logs', 'role') IS NULL ALTER TABLE dbo.item_activity_logs ADD [role] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.item_activity_logs', 'note') IS NULL ALTER TABLE dbo.item_activity_logs ADD [note] NVARCHAR(MAX) DEFAULT N'';
  IF COL_LENGTH('dbo.item_activity_logs', 'created_at') IS NULL ALTER TABLE dbo.item_activity_logs ADD [created_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.item_activity_logs', 'row_version') IS NULL ALTER TABLE dbo.item_activity_logs ADD [row_version] INT DEFAULT 1;
  IF COL_LENGTH('dbo.item_activity_logs', 'is_synced') IS NULL ALTER TABLE dbo.item_activity_logs ADD [is_synced] BIT DEFAULT 0;
  IF COL_LENGTH('dbo.item_activity_logs', 'sync_status') IS NULL ALTER TABLE dbo.item_activity_logs ADD [sync_status] NVARCHAR(40) DEFAULT N'pending';
  IF COL_LENGTH('dbo.item_activity_logs', 'sync_attempts') IS NULL ALTER TABLE dbo.item_activity_logs ADD [sync_attempts] INT DEFAULT 0;
  IF COL_LENGTH('dbo.item_activity_logs', 'last_error_at') IS NULL ALTER TABLE dbo.item_activity_logs ADD [last_error_at] DATETIME2(3);
  IF COL_LENGTH('dbo.item_activity_logs', 'client_transaction_id') IS NULL ALTER TABLE dbo.item_activity_logs ADD [client_transaction_id] NVARCHAR(120);
END
GO
IF OBJECT_ID('dbo.member_verifications', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.member_verifications', 'id') IS NULL ALTER TABLE dbo.member_verifications ADD [id] UNIQUEIDENTIFIER DEFAULT NEWID();
  IF COL_LENGTH('dbo.member_verifications', 'member_id') IS NULL ALTER TABLE dbo.member_verifications ADD [member_id] UNIQUEIDENTIFIER;
  IF COL_LENGTH('dbo.member_verifications', 'phone') IS NULL ALTER TABLE dbo.member_verifications ADD [phone] NVARCHAR(400);
  IF COL_LENGTH('dbo.member_verifications', 'email') IS NULL ALTER TABLE dbo.member_verifications ADD [email] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.member_verifications', 'channel') IS NULL ALTER TABLE dbo.member_verifications ADD [channel] NVARCHAR(MAX) DEFAULT N'whatsapp';
  IF COL_LENGTH('dbo.member_verifications', 'otp_code') IS NULL ALTER TABLE dbo.member_verifications ADD [otp_code] NVARCHAR(400);
  IF COL_LENGTH('dbo.member_verifications', 'attempts') IS NULL ALTER TABLE dbo.member_verifications ADD [attempts] INT DEFAULT 0;
  IF COL_LENGTH('dbo.member_verifications', 'status') IS NULL ALTER TABLE dbo.member_verifications ADD [status] NVARCHAR(MAX) DEFAULT N'pending';
  IF COL_LENGTH('dbo.member_verifications', 'sent_by') IS NULL ALTER TABLE dbo.member_verifications ADD [sent_by] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.member_verifications', 'store_id') IS NULL ALTER TABLE dbo.member_verifications ADD [store_id] NVARCHAR(400);
  IF COL_LENGTH('dbo.member_verifications', 'expires_at') IS NULL ALTER TABLE dbo.member_verifications ADD [expires_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.member_verifications', 'verified_at') IS NULL ALTER TABLE dbo.member_verifications ADD [verified_at] DATETIME2(3);
  IF COL_LENGTH('dbo.member_verifications', 'created_at') IS NULL ALTER TABLE dbo.member_verifications ADD [created_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.member_verifications', 'is_synced') IS NULL ALTER TABLE dbo.member_verifications ADD [is_synced] BIT DEFAULT 0;
  IF COL_LENGTH('dbo.member_verifications', 'sync_status') IS NULL ALTER TABLE dbo.member_verifications ADD [sync_status] NVARCHAR(40) DEFAULT N'pending';
  IF COL_LENGTH('dbo.member_verifications', 'row_version') IS NULL ALTER TABLE dbo.member_verifications ADD [row_version] INT DEFAULT 0;
  IF COL_LENGTH('dbo.member_verifications', 'sync_attempts') IS NULL ALTER TABLE dbo.member_verifications ADD [sync_attempts] INT DEFAULT 0;
  IF COL_LENGTH('dbo.member_verifications', 'last_error_at') IS NULL ALTER TABLE dbo.member_verifications ADD [last_error_at] DATETIME2(3);
  IF COL_LENGTH('dbo.member_verifications', 'client_transaction_id') IS NULL ALTER TABLE dbo.member_verifications ADD [client_transaction_id] NVARCHAR(120);
END
GO
IF OBJECT_ID('dbo.members', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.members', 'id') IS NULL ALTER TABLE dbo.members ADD [id] UNIQUEIDENTIFIER DEFAULT NEWID();
  IF COL_LENGTH('dbo.members', 'member_code') IS NULL ALTER TABLE dbo.members ADD [member_code] NVARCHAR(400);
  IF COL_LENGTH('dbo.members', 'full_name') IS NULL ALTER TABLE dbo.members ADD [full_name] NVARCHAR(400);
  IF COL_LENGTH('dbo.members', 'phone') IS NULL ALTER TABLE dbo.members ADD [phone] NVARCHAR(400);
  IF COL_LENGTH('dbo.members', 'email') IS NULL ALTER TABLE dbo.members ADD [email] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.members', 'address') IS NULL ALTER TABLE dbo.members ADD [address] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.members', 'date_of_birth') IS NULL ALTER TABLE dbo.members ADD [date_of_birth] DATE;
  IF COL_LENGTH('dbo.members', 'tier_id') IS NULL ALTER TABLE dbo.members ADD [tier_id] UNIQUEIDENTIFIER;
  IF COL_LENGTH('dbo.members', 'loyalty_points') IS NULL ALTER TABLE dbo.members ADD [loyalty_points] DECIMAL(18,4) DEFAULT 0;
  IF COL_LENGTH('dbo.members', 'total_spent') IS NULL ALTER TABLE dbo.members ADD [total_spent] DECIMAL(18,4) DEFAULT 0;
  IF COL_LENGTH('dbo.members', 'created_at') IS NULL ALTER TABLE dbo.members ADD [created_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.members', 'updated_at') IS NULL ALTER TABLE dbo.members ADD [updated_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.members', 'row_version') IS NULL ALTER TABLE dbo.members ADD [row_version] INT DEFAULT 1;
  IF COL_LENGTH('dbo.members', 'is_verified') IS NULL ALTER TABLE dbo.members ADD [is_verified] BIT DEFAULT 0;
  IF COL_LENGTH('dbo.members', 'verified_at') IS NULL ALTER TABLE dbo.members ADD [verified_at] DATETIME2(3);
  IF COL_LENGTH('dbo.members', 'verified_channel') IS NULL ALTER TABLE dbo.members ADD [verified_channel] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.members', 'is_synced') IS NULL ALTER TABLE dbo.members ADD [is_synced] BIT DEFAULT 0;
  IF COL_LENGTH('dbo.members', 'sync_status') IS NULL ALTER TABLE dbo.members ADD [sync_status] NVARCHAR(40) DEFAULT N'pending';
  IF COL_LENGTH('dbo.members', 'sync_attempts') IS NULL ALTER TABLE dbo.members ADD [sync_attempts] INT DEFAULT 0;
  IF COL_LENGTH('dbo.members', 'last_error_at') IS NULL ALTER TABLE dbo.members ADD [last_error_at] DATETIME2(3);
  IF COL_LENGTH('dbo.members', 'client_transaction_id') IS NULL ALTER TABLE dbo.members ADD [client_transaction_id] NVARCHAR(120);
END
GO
IF OBJECT_ID('dbo.membership_tiers', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.membership_tiers', 'id') IS NULL ALTER TABLE dbo.membership_tiers ADD [id] UNIQUEIDENTIFIER DEFAULT NEWID();
  IF COL_LENGTH('dbo.membership_tiers', 'name') IS NULL ALTER TABLE dbo.membership_tiers ADD [name] NVARCHAR(400);
  IF COL_LENGTH('dbo.membership_tiers', 'discount_percentage') IS NULL ALTER TABLE dbo.membership_tiers ADD [discount_percentage] DECIMAL(18,4) DEFAULT 0;
  IF COL_LENGTH('dbo.membership_tiers', 'points_multiplier') IS NULL ALTER TABLE dbo.membership_tiers ADD [points_multiplier] DECIMAL(18,4) DEFAULT 1.0;
  IF COL_LENGTH('dbo.membership_tiers', 'created_at') IS NULL ALTER TABLE dbo.membership_tiers ADD [created_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.membership_tiers', 'updated_at') IS NULL ALTER TABLE dbo.membership_tiers ADD [updated_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.membership_tiers', 'row_version') IS NULL ALTER TABLE dbo.membership_tiers ADD [row_version] INT DEFAULT 1;
  IF COL_LENGTH('dbo.membership_tiers', 'is_synced') IS NULL ALTER TABLE dbo.membership_tiers ADD [is_synced] BIT DEFAULT 0;
  IF COL_LENGTH('dbo.membership_tiers', 'sync_status') IS NULL ALTER TABLE dbo.membership_tiers ADD [sync_status] NVARCHAR(40) DEFAULT N'pending';
  IF COL_LENGTH('dbo.membership_tiers', 'sync_attempts') IS NULL ALTER TABLE dbo.membership_tiers ADD [sync_attempts] INT DEFAULT 0;
  IF COL_LENGTH('dbo.membership_tiers', 'last_error_at') IS NULL ALTER TABLE dbo.membership_tiers ADD [last_error_at] DATETIME2(3);
  IF COL_LENGTH('dbo.membership_tiers', 'client_transaction_id') IS NULL ALTER TABLE dbo.membership_tiers ADD [client_transaction_id] NVARCHAR(120);
END
GO
IF OBJECT_ID('dbo.offline_sync_audit_log', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.offline_sync_audit_log', 'id') IS NULL ALTER TABLE dbo.offline_sync_audit_log ADD [id] UNIQUEIDENTIFIER DEFAULT NEWID();
  IF COL_LENGTH('dbo.offline_sync_audit_log', 'terminal_id') IS NULL ALTER TABLE dbo.offline_sync_audit_log ADD [terminal_id] NVARCHAR(400);
  IF COL_LENGTH('dbo.offline_sync_audit_log', 'store_id') IS NULL ALTER TABLE dbo.offline_sync_audit_log ADD [store_id] NVARCHAR(400);
  IF COL_LENGTH('dbo.offline_sync_audit_log', 'direction') IS NULL ALTER TABLE dbo.offline_sync_audit_log ADD [direction] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.offline_sync_audit_log', 'table_name') IS NULL ALTER TABLE dbo.offline_sync_audit_log ADD [table_name] NVARCHAR(400);
  IF COL_LENGTH('dbo.offline_sync_audit_log', 'record_id') IS NULL ALTER TABLE dbo.offline_sync_audit_log ADD [record_id] NVARCHAR(400);
  IF COL_LENGTH('dbo.offline_sync_audit_log', 'records') IS NULL ALTER TABLE dbo.offline_sync_audit_log ADD [records] INT DEFAULT 0;
  IF COL_LENGTH('dbo.offline_sync_audit_log', 'status') IS NULL ALTER TABLE dbo.offline_sync_audit_log ADD [status] NVARCHAR(MAX) DEFAULT N'ok';
  IF COL_LENGTH('dbo.offline_sync_audit_log', 'error_message') IS NULL ALTER TABLE dbo.offline_sync_audit_log ADD [error_message] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.offline_sync_audit_log', 'started_at') IS NULL ALTER TABLE dbo.offline_sync_audit_log ADD [started_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.offline_sync_audit_log', 'finished_at') IS NULL ALTER TABLE dbo.offline_sync_audit_log ADD [finished_at] DATETIME2(3);
  IF COL_LENGTH('dbo.offline_sync_audit_log', 'created_at') IS NULL ALTER TABLE dbo.offline_sync_audit_log ADD [created_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.offline_sync_audit_log', 'is_synced') IS NULL ALTER TABLE dbo.offline_sync_audit_log ADD [is_synced] BIT DEFAULT 0;
  IF COL_LENGTH('dbo.offline_sync_audit_log', 'sync_status') IS NULL ALTER TABLE dbo.offline_sync_audit_log ADD [sync_status] NVARCHAR(40) DEFAULT N'pending';
  IF COL_LENGTH('dbo.offline_sync_audit_log', 'row_version') IS NULL ALTER TABLE dbo.offline_sync_audit_log ADD [row_version] INT DEFAULT 0;
  IF COL_LENGTH('dbo.offline_sync_audit_log', 'sync_attempts') IS NULL ALTER TABLE dbo.offline_sync_audit_log ADD [sync_attempts] INT DEFAULT 0;
  IF COL_LENGTH('dbo.offline_sync_audit_log', 'last_error_at') IS NULL ALTER TABLE dbo.offline_sync_audit_log ADD [last_error_at] DATETIME2(3);
  IF COL_LENGTH('dbo.offline_sync_audit_log', 'client_transaction_id') IS NULL ALTER TABLE dbo.offline_sync_audit_log ADD [client_transaction_id] NVARCHAR(120);
END
GO
IF OBJECT_ID('dbo.payment_transactions', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.payment_transactions', 'id') IS NULL ALTER TABLE dbo.payment_transactions ADD [id] UNIQUEIDENTIFIER DEFAULT NEWID();
  IF COL_LENGTH('dbo.payment_transactions', 'source_type') IS NULL ALTER TABLE dbo.payment_transactions ADD [source_type] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.payment_transactions', 'sale_id') IS NULL ALTER TABLE dbo.payment_transactions ADD [sale_id] UNIQUEIDENTIFIER;
  IF COL_LENGTH('dbo.payment_transactions', 'booking_id') IS NULL ALTER TABLE dbo.payment_transactions ADD [booking_id] UNIQUEIDENTIFIER;
  IF COL_LENGTH('dbo.payment_transactions', 'member_id') IS NULL ALTER TABLE dbo.payment_transactions ADD [member_id] UNIQUEIDENTIFIER;
  IF COL_LENGTH('dbo.payment_transactions', 'store_id') IS NULL ALTER TABLE dbo.payment_transactions ADD [store_id] NVARCHAR(400);
  IF COL_LENGTH('dbo.payment_transactions', 'shift_id') IS NULL ALTER TABLE dbo.payment_transactions ADD [shift_id] NVARCHAR(400);
  IF COL_LENGTH('dbo.payment_transactions', 'terminal_id') IS NULL ALTER TABLE dbo.payment_transactions ADD [terminal_id] NVARCHAR(400);
  IF COL_LENGTH('dbo.payment_transactions', 'amount') IS NULL ALTER TABLE dbo.payment_transactions ADD [amount] DECIMAL(18,4) DEFAULT 0;
  IF COL_LENGTH('dbo.payment_transactions', 'method') IS NULL ALTER TABLE dbo.payment_transactions ADD [method] NVARCHAR(MAX) DEFAULT N'cash';
  IF COL_LENGTH('dbo.payment_transactions', 'kind') IS NULL ALTER TABLE dbo.payment_transactions ADD [kind] NVARCHAR(MAX) DEFAULT N'payment';
  IF COL_LENGTH('dbo.payment_transactions', 'reference') IS NULL ALTER TABLE dbo.payment_transactions ADD [reference] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.payment_transactions', 'cashier_id') IS NULL ALTER TABLE dbo.payment_transactions ADD [cashier_id] NVARCHAR(400);
  IF COL_LENGTH('dbo.payment_transactions', 'cashier_name') IS NULL ALTER TABLE dbo.payment_transactions ADD [cashier_name] NVARCHAR(400);
  IF COL_LENGTH('dbo.payment_transactions', 'note') IS NULL ALTER TABLE dbo.payment_transactions ADD [note] NVARCHAR(MAX) DEFAULT N'';
  IF COL_LENGTH('dbo.payment_transactions', 'paid_at') IS NULL ALTER TABLE dbo.payment_transactions ADD [paid_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.payment_transactions', 'created_at') IS NULL ALTER TABLE dbo.payment_transactions ADD [created_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.payment_transactions', 'updated_at') IS NULL ALTER TABLE dbo.payment_transactions ADD [updated_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.payment_transactions', 'row_version') IS NULL ALTER TABLE dbo.payment_transactions ADD [row_version] INT DEFAULT 1;
  IF COL_LENGTH('dbo.payment_transactions', 'status') IS NULL ALTER TABLE dbo.payment_transactions ADD [status] NVARCHAR(MAX) DEFAULT N'completed';
  IF COL_LENGTH('dbo.payment_transactions', 'metadata') IS NULL ALTER TABLE dbo.payment_transactions ADD [metadata] NVARCHAR(MAX) DEFAULT N'{}';
  IF COL_LENGTH('dbo.payment_transactions', 'is_synced') IS NULL ALTER TABLE dbo.payment_transactions ADD [is_synced] BIT DEFAULT 0;
  IF COL_LENGTH('dbo.payment_transactions', 'sync_status') IS NULL ALTER TABLE dbo.payment_transactions ADD [sync_status] NVARCHAR(40) DEFAULT N'pending';
  IF COL_LENGTH('dbo.payment_transactions', 'sync_attempts') IS NULL ALTER TABLE dbo.payment_transactions ADD [sync_attempts] INT DEFAULT 0;
  IF COL_LENGTH('dbo.payment_transactions', 'last_error_at') IS NULL ALTER TABLE dbo.payment_transactions ADD [last_error_at] DATETIME2(3);
  IF COL_LENGTH('dbo.payment_transactions', 'client_transaction_id') IS NULL ALTER TABLE dbo.payment_transactions ADD [client_transaction_id] NVARCHAR(120);
END
GO
IF OBJECT_ID('dbo.payment_transactions', 'U') IS NOT NULL
AND COL_LENGTH('dbo.payment_transactions', 'client_transaction_id') IS NOT NULL
AND NOT EXISTS (
  SELECT 1 FROM sys.indexes
   WHERE object_id = OBJECT_ID('dbo.payment_transactions')
     AND name = N'UX_payment_transactions_client_txn'
)
AND NOT EXISTS (
  SELECT client_transaction_id FROM dbo.payment_transactions
   WHERE client_transaction_id IS NOT NULL
   GROUP BY client_transaction_id HAVING COUNT(*) > 1
)
  CREATE UNIQUE INDEX UX_payment_transactions_client_txn
    ON dbo.payment_transactions (client_transaction_id)
    WHERE client_transaction_id IS NOT NULL;
GO
IF OBJECT_ID('dbo.payment_types', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.payment_types', 'id') IS NULL ALTER TABLE dbo.payment_types ADD [id] UNIQUEIDENTIFIER DEFAULT NEWID();
  IF COL_LENGTH('dbo.payment_types', 'name') IS NULL ALTER TABLE dbo.payment_types ADD [name] NVARCHAR(400);
  IF COL_LENGTH('dbo.payment_types', 'type_code') IS NULL ALTER TABLE dbo.payment_types ADD [type_code] NVARCHAR(400);
  IF COL_LENGTH('dbo.payment_types', 'requires_reference') IS NULL ALTER TABLE dbo.payment_types ADD [requires_reference] BIT DEFAULT 0;
  IF COL_LENGTH('dbo.payment_types', 'is_active') IS NULL ALTER TABLE dbo.payment_types ADD [is_active] BIT DEFAULT 1;
  IF COL_LENGTH('dbo.payment_types', 'icon') IS NULL ALTER TABLE dbo.payment_types ADD [icon] NVARCHAR(MAX) DEFAULT N'Wallet';
  IF COL_LENGTH('dbo.payment_types', 'sort_order') IS NULL ALTER TABLE dbo.payment_types ADD [sort_order] INT DEFAULT 0;
  IF COL_LENGTH('dbo.payment_types', 'is_system') IS NULL ALTER TABLE dbo.payment_types ADD [is_system] BIT DEFAULT 0;
  IF COL_LENGTH('dbo.payment_types', 'created_at') IS NULL ALTER TABLE dbo.payment_types ADD [created_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.payment_types', 'updated_at') IS NULL ALTER TABLE dbo.payment_types ADD [updated_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.payment_types', 'row_version') IS NULL ALTER TABLE dbo.payment_types ADD [row_version] INT DEFAULT 1;
  IF COL_LENGTH('dbo.payment_types', 'is_synced') IS NULL ALTER TABLE dbo.payment_types ADD [is_synced] BIT DEFAULT 0;
  IF COL_LENGTH('dbo.payment_types', 'sync_status') IS NULL ALTER TABLE dbo.payment_types ADD [sync_status] NVARCHAR(40) DEFAULT N'pending';
  IF COL_LENGTH('dbo.payment_types', 'sync_attempts') IS NULL ALTER TABLE dbo.payment_types ADD [sync_attempts] INT DEFAULT 0;
  IF COL_LENGTH('dbo.payment_types', 'last_error_at') IS NULL ALTER TABLE dbo.payment_types ADD [last_error_at] DATETIME2(3);
  IF COL_LENGTH('dbo.payment_types', 'client_transaction_id') IS NULL ALTER TABLE dbo.payment_types ADD [client_transaction_id] NVARCHAR(120);
END
GO
IF OBJECT_ID('dbo.pin_attempts', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.pin_attempts', 'key') IS NULL ALTER TABLE dbo.pin_attempts ADD [key] NVARCHAR(400);
  IF COL_LENGTH('dbo.pin_attempts', 'attempts') IS NULL ALTER TABLE dbo.pin_attempts ADD [attempts] INT DEFAULT 0;
  IF COL_LENGTH('dbo.pin_attempts', 'window_started_at') IS NULL ALTER TABLE dbo.pin_attempts ADD [window_started_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.pin_attempts', 'locked_until') IS NULL ALTER TABLE dbo.pin_attempts ADD [locked_until] DATETIME2(3);
  IF COL_LENGTH('dbo.pin_attempts', 'created_at') IS NULL ALTER TABLE dbo.pin_attempts ADD [created_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.pin_attempts', 'updated_at') IS NULL ALTER TABLE dbo.pin_attempts ADD [updated_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.pin_attempts', 'is_synced') IS NULL ALTER TABLE dbo.pin_attempts ADD [is_synced] BIT DEFAULT 0;
  IF COL_LENGTH('dbo.pin_attempts', 'sync_status') IS NULL ALTER TABLE dbo.pin_attempts ADD [sync_status] NVARCHAR(40) DEFAULT N'pending';
  IF COL_LENGTH('dbo.pin_attempts', 'row_version') IS NULL ALTER TABLE dbo.pin_attempts ADD [row_version] INT DEFAULT 0;
  IF COL_LENGTH('dbo.pin_attempts', 'sync_attempts') IS NULL ALTER TABLE dbo.pin_attempts ADD [sync_attempts] INT DEFAULT 0;
  IF COL_LENGTH('dbo.pin_attempts', 'last_error_at') IS NULL ALTER TABLE dbo.pin_attempts ADD [last_error_at] DATETIME2(3);
  IF COL_LENGTH('dbo.pin_attempts', 'client_transaction_id') IS NULL ALTER TABLE dbo.pin_attempts ADD [client_transaction_id] NVARCHAR(120);
END
GO
IF OBJECT_ID('dbo.pos_settings', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.pos_settings', 'id') IS NULL ALTER TABLE dbo.pos_settings ADD [id] INT DEFAULT 1;
  IF COL_LENGTH('dbo.pos_settings', 'tax_percentage') IS NULL ALTER TABLE dbo.pos_settings ADD [tax_percentage] DECIMAL(18,4) DEFAULT 0;
  IF COL_LENGTH('dbo.pos_settings', 'enable_tax') IS NULL ALTER TABLE dbo.pos_settings ADD [enable_tax] BIT DEFAULT 1;
  IF COL_LENGTH('dbo.pos_settings', 'tax_mode') IS NULL ALTER TABLE dbo.pos_settings ADD [tax_mode] NVARCHAR(MAX) DEFAULT N'exclusive';
  IF COL_LENGTH('dbo.pos_settings', 'paper_size') IS NULL ALTER TABLE dbo.pos_settings ADD [paper_size] NVARCHAR(MAX) DEFAULT N'80mm';
  IF COL_LENGTH('dbo.pos_settings', 'header_text') IS NULL ALTER TABLE dbo.pos_settings ADD [header_text] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.pos_settings', 'footer_text') IS NULL ALTER TABLE dbo.pos_settings ADD [footer_text] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.pos_settings', 'show_logo') IS NULL ALTER TABLE dbo.pos_settings ADD [show_logo] BIT DEFAULT 1;
  IF COL_LENGTH('dbo.pos_settings', 'show_points') IS NULL ALTER TABLE dbo.pos_settings ADD [show_points] BIT DEFAULT 1;
  IF COL_LENGTH('dbo.pos_settings', 'show_barcode') IS NULL ALTER TABLE dbo.pos_settings ADD [show_barcode] BIT DEFAULT 1;
  IF COL_LENGTH('dbo.pos_settings', 'show_tax_details') IS NULL ALTER TABLE dbo.pos_settings ADD [show_tax_details] BIT DEFAULT 1;
  IF COL_LENGTH('dbo.pos_settings', 'updated_at') IS NULL ALTER TABLE dbo.pos_settings ADD [updated_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.pos_settings', 'company_name') IS NULL ALTER TABLE dbo.pos_settings ADD [company_name] NVARCHAR(400) DEFAULT N'NORTHWIND & CO.';
  IF COL_LENGTH('dbo.pos_settings', 'tax_number') IS NULL ALTER TABLE dbo.pos_settings ADD [tax_number] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.pos_settings', 'reg_number') IS NULL ALTER TABLE dbo.pos_settings ADD [reg_number] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.pos_settings', 'phone') IS NULL ALTER TABLE dbo.pos_settings ADD [phone] NVARCHAR(400);
  IF COL_LENGTH('dbo.pos_settings', 'website') IS NULL ALTER TABLE dbo.pos_settings ADD [website] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.pos_settings', 'fonts') IS NULL ALTER TABLE dbo.pos_settings ADD [fonts] NVARCHAR(MAX) DEFAULT N'{}';
  IF COL_LENGTH('dbo.pos_settings', 'custom_lines') IS NULL ALTER TABLE dbo.pos_settings ADD [custom_lines] NVARCHAR(MAX) DEFAULT N'[]';
  IF COL_LENGTH('dbo.pos_settings', 'qr') IS NULL ALTER TABLE dbo.pos_settings ADD [qr] NVARCHAR(MAX) DEFAULT N'{}';
  IF COL_LENGTH('dbo.pos_settings', 'review_max_voids') IS NULL ALTER TABLE dbo.pos_settings ADD [review_max_voids] INT DEFAULT 5;
  IF COL_LENGTH('dbo.pos_settings', 'review_max_refunds') IS NULL ALTER TABLE dbo.pos_settings ADD [review_max_refunds] INT DEFAULT 3;
  IF COL_LENGTH('dbo.pos_settings', 'review_max_refund_value') IS NULL ALTER TABLE dbo.pos_settings ADD [review_max_refund_value] DECIMAL(18,4) DEFAULT 200;
  IF COL_LENGTH('dbo.pos_settings', 'review_max_nosale') IS NULL ALTER TABLE dbo.pos_settings ADD [review_max_nosale] INT DEFAULT 5;
  IF COL_LENGTH('dbo.pos_settings', 'review_max_discount_pct') IS NULL ALTER TABLE dbo.pos_settings ADD [review_max_discount_pct] DECIMAL(18,4) DEFAULT 15;
  IF COL_LENGTH('dbo.pos_settings', 'day_start_time') IS NULL ALTER TABLE dbo.pos_settings ADD [day_start_time] NVARCHAR(MAX) DEFAULT N'09:00';
  IF COL_LENGTH('dbo.pos_settings', 'day_end_time') IS NULL ALTER TABLE dbo.pos_settings ADD [day_end_time] NVARCHAR(MAX) DEFAULT N'22:00';
  IF COL_LENGTH('dbo.pos_settings', 'max_shift_hours') IS NULL ALTER TABLE dbo.pos_settings ADD [max_shift_hours] DECIMAL(18,4) DEFAULT 12;
  IF COL_LENGTH('dbo.pos_settings', 'shift_reminder_minutes') IS NULL ALTER TABLE dbo.pos_settings ADD [shift_reminder_minutes] INT DEFAULT 30;
  IF COL_LENGTH('dbo.pos_settings', 'ui_visibility') IS NULL ALTER TABLE dbo.pos_settings ADD [ui_visibility] NVARCHAR(MAX) DEFAULT N'{"hidden": {}}';
  IF COL_LENGTH('dbo.pos_settings', 'integration_settings') IS NULL ALTER TABLE dbo.pos_settings ADD [integration_settings] NVARCHAR(MAX) DEFAULT N'{}';
  IF COL_LENGTH('dbo.pos_settings', 'region_country') IS NULL ALTER TABLE dbo.pos_settings ADD [region_country] NVARCHAR(MAX) DEFAULT N'';
  IF COL_LENGTH('dbo.pos_settings', 'time_zone') IS NULL ALTER TABLE dbo.pos_settings ADD [time_zone] NVARCHAR(MAX) DEFAULT N'';
  IF COL_LENGTH('dbo.pos_settings', 'date_format') IS NULL ALTER TABLE dbo.pos_settings ADD [date_format] NVARCHAR(MAX) DEFAULT N'dd/MM/yyyy';
  IF COL_LENGTH('dbo.pos_settings', 'time_format') IS NULL ALTER TABLE dbo.pos_settings ADD [time_format] NVARCHAR(MAX) DEFAULT N'24h';
  IF COL_LENGTH('dbo.pos_settings', 'booking_slip') IS NULL ALTER TABLE dbo.pos_settings ADD [booking_slip] NVARCHAR(MAX) DEFAULT N'{}';
  IF COL_LENGTH('dbo.pos_settings', 'notification_settings') IS NULL ALTER TABLE dbo.pos_settings ADD [notification_settings] NVARCHAR(MAX) DEFAULT N'{}';
  IF COL_LENGTH('dbo.pos_settings', 'row_version') IS NULL ALTER TABLE dbo.pos_settings ADD [row_version] INT DEFAULT 1;
  IF COL_LENGTH('dbo.pos_settings', 'logo_data_url') IS NULL ALTER TABLE dbo.pos_settings ADD [logo_data_url] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.pos_settings', 'receipt_design') IS NULL ALTER TABLE dbo.pos_settings ADD [receipt_design] NVARCHAR(MAX) DEFAULT N'{}';
  IF COL_LENGTH('dbo.pos_settings', 'is_synced') IS NULL ALTER TABLE dbo.pos_settings ADD [is_synced] BIT DEFAULT 0;
  IF COL_LENGTH('dbo.pos_settings', 'sync_status') IS NULL ALTER TABLE dbo.pos_settings ADD [sync_status] NVARCHAR(40) DEFAULT N'pending';
  IF COL_LENGTH('dbo.pos_settings', 'sync_attempts') IS NULL ALTER TABLE dbo.pos_settings ADD [sync_attempts] INT DEFAULT 0;
  IF COL_LENGTH('dbo.pos_settings', 'last_error_at') IS NULL ALTER TABLE dbo.pos_settings ADD [last_error_at] DATETIME2(3);
  IF COL_LENGTH('dbo.pos_settings', 'client_transaction_id') IS NULL ALTER TABLE dbo.pos_settings ADD [client_transaction_id] NVARCHAR(120);
END
GO
IF OBJECT_ID('dbo.product_barcodes', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.product_barcodes', 'id') IS NULL ALTER TABLE dbo.product_barcodes ADD [id] UNIQUEIDENTIFIER DEFAULT NEWID();
  IF COL_LENGTH('dbo.product_barcodes', 'product_id') IS NULL ALTER TABLE dbo.product_barcodes ADD [product_id] UNIQUEIDENTIFIER;
  IF COL_LENGTH('dbo.product_barcodes', 'barcode') IS NULL ALTER TABLE dbo.product_barcodes ADD [barcode] NVARCHAR(400);
  IF COL_LENGTH('dbo.product_barcodes', 'label') IS NULL ALTER TABLE dbo.product_barcodes ADD [label] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.product_barcodes', 'pack_size') IS NULL ALTER TABLE dbo.product_barcodes ADD [pack_size] DECIMAL(18,4) DEFAULT 1;
  IF COL_LENGTH('dbo.product_barcodes', 'is_primary') IS NULL ALTER TABLE dbo.product_barcodes ADD [is_primary] BIT DEFAULT 0;
  IF COL_LENGTH('dbo.product_barcodes', 'created_at') IS NULL ALTER TABLE dbo.product_barcodes ADD [created_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.product_barcodes', 'updated_at') IS NULL ALTER TABLE dbo.product_barcodes ADD [updated_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.product_barcodes', 'row_version') IS NULL ALTER TABLE dbo.product_barcodes ADD [row_version] INT DEFAULT 1;
  IF COL_LENGTH('dbo.product_barcodes', 'is_synced') IS NULL ALTER TABLE dbo.product_barcodes ADD [is_synced] BIT DEFAULT 0;
  IF COL_LENGTH('dbo.product_barcodes', 'sync_status') IS NULL ALTER TABLE dbo.product_barcodes ADD [sync_status] NVARCHAR(40) DEFAULT N'pending';
  IF COL_LENGTH('dbo.product_barcodes', 'sync_attempts') IS NULL ALTER TABLE dbo.product_barcodes ADD [sync_attempts] INT DEFAULT 0;
  IF COL_LENGTH('dbo.product_barcodes', 'last_error_at') IS NULL ALTER TABLE dbo.product_barcodes ADD [last_error_at] DATETIME2(3);
  IF COL_LENGTH('dbo.product_barcodes', 'client_transaction_id') IS NULL ALTER TABLE dbo.product_barcodes ADD [client_transaction_id] NVARCHAR(120);
END
GO
IF OBJECT_ID('dbo.product_categories', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.product_categories', 'id') IS NULL ALTER TABLE dbo.product_categories ADD [id] UNIQUEIDENTIFIER DEFAULT NEWID();
  IF COL_LENGTH('dbo.product_categories', 'name') IS NULL ALTER TABLE dbo.product_categories ADD [name] NVARCHAR(400);
  IF COL_LENGTH('dbo.product_categories', 'parent_id') IS NULL ALTER TABLE dbo.product_categories ADD [parent_id] UNIQUEIDENTIFIER;
  IF COL_LENGTH('dbo.product_categories', 'sort') IS NULL ALTER TABLE dbo.product_categories ADD [sort] INT DEFAULT 0;
  IF COL_LENGTH('dbo.product_categories', 'created_at') IS NULL ALTER TABLE dbo.product_categories ADD [created_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.product_categories', 'updated_at') IS NULL ALTER TABLE dbo.product_categories ADD [updated_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.product_categories', 'kind') IS NULL ALTER TABLE dbo.product_categories ADD [kind] NVARCHAR(MAX) DEFAULT N'category';
  IF COL_LENGTH('dbo.product_categories', 'row_version') IS NULL ALTER TABLE dbo.product_categories ADD [row_version] INT DEFAULT 1;
  IF COL_LENGTH('dbo.product_categories', 'is_synced') IS NULL ALTER TABLE dbo.product_categories ADD [is_synced] BIT DEFAULT 0;
  IF COL_LENGTH('dbo.product_categories', 'sync_status') IS NULL ALTER TABLE dbo.product_categories ADD [sync_status] NVARCHAR(40) DEFAULT N'pending';
  IF COL_LENGTH('dbo.product_categories', 'sync_attempts') IS NULL ALTER TABLE dbo.product_categories ADD [sync_attempts] INT DEFAULT 0;
  IF COL_LENGTH('dbo.product_categories', 'last_error_at') IS NULL ALTER TABLE dbo.product_categories ADD [last_error_at] DATETIME2(3);
  IF COL_LENGTH('dbo.product_categories', 'client_transaction_id') IS NULL ALTER TABLE dbo.product_categories ADD [client_transaction_id] NVARCHAR(120);
END
GO
IF OBJECT_ID('dbo.products', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.products', 'id') IS NULL ALTER TABLE dbo.products ADD [id] UNIQUEIDENTIFIER DEFAULT NEWID();
  IF COL_LENGTH('dbo.products', 'barcode') IS NULL ALTER TABLE dbo.products ADD [barcode] NVARCHAR(400);
  IF COL_LENGTH('dbo.products', 'name') IS NULL ALTER TABLE dbo.products ADD [name] NVARCHAR(400);
  IF COL_LENGTH('dbo.products', 'category') IS NULL ALTER TABLE dbo.products ADD [category] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.products', 'cost_price') IS NULL ALTER TABLE dbo.products ADD [cost_price] DECIMAL(18,4) DEFAULT 0;
  IF COL_LENGTH('dbo.products', 'selling_price') IS NULL ALTER TABLE dbo.products ADD [selling_price] DECIMAL(18,4) DEFAULT 0;
  IF COL_LENGTH('dbo.products', 'ecom_price') IS NULL ALTER TABLE dbo.products ADD [ecom_price] DECIMAL(18,4);
  IF COL_LENGTH('dbo.products', 'stock_quantity') IS NULL ALTER TABLE dbo.products ADD [stock_quantity] INT DEFAULT 0;
  IF COL_LENGTH('dbo.products', 'custom_points') IS NULL ALTER TABLE dbo.products ADD [custom_points] DECIMAL(18,4);
  IF COL_LENGTH('dbo.products', 'owner_store_id') IS NULL ALTER TABLE dbo.products ADD [owner_store_id] NVARCHAR(200);
  IF COL_LENGTH('dbo.products', 'point_multiplier') IS NULL ALTER TABLE dbo.products ADD [point_multiplier] DECIMAL(18,4) DEFAULT 1.0;
  IF COL_LENGTH('dbo.products', 'created_at') IS NULL ALTER TABLE dbo.products ADD [created_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.products', 'sku') IS NULL ALTER TABLE dbo.products ADD [sku] NVARCHAR(400);
  IF COL_LENGTH('dbo.products', 'reorder_level') IS NULL ALTER TABLE dbo.products ADD [reorder_level] INT DEFAULT 0;
  IF COL_LENGTH('dbo.products', 'tax_rate') IS NULL ALTER TABLE dbo.products ADD [tax_rate] DECIMAL(18,4) DEFAULT 0;
  IF COL_LENGTH('dbo.products', 'ecom_visible') IS NULL ALTER TABLE dbo.products ADD [ecom_visible] BIT DEFAULT 1;
  IF COL_LENGTH('dbo.products', 'stock_by_store') IS NULL ALTER TABLE dbo.products ADD [stock_by_store] NVARCHAR(MAX) DEFAULT N'{}';
  IF COL_LENGTH('dbo.products', 'updated_at') IS NULL ALTER TABLE dbo.products ADD [updated_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.products', 'landing_pct') IS NULL ALTER TABLE dbo.products ADD [landing_pct] DECIMAL(18,4);
  IF COL_LENGTH('dbo.products', 'sub_category') IS NULL ALTER TABLE dbo.products ADD [sub_category] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.products', 'unit') IS NULL ALTER TABLE dbo.products ADD [unit] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.products', 'packs') IS NULL ALTER TABLE dbo.products ADD [packs] NVARCHAR(MAX) DEFAULT N'[]';
  IF COL_LENGTH('dbo.products', 'barcode_aliases') IS NULL ALTER TABLE dbo.products ADD [barcode_aliases] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.products', 'is_archived') IS NULL ALTER TABLE dbo.products ADD [is_archived] BIT DEFAULT 0;
  IF COL_LENGTH('dbo.products', 'archived_at') IS NULL ALTER TABLE dbo.products ADD [archived_at] DATETIME2(3);
  IF COL_LENGTH('dbo.products', 'brand') IS NULL ALTER TABLE dbo.products ADD [brand] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.products', 'product_group') IS NULL ALTER TABLE dbo.products ADD [product_group] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.products', 'barcode_variants') IS NULL ALTER TABLE dbo.products ADD [barcode_variants] NVARCHAR(MAX) DEFAULT N'[]';
  IF COL_LENGTH('dbo.products', 'row_version') IS NULL ALTER TABLE dbo.products ADD [row_version] INT DEFAULT 0;
  IF COL_LENGTH('dbo.products', 'is_synced') IS NULL ALTER TABLE dbo.products ADD [is_synced] BIT DEFAULT 0;
  IF COL_LENGTH('dbo.products', 'sync_status') IS NULL ALTER TABLE dbo.products ADD [sync_status] NVARCHAR(40) DEFAULT N'pending';
  IF COL_LENGTH('dbo.products', 'sync_attempts') IS NULL ALTER TABLE dbo.products ADD [sync_attempts] INT DEFAULT 0;
  IF COL_LENGTH('dbo.products', 'last_error_at') IS NULL ALTER TABLE dbo.products ADD [last_error_at] DATETIME2(3);
  IF COL_LENGTH('dbo.products', 'client_transaction_id') IS NULL ALTER TABLE dbo.products ADD [client_transaction_id] NVARCHAR(120);
END
GO
IF OBJECT_ID('dbo.promotions', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.promotions', 'id') IS NULL ALTER TABLE dbo.promotions ADD [id] UNIQUEIDENTIFIER DEFAULT NEWID();
  IF COL_LENGTH('dbo.promotions', 'title') IS NULL ALTER TABLE dbo.promotions ADD [title] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.promotions', 'promo_type') IS NULL ALTER TABLE dbo.promotions ADD [promo_type] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.promotions', 'min_spend') IS NULL ALTER TABLE dbo.promotions ADD [min_spend] DECIMAL(18,4) DEFAULT 0;
  IF COL_LENGTH('dbo.promotions', 'discount_percent') IS NULL ALTER TABLE dbo.promotions ADD [discount_percent] DECIMAL(18,4) DEFAULT 0;
  IF COL_LENGTH('dbo.promotions', 'discount_amount') IS NULL ALTER TABLE dbo.promotions ADD [discount_amount] DECIMAL(18,4) DEFAULT 0;
  IF COL_LENGTH('dbo.promotions', 'foc_product_id') IS NULL ALTER TABLE dbo.promotions ADD [foc_product_id] UNIQUEIDENTIFIER;
  IF COL_LENGTH('dbo.promotions', 'points_per_dollar') IS NULL ALTER TABLE dbo.promotions ADD [points_per_dollar] DECIMAL(18,4) DEFAULT 1;
  IF COL_LENGTH('dbo.promotions', 'tier_rates') IS NULL ALTER TABLE dbo.promotions ADD [tier_rates] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.promotions', 'is_active') IS NULL ALTER TABLE dbo.promotions ADD [is_active] BIT DEFAULT 1;
  IF COL_LENGTH('dbo.promotions', 'start_date') IS NULL ALTER TABLE dbo.promotions ADD [start_date] DATE;
  IF COL_LENGTH('dbo.promotions', 'end_date') IS NULL ALTER TABLE dbo.promotions ADD [end_date] DATE;
  IF COL_LENGTH('dbo.promotions', 'created_at') IS NULL ALTER TABLE dbo.promotions ADD [created_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.promotions', 'updated_at') IS NULL ALTER TABLE dbo.promotions ADD [updated_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.promotions', 'row_version') IS NULL ALTER TABLE dbo.promotions ADD [row_version] INT DEFAULT 1;
  IF COL_LENGTH('dbo.promotions', 'is_synced') IS NULL ALTER TABLE dbo.promotions ADD [is_synced] BIT DEFAULT 0;
  IF COL_LENGTH('dbo.promotions', 'sync_status') IS NULL ALTER TABLE dbo.promotions ADD [sync_status] NVARCHAR(40) DEFAULT N'pending';
  IF COL_LENGTH('dbo.promotions', 'sync_attempts') IS NULL ALTER TABLE dbo.promotions ADD [sync_attempts] INT DEFAULT 0;
  IF COL_LENGTH('dbo.promotions', 'last_error_at') IS NULL ALTER TABLE dbo.promotions ADD [last_error_at] DATETIME2(3);
  IF COL_LENGTH('dbo.promotions', 'client_transaction_id') IS NULL ALTER TABLE dbo.promotions ADD [client_transaction_id] NVARCHAR(120);
END
GO
IF OBJECT_ID('dbo.public_flags', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.public_flags', 'key') IS NULL ALTER TABLE dbo.public_flags ADD [key] NVARCHAR(400);
  IF COL_LENGTH('dbo.public_flags', 'enabled') IS NULL ALTER TABLE dbo.public_flags ADD [enabled] BIT DEFAULT 1;
  IF COL_LENGTH('dbo.public_flags', 'updated_at') IS NULL ALTER TABLE dbo.public_flags ADD [updated_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.public_flags', 'is_synced') IS NULL ALTER TABLE dbo.public_flags ADD [is_synced] BIT DEFAULT 0;
  IF COL_LENGTH('dbo.public_flags', 'sync_status') IS NULL ALTER TABLE dbo.public_flags ADD [sync_status] NVARCHAR(40) DEFAULT N'pending';
  IF COL_LENGTH('dbo.public_flags', 'row_version') IS NULL ALTER TABLE dbo.public_flags ADD [row_version] INT DEFAULT 0;
  IF COL_LENGTH('dbo.public_flags', 'sync_attempts') IS NULL ALTER TABLE dbo.public_flags ADD [sync_attempts] INT DEFAULT 0;
  IF COL_LENGTH('dbo.public_flags', 'last_error_at') IS NULL ALTER TABLE dbo.public_flags ADD [last_error_at] DATETIME2(3);
  IF COL_LENGTH('dbo.public_flags', 'client_transaction_id') IS NULL ALTER TABLE dbo.public_flags ADD [client_transaction_id] NVARCHAR(120);
END
GO
IF OBJECT_ID('dbo.purchase_order_items', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.purchase_order_items', 'id') IS NULL ALTER TABLE dbo.purchase_order_items ADD [id] UNIQUEIDENTIFIER DEFAULT NEWID();
  IF COL_LENGTH('dbo.purchase_order_items', 'po_id') IS NULL ALTER TABLE dbo.purchase_order_items ADD [po_id] UNIQUEIDENTIFIER;
  IF COL_LENGTH('dbo.purchase_order_items', 'product_id') IS NULL ALTER TABLE dbo.purchase_order_items ADD [product_id] UNIQUEIDENTIFIER;
  IF COL_LENGTH('dbo.purchase_order_items', 'barcode') IS NULL ALTER TABLE dbo.purchase_order_items ADD [barcode] NVARCHAR(400);
  IF COL_LENGTH('dbo.purchase_order_items', 'product_name') IS NULL ALTER TABLE dbo.purchase_order_items ADD [product_name] NVARCHAR(400);
  IF COL_LENGTH('dbo.purchase_order_items', 'cost_price') IS NULL ALTER TABLE dbo.purchase_order_items ADD [cost_price] DECIMAL(18,4) DEFAULT 0;
  IF COL_LENGTH('dbo.purchase_order_items', 'selling_price') IS NULL ALTER TABLE dbo.purchase_order_items ADD [selling_price] DECIMAL(18,4) DEFAULT 0;
  IF COL_LENGTH('dbo.purchase_order_items', 'quantity_received') IS NULL ALTER TABLE dbo.purchase_order_items ADD [quantity_received] INT DEFAULT 0;
  IF COL_LENGTH('dbo.purchase_order_items', 'subtotal_cost') IS NULL ALTER TABLE dbo.purchase_order_items ADD [subtotal_cost] DECIMAL(18,4) DEFAULT 0;
  IF COL_LENGTH('dbo.purchase_order_items', 'created_at') IS NULL ALTER TABLE dbo.purchase_order_items ADD [created_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.purchase_order_items', 'sku') IS NULL ALTER TABLE dbo.purchase_order_items ADD [sku] NVARCHAR(400);
  IF COL_LENGTH('dbo.purchase_order_items', 'updated_at') IS NULL ALTER TABLE dbo.purchase_order_items ADD [updated_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.purchase_order_items', 'row_version') IS NULL ALTER TABLE dbo.purchase_order_items ADD [row_version] INT DEFAULT 1;
  IF COL_LENGTH('dbo.purchase_order_items', 'is_synced') IS NULL ALTER TABLE dbo.purchase_order_items ADD [is_synced] BIT DEFAULT 0;
  IF COL_LENGTH('dbo.purchase_order_items', 'sync_status') IS NULL ALTER TABLE dbo.purchase_order_items ADD [sync_status] NVARCHAR(40) DEFAULT N'pending';
  IF COL_LENGTH('dbo.purchase_order_items', 'sync_attempts') IS NULL ALTER TABLE dbo.purchase_order_items ADD [sync_attempts] INT DEFAULT 0;
  IF COL_LENGTH('dbo.purchase_order_items', 'last_error_at') IS NULL ALTER TABLE dbo.purchase_order_items ADD [last_error_at] DATETIME2(3);
  IF COL_LENGTH('dbo.purchase_order_items', 'client_transaction_id') IS NULL ALTER TABLE dbo.purchase_order_items ADD [client_transaction_id] NVARCHAR(120);
END
GO
IF OBJECT_ID('dbo.purchase_orders', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.purchase_orders', 'id') IS NULL ALTER TABLE dbo.purchase_orders ADD [id] UNIQUEIDENTIFIER DEFAULT NEWID();
  IF COL_LENGTH('dbo.purchase_orders', 'po_number') IS NULL ALTER TABLE dbo.purchase_orders ADD [po_number] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.purchase_orders', 'reference') IS NULL ALTER TABLE dbo.purchase_orders ADD [reference] NVARCHAR(60) NULL;
  IF COL_LENGTH('dbo.purchase_orders', 'supplier_name') IS NULL ALTER TABLE dbo.purchase_orders ADD [supplier_name] NVARCHAR(400);
  IF COL_LENGTH('dbo.purchase_orders', 'operator_name') IS NULL ALTER TABLE dbo.purchase_orders ADD [operator_name] NVARCHAR(400);
  IF COL_LENGTH('dbo.purchase_orders', 'total_cost') IS NULL ALTER TABLE dbo.purchase_orders ADD [total_cost] DECIMAL(18,4) DEFAULT 0;
  IF COL_LENGTH('dbo.purchase_orders', 'total_items_count') IS NULL ALTER TABLE dbo.purchase_orders ADD [total_items_count] INT DEFAULT 0;
  IF COL_LENGTH('dbo.purchase_orders', 'created_at') IS NULL ALTER TABLE dbo.purchase_orders ADD [created_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.purchase_orders', 'supplier_id') IS NULL ALTER TABLE dbo.purchase_orders ADD [supplier_id] UNIQUEIDENTIFIER;
  IF COL_LENGTH('dbo.purchase_orders', 'store_id') IS NULL ALTER TABLE dbo.purchase_orders ADD [store_id] NVARCHAR(400);
  IF COL_LENGTH('dbo.purchase_orders', 'store_code') IS NULL ALTER TABLE dbo.purchase_orders ADD [store_code] NVARCHAR(400);
  IF COL_LENGTH('dbo.purchase_orders', 'invoice_date') IS NULL ALTER TABLE dbo.purchase_orders ADD [invoice_date] DATE;
  IF COL_LENGTH('dbo.purchase_orders', 'invoice_entry_date') IS NULL ALTER TABLE dbo.purchase_orders ADD [invoice_entry_date] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.purchase_orders', 'updated_at') IS NULL ALTER TABLE dbo.purchase_orders ADD [updated_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.purchase_orders', 'row_version') IS NULL ALTER TABLE dbo.purchase_orders ADD [row_version] INT DEFAULT 1;
  IF COL_LENGTH('dbo.purchase_orders', 'is_synced') IS NULL ALTER TABLE dbo.purchase_orders ADD [is_synced] BIT DEFAULT 0;
  IF COL_LENGTH('dbo.purchase_orders', 'sync_status') IS NULL ALTER TABLE dbo.purchase_orders ADD [sync_status] NVARCHAR(40) DEFAULT N'pending';
  IF COL_LENGTH('dbo.purchase_orders', 'sync_attempts') IS NULL ALTER TABLE dbo.purchase_orders ADD [sync_attempts] INT DEFAULT 0;
  IF COL_LENGTH('dbo.purchase_orders', 'last_error_at') IS NULL ALTER TABLE dbo.purchase_orders ADD [last_error_at] DATETIME2(3);
  IF COL_LENGTH('dbo.purchase_orders', 'client_transaction_id') IS NULL ALTER TABLE dbo.purchase_orders ADD [client_transaction_id] NVARCHAR(120);
  -- Draft receiving orders: 'draft' until finalized, then 'posted' (or 'cancelled').
  IF COL_LENGTH('dbo.purchase_orders', 'status') IS NULL ALTER TABLE dbo.purchase_orders ADD [status] NVARCHAR(20) NOT NULL DEFAULT N'posted';
END
GO
IF OBJECT_ID('dbo.sale_items', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.sale_items', 'id') IS NULL ALTER TABLE dbo.sale_items ADD [id] UNIQUEIDENTIFIER DEFAULT NEWID();
  IF COL_LENGTH('dbo.sale_items', 'sale_id') IS NULL ALTER TABLE dbo.sale_items ADD [sale_id] UNIQUEIDENTIFIER;
  IF COL_LENGTH('dbo.sale_items', 'product_id') IS NULL ALTER TABLE dbo.sale_items ADD [product_id] UNIQUEIDENTIFIER;
  IF COL_LENGTH('dbo.sale_items', 'product_name') IS NULL ALTER TABLE dbo.sale_items ADD [product_name] NVARCHAR(400);
  IF COL_LENGTH('dbo.sale_items', 'unit_price') IS NULL ALTER TABLE dbo.sale_items ADD [unit_price] DECIMAL(18,4) DEFAULT 0;
  IF COL_LENGTH('dbo.sale_items', 'quantity') IS NULL ALTER TABLE dbo.sale_items ADD [quantity] INT DEFAULT 1;
  IF COL_LENGTH('dbo.sale_items', 'discount_percent') IS NULL ALTER TABLE dbo.sale_items ADD [discount_percent] DECIMAL(18,4) DEFAULT 0;
  IF COL_LENGTH('dbo.sale_items', 'discount_amount') IS NULL ALTER TABLE dbo.sale_items ADD [discount_amount] DECIMAL(18,4) DEFAULT 0;
  IF COL_LENGTH('dbo.sale_items', 'is_return') IS NULL ALTER TABLE dbo.sale_items ADD [is_return] BIT DEFAULT 0;
  IF COL_LENGTH('dbo.sale_items', 'created_at') IS NULL ALTER TABLE dbo.sale_items ADD [created_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.sale_items', 'tax_rate') IS NULL ALTER TABLE dbo.sale_items ADD [tax_rate] DECIMAL(18,4) DEFAULT 0;
  IF COL_LENGTH('dbo.sale_items', 'is_foc') IS NULL ALTER TABLE dbo.sale_items ADD [is_foc] BIT DEFAULT 0;
  IF COL_LENGTH('dbo.sale_items', 'promo_id') IS NULL ALTER TABLE dbo.sale_items ADD [promo_id] NVARCHAR(400);
  IF COL_LENGTH('dbo.sale_items', 'coupon_code') IS NULL ALTER TABLE dbo.sale_items ADD [coupon_code] NVARCHAR(400);
  IF COL_LENGTH('dbo.sale_items', 'coupon_discount') IS NULL ALTER TABLE dbo.sale_items ADD [coupon_discount] DECIMAL(18,4) DEFAULT 0;
  IF COL_LENGTH('dbo.sale_items', 'unit_cost') IS NULL ALTER TABLE dbo.sale_items ADD [unit_cost] DECIMAL(18,4) DEFAULT 0;
  IF COL_LENGTH('dbo.sale_items', 'row_version') IS NULL ALTER TABLE dbo.sale_items ADD [row_version] INT DEFAULT 1;
  IF COL_LENGTH('dbo.sale_items', 'is_synced') IS NULL ALTER TABLE dbo.sale_items ADD [is_synced] BIT DEFAULT 0;
  IF COL_LENGTH('dbo.sale_items', 'sync_status') IS NULL ALTER TABLE dbo.sale_items ADD [sync_status] NVARCHAR(40) DEFAULT N'pending';
  IF COL_LENGTH('dbo.sale_items', 'sync_attempts') IS NULL ALTER TABLE dbo.sale_items ADD [sync_attempts] INT DEFAULT 0;
  IF COL_LENGTH('dbo.sale_items', 'last_error_at') IS NULL ALTER TABLE dbo.sale_items ADD [last_error_at] DATETIME2(3);
  IF COL_LENGTH('dbo.sale_items', 'client_transaction_id') IS NULL ALTER TABLE dbo.sale_items ADD [client_transaction_id] NVARCHAR(120);
END
GO
IF OBJECT_ID('dbo.sales', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.sales', 'id') IS NULL ALTER TABLE dbo.sales ADD [id] UNIQUEIDENTIFIER DEFAULT NEWID();
  IF COL_LENGTH('dbo.sales', 'bill_number') IS NULL ALTER TABLE dbo.sales ADD [bill_number] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.sales', 'member_id') IS NULL ALTER TABLE dbo.sales ADD [member_id] UNIQUEIDENTIFIER;
  IF COL_LENGTH('dbo.sales', 'store_id') IS NULL ALTER TABLE dbo.sales ADD [store_id] NVARCHAR(400);
  IF COL_LENGTH('dbo.sales', 'cashier_name') IS NULL ALTER TABLE dbo.sales ADD [cashier_name] NVARCHAR(400);
  IF COL_LENGTH('dbo.sales', 'subtotal_amount') IS NULL ALTER TABLE dbo.sales ADD [subtotal_amount] DECIMAL(18,4) DEFAULT 0;
  IF COL_LENGTH('dbo.sales', 'total_amount') IS NULL ALTER TABLE dbo.sales ADD [total_amount] DECIMAL(18,4) DEFAULT 0;
  IF COL_LENGTH('dbo.sales', 'discount_amount') IS NULL ALTER TABLE dbo.sales ADD [discount_amount] DECIMAL(18,4) DEFAULT 0;
  IF COL_LENGTH('dbo.sales', 'tax_amount') IS NULL ALTER TABLE dbo.sales ADD [tax_amount] DECIMAL(18,4) DEFAULT 0;
  IF COL_LENGTH('dbo.sales', 'payment_type') IS NULL ALTER TABLE dbo.sales ADD [payment_type] NVARCHAR(MAX) DEFAULT N'cash';
  IF COL_LENGTH('dbo.sales', 'points_earned') IS NULL ALTER TABLE dbo.sales ADD [points_earned] DECIMAL(18,4) DEFAULT 0;
  IF COL_LENGTH('dbo.sales', 'points_redeemed') IS NULL ALTER TABLE dbo.sales ADD [points_redeemed] DECIMAL(18,4) DEFAULT 0;
  IF COL_LENGTH('dbo.sales', 'is_exchange') IS NULL ALTER TABLE dbo.sales ADD [is_exchange] BIT DEFAULT 0;
  IF COL_LENGTH('dbo.sales', 'original_bill_number') IS NULL ALTER TABLE dbo.sales ADD [original_bill_number] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.sales', 'is_refunded') IS NULL ALTER TABLE dbo.sales ADD [is_refunded] BIT DEFAULT 0;
  IF COL_LENGTH('dbo.sales', 'created_at') IS NULL ALTER TABLE dbo.sales ADD [created_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.sales', 'shift_id') IS NULL ALTER TABLE dbo.sales ADD [shift_id] NVARCHAR(400);
  IF COL_LENGTH('dbo.sales', 'paid_amount') IS NULL ALTER TABLE dbo.sales ADD [paid_amount] DECIMAL(18,4) DEFAULT 0;
  IF COL_LENGTH('dbo.sales', 'change_amount') IS NULL ALTER TABLE dbo.sales ADD [change_amount] DECIMAL(18,4) DEFAULT 0;
  IF COL_LENGTH('dbo.sales', 'exchange_credit') IS NULL ALTER TABLE dbo.sales ADD [exchange_credit] DECIMAL(18,4) DEFAULT 0;
  IF COL_LENGTH('dbo.sales', 'exchanged_to_bill_number') IS NULL ALTER TABLE dbo.sales ADD [exchanged_to_bill_number] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.sales', 'coupon_code') IS NULL ALTER TABLE dbo.sales ADD [coupon_code] NVARCHAR(400);
  IF COL_LENGTH('dbo.sales', 'coupon_promo_id') IS NULL ALTER TABLE dbo.sales ADD [coupon_promo_id] NVARCHAR(400);
  IF COL_LENGTH('dbo.sales', 'coupon_scope') IS NULL ALTER TABLE dbo.sales ADD [coupon_scope] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.sales', 'coupon_discount') IS NULL ALTER TABLE dbo.sales ADD [coupon_discount] DECIMAL(18,4) DEFAULT 0;
  IF COL_LENGTH('dbo.sales', 'authorization_request_id') IS NULL ALTER TABLE dbo.sales ADD [authorization_request_id] NVARCHAR(400);
  IF COL_LENGTH('dbo.sales', 'authorized_by') IS NULL ALTER TABLE dbo.sales ADD [authorized_by] NVARCHAR(400);
  IF COL_LENGTH('dbo.sales', 'authorized_at') IS NULL ALTER TABLE dbo.sales ADD [authorized_at] DATETIME2(3);
  IF COL_LENGTH('dbo.sales', 'payments') IS NULL ALTER TABLE dbo.sales ADD [payments] NVARCHAR(MAX) DEFAULT N'[]';
  IF COL_LENGTH('dbo.sales', 'rounding_adjustment') IS NULL ALTER TABLE dbo.sales ADD [rounding_adjustment] DECIMAL(18,4) DEFAULT 0;
  IF COL_LENGTH('dbo.sales', 'rounding_label') IS NULL ALTER TABLE dbo.sales ADD [rounding_label] NVARCHAR(120) NULL;
  IF COL_LENGTH('dbo.sales', 'client_transaction_id') IS NULL ALTER TABLE dbo.sales ADD [client_transaction_id] NVARCHAR(400);
  IF COL_LENGTH('dbo.sales', 'cashier_id') IS NULL ALTER TABLE dbo.sales ADD [cashier_id] NVARCHAR(400);
  IF COL_LENGTH('dbo.sales', 'created_by') IS NULL ALTER TABLE dbo.sales ADD [created_by] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.sales', 'updated_by') IS NULL ALTER TABLE dbo.sales ADD [updated_by] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.sales', 'row_version') IS NULL ALTER TABLE dbo.sales ADD [row_version] INT DEFAULT 1;
  IF COL_LENGTH('dbo.sales', 'store_name_snapshot') IS NULL ALTER TABLE dbo.sales ADD [store_name_snapshot] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.sales', 'store_address_snapshot') IS NULL ALTER TABLE dbo.sales ADD [store_address_snapshot] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.sales', 'is_synced') IS NULL ALTER TABLE dbo.sales ADD [is_synced] BIT DEFAULT 0;
  IF COL_LENGTH('dbo.sales', 'sync_status') IS NULL ALTER TABLE dbo.sales ADD [sync_status] NVARCHAR(40) DEFAULT N'pending';
  IF COL_LENGTH('dbo.sales', 'sync_attempts') IS NULL ALTER TABLE dbo.sales ADD [sync_attempts] INT DEFAULT 0;
  IF COL_LENGTH('dbo.sales', 'last_error_at') IS NULL ALTER TABLE dbo.sales ADD [last_error_at] DATETIME2(3);
END
GO
IF OBJECT_ID('dbo.secure_settings', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.secure_settings', 'key') IS NULL ALTER TABLE dbo.secure_settings ADD [key] NVARCHAR(400);
  IF COL_LENGTH('dbo.secure_settings', 'ciphertext') IS NULL ALTER TABLE dbo.secure_settings ADD [ciphertext] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.secure_settings', 'hint') IS NULL ALTER TABLE dbo.secure_settings ADD [hint] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.secure_settings', 'updated_by') IS NULL ALTER TABLE dbo.secure_settings ADD [updated_by] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.secure_settings', 'created_at') IS NULL ALTER TABLE dbo.secure_settings ADD [created_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.secure_settings', 'updated_at') IS NULL ALTER TABLE dbo.secure_settings ADD [updated_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.secure_settings', 'is_synced') IS NULL ALTER TABLE dbo.secure_settings ADD [is_synced] BIT DEFAULT 0;
  IF COL_LENGTH('dbo.secure_settings', 'sync_status') IS NULL ALTER TABLE dbo.secure_settings ADD [sync_status] NVARCHAR(40) DEFAULT N'pending';
  IF COL_LENGTH('dbo.secure_settings', 'row_version') IS NULL ALTER TABLE dbo.secure_settings ADD [row_version] INT DEFAULT 0;
  IF COL_LENGTH('dbo.secure_settings', 'sync_attempts') IS NULL ALTER TABLE dbo.secure_settings ADD [sync_attempts] INT DEFAULT 0;
  IF COL_LENGTH('dbo.secure_settings', 'last_error_at') IS NULL ALTER TABLE dbo.secure_settings ADD [last_error_at] DATETIME2(3);
  IF COL_LENGTH('dbo.secure_settings', 'client_transaction_id') IS NULL ALTER TABLE dbo.secure_settings ADD [client_transaction_id] NVARCHAR(120);
END
GO
IF OBJECT_ID('dbo.security_findings', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.security_findings', 'id') IS NULL ALTER TABLE dbo.security_findings ADD [id] UNIQUEIDENTIFIER DEFAULT NEWID();
  IF COL_LENGTH('dbo.security_findings', 'fingerprint') IS NULL ALTER TABLE dbo.security_findings ADD [fingerprint] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.security_findings', 'source') IS NULL ALTER TABLE dbo.security_findings ADD [source] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.security_findings', 'severity') IS NULL ALTER TABLE dbo.security_findings ADD [severity] NVARCHAR(MAX) DEFAULT N'medium';
  IF COL_LENGTH('dbo.security_findings', 'title') IS NULL ALTER TABLE dbo.security_findings ADD [title] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.security_findings', 'detail') IS NULL ALTER TABLE dbo.security_findings ADD [detail] NVARCHAR(MAX) DEFAULT N'';
  IF COL_LENGTH('dbo.security_findings', 'deployment_ref') IS NULL ALTER TABLE dbo.security_findings ADD [deployment_ref] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.security_findings', 'status') IS NULL ALTER TABLE dbo.security_findings ADD [status] NVARCHAR(MAX) DEFAULT N'open';
  IF COL_LENGTH('dbo.security_findings', 'first_seen_at') IS NULL ALTER TABLE dbo.security_findings ADD [first_seen_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.security_findings', 'last_seen_at') IS NULL ALTER TABLE dbo.security_findings ADD [last_seen_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.security_findings', 'acknowledged_by') IS NULL ALTER TABLE dbo.security_findings ADD [acknowledged_by] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.security_findings', 'acknowledged_at') IS NULL ALTER TABLE dbo.security_findings ADD [acknowledged_at] DATETIME2(3);
  IF COL_LENGTH('dbo.security_findings', 'resolved_at') IS NULL ALTER TABLE dbo.security_findings ADD [resolved_at] DATETIME2(3);
  IF COL_LENGTH('dbo.security_findings', 'created_at') IS NULL ALTER TABLE dbo.security_findings ADD [created_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.security_findings', 'updated_at') IS NULL ALTER TABLE dbo.security_findings ADD [updated_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.security_findings', 'is_synced') IS NULL ALTER TABLE dbo.security_findings ADD [is_synced] BIT DEFAULT 0;
  IF COL_LENGTH('dbo.security_findings', 'sync_status') IS NULL ALTER TABLE dbo.security_findings ADD [sync_status] NVARCHAR(40) DEFAULT N'pending';
  IF COL_LENGTH('dbo.security_findings', 'row_version') IS NULL ALTER TABLE dbo.security_findings ADD [row_version] INT DEFAULT 0;
  IF COL_LENGTH('dbo.security_findings', 'sync_attempts') IS NULL ALTER TABLE dbo.security_findings ADD [sync_attempts] INT DEFAULT 0;
  IF COL_LENGTH('dbo.security_findings', 'last_error_at') IS NULL ALTER TABLE dbo.security_findings ADD [last_error_at] DATETIME2(3);
  IF COL_LENGTH('dbo.security_findings', 'client_transaction_id') IS NULL ALTER TABLE dbo.security_findings ADD [client_transaction_id] NVARCHAR(120);
END
GO
IF OBJECT_ID('dbo.settings_locks', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.settings_locks', 'section') IS NULL ALTER TABLE dbo.settings_locks ADD [section] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.settings_locks', 'locked') IS NULL ALTER TABLE dbo.settings_locks ADD [locked] BIT DEFAULT 0;
  IF COL_LENGTH('dbo.settings_locks', 'updated_by') IS NULL ALTER TABLE dbo.settings_locks ADD [updated_by] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.settings_locks', 'created_at') IS NULL ALTER TABLE dbo.settings_locks ADD [created_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.settings_locks', 'updated_at') IS NULL ALTER TABLE dbo.settings_locks ADD [updated_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.settings_locks', 'is_synced') IS NULL ALTER TABLE dbo.settings_locks ADD [is_synced] BIT DEFAULT 0;
  IF COL_LENGTH('dbo.settings_locks', 'sync_status') IS NULL ALTER TABLE dbo.settings_locks ADD [sync_status] NVARCHAR(40) DEFAULT N'pending';
  IF COL_LENGTH('dbo.settings_locks', 'row_version') IS NULL ALTER TABLE dbo.settings_locks ADD [row_version] INT DEFAULT 0;
  IF COL_LENGTH('dbo.settings_locks', 'sync_attempts') IS NULL ALTER TABLE dbo.settings_locks ADD [sync_attempts] INT DEFAULT 0;
  IF COL_LENGTH('dbo.settings_locks', 'last_error_at') IS NULL ALTER TABLE dbo.settings_locks ADD [last_error_at] DATETIME2(3);
  IF COL_LENGTH('dbo.settings_locks', 'client_transaction_id') IS NULL ALTER TABLE dbo.settings_locks ADD [client_transaction_id] NVARCHAR(120);
END
GO
IF OBJECT_ID('dbo.settings_overrides', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.settings_overrides', 'scope') IS NULL ALTER TABLE dbo.settings_overrides ADD [scope] NVARCHAR(MAX) DEFAULT N'BRANCH';
  IF COL_LENGTH('dbo.settings_overrides', 'scope_id') IS NULL ALTER TABLE dbo.settings_overrides ADD [scope_id] NVARCHAR(400) DEFAULT N'';
  IF COL_LENGTH('dbo.settings_overrides', 'section') IS NULL ALTER TABLE dbo.settings_overrides ADD [section] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.settings_overrides', 'patch') IS NULL ALTER TABLE dbo.settings_overrides ADD [patch] NVARCHAR(MAX) DEFAULT N'{}';
  IF COL_LENGTH('dbo.settings_overrides', 'updated_by') IS NULL ALTER TABLE dbo.settings_overrides ADD [updated_by] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.settings_overrides', 'created_at') IS NULL ALTER TABLE dbo.settings_overrides ADD [created_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.settings_overrides', 'updated_at') IS NULL ALTER TABLE dbo.settings_overrides ADD [updated_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.settings_overrides', 'is_synced') IS NULL ALTER TABLE dbo.settings_overrides ADD [is_synced] BIT DEFAULT 0;
  IF COL_LENGTH('dbo.settings_overrides', 'sync_status') IS NULL ALTER TABLE dbo.settings_overrides ADD [sync_status] NVARCHAR(40) DEFAULT N'pending';
  IF COL_LENGTH('dbo.settings_overrides', 'row_version') IS NULL ALTER TABLE dbo.settings_overrides ADD [row_version] INT DEFAULT 0;
  IF COL_LENGTH('dbo.settings_overrides', 'sync_attempts') IS NULL ALTER TABLE dbo.settings_overrides ADD [sync_attempts] INT DEFAULT 0;
  IF COL_LENGTH('dbo.settings_overrides', 'last_error_at') IS NULL ALTER TABLE dbo.settings_overrides ADD [last_error_at] DATETIME2(3);
  IF COL_LENGTH('dbo.settings_overrides', 'client_transaction_id') IS NULL ALTER TABLE dbo.settings_overrides ADD [client_transaction_id] NVARCHAR(120);
END
GO
IF OBJECT_ID('dbo.shift_sessions', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.shift_sessions', 'id') IS NULL ALTER TABLE dbo.shift_sessions ADD [id] UNIQUEIDENTIFIER DEFAULT NEWID();
  IF COL_LENGTH('dbo.shift_sessions', 'shift_id') IS NULL ALTER TABLE dbo.shift_sessions ADD [shift_id] NVARCHAR(400);
  IF COL_LENGTH('dbo.shift_sessions', 'store_id') IS NULL ALTER TABLE dbo.shift_sessions ADD [store_id] NVARCHAR(400);
  IF COL_LENGTH('dbo.shift_sessions', 'terminal_id') IS NULL ALTER TABLE dbo.shift_sessions ADD [terminal_id] NVARCHAR(400);
  IF COL_LENGTH('dbo.shift_sessions', 'terminal_name') IS NULL ALTER TABLE dbo.shift_sessions ADD [terminal_name] NVARCHAR(400);
  IF COL_LENGTH('dbo.shift_sessions', 'staff_id') IS NULL ALTER TABLE dbo.shift_sessions ADD [staff_id] NVARCHAR(400);
  IF COL_LENGTH('dbo.shift_sessions', 'staff_name') IS NULL ALTER TABLE dbo.shift_sessions ADD [staff_name] NVARCHAR(400);
  IF COL_LENGTH('dbo.shift_sessions', 'role') IS NULL ALTER TABLE dbo.shift_sessions ADD [role] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.shift_sessions', 'signed_in_at') IS NULL ALTER TABLE dbo.shift_sessions ADD [signed_in_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.shift_sessions', 'signed_out_at') IS NULL ALTER TABLE dbo.shift_sessions ADD [signed_out_at] DATETIME2(3);
  IF COL_LENGTH('dbo.shift_sessions', 'created_at') IS NULL ALTER TABLE dbo.shift_sessions ADD [created_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.shift_sessions', 'updated_at') IS NULL ALTER TABLE dbo.shift_sessions ADD [updated_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.shift_sessions', 'row_version') IS NULL ALTER TABLE dbo.shift_sessions ADD [row_version] INT DEFAULT 1;
  IF COL_LENGTH('dbo.shift_sessions', 'is_synced') IS NULL ALTER TABLE dbo.shift_sessions ADD [is_synced] BIT DEFAULT 0;
  IF COL_LENGTH('dbo.shift_sessions', 'sync_status') IS NULL ALTER TABLE dbo.shift_sessions ADD [sync_status] NVARCHAR(40) DEFAULT N'pending';
  IF COL_LENGTH('dbo.shift_sessions', 'sync_attempts') IS NULL ALTER TABLE dbo.shift_sessions ADD [sync_attempts] INT DEFAULT 0;
  IF COL_LENGTH('dbo.shift_sessions', 'last_error_at') IS NULL ALTER TABLE dbo.shift_sessions ADD [last_error_at] DATETIME2(3);
  IF COL_LENGTH('dbo.shift_sessions', 'client_transaction_id') IS NULL ALTER TABLE dbo.shift_sessions ADD [client_transaction_id] NVARCHAR(120);
END
GO
IF OBJECT_ID('dbo.shifts', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.shifts', 'id') IS NULL ALTER TABLE dbo.shifts ADD [id] UNIQUEIDENTIFIER DEFAULT NEWID();
  IF COL_LENGTH('dbo.shifts', 'store_id') IS NULL ALTER TABLE dbo.shifts ADD [store_id] NVARCHAR(400);
  IF COL_LENGTH('dbo.shifts', 'terminal_id') IS NULL ALTER TABLE dbo.shifts ADD [terminal_id] NVARCHAR(400);
  IF COL_LENGTH('dbo.shifts', 'terminal_name') IS NULL ALTER TABLE dbo.shifts ADD [terminal_name] NVARCHAR(400);
  IF COL_LENGTH('dbo.shifts', 'opened_by_name') IS NULL ALTER TABLE dbo.shifts ADD [opened_by_name] NVARCHAR(400) DEFAULT N'Cashier';
  IF COL_LENGTH('dbo.shifts', 'opened_by_staff_id') IS NULL ALTER TABLE dbo.shifts ADD [opened_by_staff_id] NVARCHAR(400);
  IF COL_LENGTH('dbo.shifts', 'opened_by_role') IS NULL ALTER TABLE dbo.shifts ADD [opened_by_role] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.shifts', 'closed_by_name') IS NULL ALTER TABLE dbo.shifts ADD [closed_by_name] NVARCHAR(400);
  IF COL_LENGTH('dbo.shifts', 'closed_by_staff_id') IS NULL ALTER TABLE dbo.shifts ADD [closed_by_staff_id] NVARCHAR(400);
  IF COL_LENGTH('dbo.shifts', 'closed_by_role') IS NULL ALTER TABLE dbo.shifts ADD [closed_by_role] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.shifts', 'opened_at') IS NULL ALTER TABLE dbo.shifts ADD [opened_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.shifts', 'closed_at') IS NULL ALTER TABLE dbo.shifts ADD [closed_at] DATETIME2(3);
  IF COL_LENGTH('dbo.shifts', 'opening_float') IS NULL ALTER TABLE dbo.shifts ADD [opening_float] DECIMAL(18,4) DEFAULT 0;
  IF COL_LENGTH('dbo.shifts', 'counted_cash') IS NULL ALTER TABLE dbo.shifts ADD [counted_cash] DECIMAL(18,4);
  IF COL_LENGTH('dbo.shifts', 'expected_cash') IS NULL ALTER TABLE dbo.shifts ADD [expected_cash] DECIMAL(18,4);
  IF COL_LENGTH('dbo.shifts', 'note') IS NULL ALTER TABLE dbo.shifts ADD [note] NVARCHAR(MAX) DEFAULT N'';
  IF COL_LENGTH('dbo.shifts', 'overdue') IS NULL ALTER TABLE dbo.shifts ADD [overdue] BIT DEFAULT 0;
  IF COL_LENGTH('dbo.shifts', 'created_at') IS NULL ALTER TABLE dbo.shifts ADD [created_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.shifts', 'updated_at') IS NULL ALTER TABLE dbo.shifts ADD [updated_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.shifts', 'status') IS NULL ALTER TABLE dbo.shifts ADD [status] NVARCHAR(MAX) DEFAULT N'OPEN';
  IF COL_LENGTH('dbo.shifts', 'closing_float') IS NULL ALTER TABLE dbo.shifts ADD [closing_float] DECIMAL(18,4);
  IF COL_LENGTH('dbo.shifts', 'user_id') IS NULL ALTER TABLE dbo.shifts ADD [user_id] UNIQUEIDENTIFIER;
  IF COL_LENGTH('dbo.shifts', 'row_version') IS NULL ALTER TABLE dbo.shifts ADD [row_version] INT DEFAULT 1;
  IF COL_LENGTH('dbo.shifts', 'counted_card') IS NULL ALTER TABLE dbo.shifts ADD [counted_card] DECIMAL(18,4);
  IF COL_LENGTH('dbo.shifts', 'counted_digital') IS NULL ALTER TABLE dbo.shifts ADD [counted_digital] DECIMAL(18,4);
  IF COL_LENGTH('dbo.shifts', 'expected_card') IS NULL ALTER TABLE dbo.shifts ADD [expected_card] DECIMAL(18,4);
  IF COL_LENGTH('dbo.shifts', 'expected_digital') IS NULL ALTER TABLE dbo.shifts ADD [expected_digital] DECIMAL(18,4);
  IF COL_LENGTH('dbo.shifts', 'variance_cash') IS NULL ALTER TABLE dbo.shifts ADD [variance_cash] DECIMAL(18,4);
  IF COL_LENGTH('dbo.shifts', 'variance_card') IS NULL ALTER TABLE dbo.shifts ADD [variance_card] DECIMAL(18,4);
  IF COL_LENGTH('dbo.shifts', 'variance_digital') IS NULL ALTER TABLE dbo.shifts ADD [variance_digital] DECIMAL(18,4);
  IF COL_LENGTH('dbo.shifts', 'variance_total') IS NULL ALTER TABLE dbo.shifts ADD [variance_total] DECIMAL(18,4);
  IF COL_LENGTH('dbo.shifts', 'is_synced') IS NULL ALTER TABLE dbo.shifts ADD [is_synced] BIT DEFAULT 0;
  IF COL_LENGTH('dbo.shifts', 'sync_status') IS NULL ALTER TABLE dbo.shifts ADD [sync_status] NVARCHAR(40) DEFAULT N'pending';
  IF COL_LENGTH('dbo.shifts', 'sync_attempts') IS NULL ALTER TABLE dbo.shifts ADD [sync_attempts] INT DEFAULT 0;
  IF COL_LENGTH('dbo.shifts', 'last_error_at') IS NULL ALTER TABLE dbo.shifts ADD [last_error_at] DATETIME2(3);
  IF COL_LENGTH('dbo.shifts', 'client_transaction_id') IS NULL ALTER TABLE dbo.shifts ADD [client_transaction_id] NVARCHAR(120);
END
GO
IF OBJECT_ID('dbo.sku_audit', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.sku_audit', 'id') IS NULL ALTER TABLE dbo.sku_audit ADD [id] UNIQUEIDENTIFIER DEFAULT NEWID();
  IF COL_LENGTH('dbo.sku_audit', 'sku') IS NULL ALTER TABLE dbo.sku_audit ADD [sku] NVARCHAR(400);
  IF COL_LENGTH('dbo.sku_audit', 'product_id') IS NULL ALTER TABLE dbo.sku_audit ADD [product_id] UNIQUEIDENTIFIER;
  IF COL_LENGTH('dbo.sku_audit', 'product_name') IS NULL ALTER TABLE dbo.sku_audit ADD [product_name] NVARCHAR(400);
  IF COL_LENGTH('dbo.sku_audit', 'source') IS NULL ALTER TABLE dbo.sku_audit ADD [source] NVARCHAR(MAX) DEFAULT N'auto';
  IF COL_LENGTH('dbo.sku_audit', 'previous_sku') IS NULL ALTER TABLE dbo.sku_audit ADD [previous_sku] NVARCHAR(400);
  IF COL_LENGTH('dbo.sku_audit', 'store_id') IS NULL ALTER TABLE dbo.sku_audit ADD [store_id] NVARCHAR(400);
  IF COL_LENGTH('dbo.sku_audit', 'store_name') IS NULL ALTER TABLE dbo.sku_audit ADD [store_name] NVARCHAR(400);
  IF COL_LENGTH('dbo.sku_audit', 'terminal_id') IS NULL ALTER TABLE dbo.sku_audit ADD [terminal_id] NVARCHAR(400);
  IF COL_LENGTH('dbo.sku_audit', 'staff_id') IS NULL ALTER TABLE dbo.sku_audit ADD [staff_id] NVARCHAR(400);
  IF COL_LENGTH('dbo.sku_audit', 'staff_name') IS NULL ALTER TABLE dbo.sku_audit ADD [staff_name] NVARCHAR(400);
  IF COL_LENGTH('dbo.sku_audit', 'role') IS NULL ALTER TABLE dbo.sku_audit ADD [role] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.sku_audit', 'created_at') IS NULL ALTER TABLE dbo.sku_audit ADD [created_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.sku_audit', 'is_synced') IS NULL ALTER TABLE dbo.sku_audit ADD [is_synced] BIT DEFAULT 0;
  IF COL_LENGTH('dbo.sku_audit', 'sync_status') IS NULL ALTER TABLE dbo.sku_audit ADD [sync_status] NVARCHAR(40) DEFAULT N'pending';
  IF COL_LENGTH('dbo.sku_audit', 'row_version') IS NULL ALTER TABLE dbo.sku_audit ADD [row_version] INT DEFAULT 0;
  IF COL_LENGTH('dbo.sku_audit', 'sync_attempts') IS NULL ALTER TABLE dbo.sku_audit ADD [sync_attempts] INT DEFAULT 0;
  IF COL_LENGTH('dbo.sku_audit', 'last_error_at') IS NULL ALTER TABLE dbo.sku_audit ADD [last_error_at] DATETIME2(3);
  IF COL_LENGTH('dbo.sku_audit', 'client_transaction_id') IS NULL ALTER TABLE dbo.sku_audit ADD [client_transaction_id] NVARCHAR(120);
END
GO
IF OBJECT_ID('dbo.staff_roles', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.staff_roles', 'slug') IS NULL ALTER TABLE dbo.staff_roles ADD [slug] NVARCHAR(400);
  IF COL_LENGTH('dbo.staff_roles', 'name') IS NULL ALTER TABLE dbo.staff_roles ADD [name] NVARCHAR(400);
  IF COL_LENGTH('dbo.staff_roles', 'base_level') IS NULL ALTER TABLE dbo.staff_roles ADD [base_level] NVARCHAR(MAX) DEFAULT N'cashier';
  IF COL_LENGTH('dbo.staff_roles', 'permissions') IS NULL ALTER TABLE dbo.staff_roles ADD [permissions] NVARCHAR(MAX) DEFAULT N'{}';
  IF COL_LENGTH('dbo.staff_roles', 'is_core') IS NULL ALTER TABLE dbo.staff_roles ADD [is_core] BIT DEFAULT 0;
  IF COL_LENGTH('dbo.staff_roles', 'created_at') IS NULL ALTER TABLE dbo.staff_roles ADD [created_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.staff_roles', 'updated_at') IS NULL ALTER TABLE dbo.staff_roles ADD [updated_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.staff_roles', 'is_synced') IS NULL ALTER TABLE dbo.staff_roles ADD [is_synced] BIT DEFAULT 0;
  IF COL_LENGTH('dbo.staff_roles', 'sync_status') IS NULL ALTER TABLE dbo.staff_roles ADD [sync_status] NVARCHAR(40) DEFAULT N'pending';
  IF COL_LENGTH('dbo.staff_roles', 'row_version') IS NULL ALTER TABLE dbo.staff_roles ADD [row_version] INT DEFAULT 0;
  IF COL_LENGTH('dbo.staff_roles', 'sync_attempts') IS NULL ALTER TABLE dbo.staff_roles ADD [sync_attempts] INT DEFAULT 0;
  IF COL_LENGTH('dbo.staff_roles', 'last_error_at') IS NULL ALTER TABLE dbo.staff_roles ADD [last_error_at] DATETIME2(3);
  IF COL_LENGTH('dbo.staff_roles', 'client_transaction_id') IS NULL ALTER TABLE dbo.staff_roles ADD [client_transaction_id] NVARCHAR(120);
END
GO
IF OBJECT_ID('dbo.stock_adjustments', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.stock_adjustments', 'id') IS NULL ALTER TABLE dbo.stock_adjustments ADD [id] UNIQUEIDENTIFIER DEFAULT NEWID();
  IF COL_LENGTH('dbo.stock_adjustments', 'product_id') IS NULL ALTER TABLE dbo.stock_adjustments ADD [product_id] UNIQUEIDENTIFIER;
  IF COL_LENGTH('dbo.stock_adjustments', 'product_name') IS NULL ALTER TABLE dbo.stock_adjustments ADD [product_name] NVARCHAR(400);
  IF COL_LENGTH('dbo.stock_adjustments', 'sku') IS NULL ALTER TABLE dbo.stock_adjustments ADD [sku] NVARCHAR(400);
  IF COL_LENGTH('dbo.stock_adjustments', 'barcode') IS NULL ALTER TABLE dbo.stock_adjustments ADD [barcode] NVARCHAR(400);
  IF COL_LENGTH('dbo.stock_adjustments', 'store_id') IS NULL ALTER TABLE dbo.stock_adjustments ADD [store_id] NVARCHAR(400);
  IF COL_LENGTH('dbo.stock_adjustments', 'terminal_id') IS NULL ALTER TABLE dbo.stock_adjustments ADD [terminal_id] NVARCHAR(400);
  IF COL_LENGTH('dbo.stock_adjustments', 'reason') IS NULL ALTER TABLE dbo.stock_adjustments ADD [reason] NVARCHAR(MAX) DEFAULT N'manual';
  IF COL_LENGTH('dbo.stock_adjustments', 'note') IS NULL ALTER TABLE dbo.stock_adjustments ADD [note] NVARCHAR(MAX) DEFAULT N'';
  IF COL_LENGTH('dbo.stock_adjustments', 'previous_stock') IS NULL ALTER TABLE dbo.stock_adjustments ADD [previous_stock] INT DEFAULT 0;
  IF COL_LENGTH('dbo.stock_adjustments', 'updated_stock') IS NULL ALTER TABLE dbo.stock_adjustments ADD [updated_stock] INT DEFAULT 0;
  IF COL_LENGTH('dbo.stock_adjustments', 'delta') IS NULL ALTER TABLE dbo.stock_adjustments ADD [delta] INT DEFAULT 0;
  IF COL_LENGTH('dbo.stock_adjustments', 'cost_impact') IS NULL ALTER TABLE dbo.stock_adjustments ADD [cost_impact] DECIMAL(18,4) DEFAULT 0;
  IF COL_LENGTH('dbo.stock_adjustments', 'staff_id') IS NULL ALTER TABLE dbo.stock_adjustments ADD [staff_id] NVARCHAR(400);
  IF COL_LENGTH('dbo.stock_adjustments', 'staff_name') IS NULL ALTER TABLE dbo.stock_adjustments ADD [staff_name] NVARCHAR(400);
  IF COL_LENGTH('dbo.stock_adjustments', 'role') IS NULL ALTER TABLE dbo.stock_adjustments ADD [role] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.stock_adjustments', 'created_at') IS NULL ALTER TABLE dbo.stock_adjustments ADD [created_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.stock_adjustments', 'row_version') IS NULL ALTER TABLE dbo.stock_adjustments ADD [row_version] INT DEFAULT 1;
  IF COL_LENGTH('dbo.stock_adjustments', 'is_synced') IS NULL ALTER TABLE dbo.stock_adjustments ADD [is_synced] BIT DEFAULT 0;
  IF COL_LENGTH('dbo.stock_adjustments', 'sync_status') IS NULL ALTER TABLE dbo.stock_adjustments ADD [sync_status] NVARCHAR(40) DEFAULT N'pending';
  IF COL_LENGTH('dbo.stock_adjustments', 'sync_attempts') IS NULL ALTER TABLE dbo.stock_adjustments ADD [sync_attempts] INT DEFAULT 0;
  IF COL_LENGTH('dbo.stock_adjustments', 'last_error_at') IS NULL ALTER TABLE dbo.stock_adjustments ADD [last_error_at] DATETIME2(3);
  IF COL_LENGTH('dbo.stock_adjustments', 'client_transaction_id') IS NULL ALTER TABLE dbo.stock_adjustments ADD [client_transaction_id] NVARCHAR(120);
END
GO
IF OBJECT_ID('dbo.stock_delta_applied', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.stock_delta_applied', 'movement_id') IS NULL ALTER TABLE dbo.stock_delta_applied ADD [movement_id] UNIQUEIDENTIFIER;
  IF COL_LENGTH('dbo.stock_delta_applied', 'product_id') IS NULL ALTER TABLE dbo.stock_delta_applied ADD [product_id] UNIQUEIDENTIFIER;
  IF COL_LENGTH('dbo.stock_delta_applied', 'store_id') IS NULL ALTER TABLE dbo.stock_delta_applied ADD [store_id] NVARCHAR(400);
  IF COL_LENGTH('dbo.stock_delta_applied', 'delta') IS NULL ALTER TABLE dbo.stock_delta_applied ADD [delta] INT DEFAULT 0;
  IF COL_LENGTH('dbo.stock_delta_applied', 'applied_at') IS NULL ALTER TABLE dbo.stock_delta_applied ADD [applied_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.stock_delta_applied', 'is_synced') IS NULL ALTER TABLE dbo.stock_delta_applied ADD [is_synced] BIT DEFAULT 0;
  IF COL_LENGTH('dbo.stock_delta_applied', 'sync_status') IS NULL ALTER TABLE dbo.stock_delta_applied ADD [sync_status] NVARCHAR(40) DEFAULT N'pending';
  IF COL_LENGTH('dbo.stock_delta_applied', 'row_version') IS NULL ALTER TABLE dbo.stock_delta_applied ADD [row_version] INT DEFAULT 0;
  IF COL_LENGTH('dbo.stock_delta_applied', 'sync_attempts') IS NULL ALTER TABLE dbo.stock_delta_applied ADD [sync_attempts] INT DEFAULT 0;
  IF COL_LENGTH('dbo.stock_delta_applied', 'last_error_at') IS NULL ALTER TABLE dbo.stock_delta_applied ADD [last_error_at] DATETIME2(3);
  IF COL_LENGTH('dbo.stock_delta_applied', 'client_transaction_id') IS NULL ALTER TABLE dbo.stock_delta_applied ADD [client_transaction_id] NVARCHAR(120);
END
GO
IF OBJECT_ID('dbo.stock_transfer_items', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.stock_transfer_items', 'id') IS NULL ALTER TABLE dbo.stock_transfer_items ADD [id] UNIQUEIDENTIFIER DEFAULT NEWID();
  IF COL_LENGTH('dbo.stock_transfer_items', 'transfer_id') IS NULL ALTER TABLE dbo.stock_transfer_items ADD [transfer_id] UNIQUEIDENTIFIER;
  IF COL_LENGTH('dbo.stock_transfer_items', 'product_id') IS NULL ALTER TABLE dbo.stock_transfer_items ADD [product_id] UNIQUEIDENTIFIER;
  IF COL_LENGTH('dbo.stock_transfer_items', 'barcode') IS NULL ALTER TABLE dbo.stock_transfer_items ADD [barcode] NVARCHAR(400);
  IF COL_LENGTH('dbo.stock_transfer_items', 'sku') IS NULL ALTER TABLE dbo.stock_transfer_items ADD [sku] NVARCHAR(400);
  IF COL_LENGTH('dbo.stock_transfer_items', 'product_name') IS NULL ALTER TABLE dbo.stock_transfer_items ADD [product_name] NVARCHAR(400);
  IF COL_LENGTH('dbo.stock_transfer_items', 'quantity') IS NULL ALTER TABLE dbo.stock_transfer_items ADD [quantity] INT DEFAULT 0;
  IF COL_LENGTH('dbo.stock_transfer_items', 'quantity_approved') IS NULL ALTER TABLE dbo.stock_transfer_items ADD [quantity_approved] INT;
  IF COL_LENGTH('dbo.stock_transfer_items', 'quantity_dispatched') IS NULL ALTER TABLE dbo.stock_transfer_items ADD [quantity_dispatched] INT;
  IF COL_LENGTH('dbo.stock_transfer_items', 'quantity_received') IS NULL ALTER TABLE dbo.stock_transfer_items ADD [quantity_received] INT DEFAULT 0;
  IF COL_LENGTH('dbo.stock_transfer_items', 'quantity_verified') IS NULL ALTER TABLE dbo.stock_transfer_items ADD [quantity_verified] INT;
  IF COL_LENGTH('dbo.stock_transfer_items', 'unit_cost') IS NULL ALTER TABLE dbo.stock_transfer_items ADD [unit_cost] DECIMAL(18,4) DEFAULT 0;
  IF COL_LENGTH('dbo.stock_transfer_items', 'created_at') IS NULL ALTER TABLE dbo.stock_transfer_items ADD [created_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.stock_transfer_items', 'row_version') IS NULL ALTER TABLE dbo.stock_transfer_items ADD [row_version] INT DEFAULT 1;
  IF COL_LENGTH('dbo.stock_transfer_items', 'is_synced') IS NULL ALTER TABLE dbo.stock_transfer_items ADD [is_synced] BIT DEFAULT 0;
  IF COL_LENGTH('dbo.stock_transfer_items', 'sync_status') IS NULL ALTER TABLE dbo.stock_transfer_items ADD [sync_status] NVARCHAR(40) DEFAULT N'pending';
  IF COL_LENGTH('dbo.stock_transfer_items', 'sync_attempts') IS NULL ALTER TABLE dbo.stock_transfer_items ADD [sync_attempts] INT DEFAULT 0;
  IF COL_LENGTH('dbo.stock_transfer_items', 'last_error_at') IS NULL ALTER TABLE dbo.stock_transfer_items ADD [last_error_at] DATETIME2(3);
  IF COL_LENGTH('dbo.stock_transfer_items', 'client_transaction_id') IS NULL ALTER TABLE dbo.stock_transfer_items ADD [client_transaction_id] NVARCHAR(120);
END
GO
IF OBJECT_ID('dbo.stock_transfers', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.stock_transfers', 'id') IS NULL ALTER TABLE dbo.stock_transfers ADD [id] UNIQUEIDENTIFIER DEFAULT NEWID();
  IF COL_LENGTH('dbo.stock_transfers', 'ref') IS NULL ALTER TABLE dbo.stock_transfers ADD [ref] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.stock_transfers', 'kind') IS NULL ALTER TABLE dbo.stock_transfers ADD [kind] NVARCHAR(MAX) DEFAULT N'transfer';
  IF COL_LENGTH('dbo.stock_transfers', 'transfer_scope') IS NULL ALTER TABLE dbo.stock_transfers ADD [transfer_scope] NVARCHAR(MAX) DEFAULT N'INTRA_GROUP';
  IF COL_LENGTH('dbo.stock_transfers', 'from_store_id') IS NULL ALTER TABLE dbo.stock_transfers ADD [from_store_id] NVARCHAR(400);
  IF COL_LENGTH('dbo.stock_transfers', 'from_store_name') IS NULL ALTER TABLE dbo.stock_transfers ADD [from_store_name] NVARCHAR(400);
  IF COL_LENGTH('dbo.stock_transfers', 'from_group_id') IS NULL ALTER TABLE dbo.stock_transfers ADD [from_group_id] NVARCHAR(400);
  IF COL_LENGTH('dbo.stock_transfers', 'to_store_id') IS NULL ALTER TABLE dbo.stock_transfers ADD [to_store_id] NVARCHAR(400);
  IF COL_LENGTH('dbo.stock_transfers', 'to_store_name') IS NULL ALTER TABLE dbo.stock_transfers ADD [to_store_name] NVARCHAR(400);
  IF COL_LENGTH('dbo.stock_transfers', 'to_group_id') IS NULL ALTER TABLE dbo.stock_transfers ADD [to_group_id] NVARCHAR(400);
  IF COL_LENGTH('dbo.stock_transfers', 'status') IS NULL ALTER TABLE dbo.stock_transfers ADD [status] NVARCHAR(MAX) DEFAULT N'pending';
  IF COL_LENGTH('dbo.stock_transfers', 'note') IS NULL ALTER TABLE dbo.stock_transfers ADD [note] NVARCHAR(MAX) DEFAULT N'';
  IF COL_LENGTH('dbo.stock_transfers', 'created_by') IS NULL ALTER TABLE dbo.stock_transfers ADD [created_by] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.stock_transfers', 'approved_by') IS NULL ALTER TABLE dbo.stock_transfers ADD [approved_by] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.stock_transfers', 'approved_at') IS NULL ALTER TABLE dbo.stock_transfers ADD [approved_at] DATETIME2(3);
  IF COL_LENGTH('dbo.stock_transfers', 'received_by') IS NULL ALTER TABLE dbo.stock_transfers ADD [received_by] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.stock_transfers', 'received_at') IS NULL ALTER TABLE dbo.stock_transfers ADD [received_at] DATETIME2(3);
  IF COL_LENGTH('dbo.stock_transfers', 'rejected_reason') IS NULL ALTER TABLE dbo.stock_transfers ADD [rejected_reason] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.stock_transfers', 'rejected_by') IS NULL ALTER TABLE dbo.stock_transfers ADD [rejected_by] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.stock_transfers', 'cancelled_reason') IS NULL ALTER TABLE dbo.stock_transfers ADD [cancelled_reason] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.stock_transfers', 'dispatched_by') IS NULL ALTER TABLE dbo.stock_transfers ADD [dispatched_by] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.stock_transfers', 'dispatched_at') IS NULL ALTER TABLE dbo.stock_transfers ADD [dispatched_at] DATETIME2(3);
  IF COL_LENGTH('dbo.stock_transfers', 'verified_by') IS NULL ALTER TABLE dbo.stock_transfers ADD [verified_by] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.stock_transfers', 'verified_at') IS NULL ALTER TABLE dbo.stock_transfers ADD [verified_at] DATETIME2(3);
  IF COL_LENGTH('dbo.stock_transfers', 'posted_at') IS NULL ALTER TABLE dbo.stock_transfers ADD [posted_at] DATETIME2(3);
  IF COL_LENGTH('dbo.stock_transfers', 'discrepancy_reason') IS NULL ALTER TABLE dbo.stock_transfers ADD [discrepancy_reason] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.stock_transfers', 'closed_at') IS NULL ALTER TABLE dbo.stock_transfers ADD [closed_at] DATETIME2(3);
  IF COL_LENGTH('dbo.stock_transfers', 'fulfilment') IS NULL ALTER TABLE dbo.stock_transfers ADD [fulfilment] NVARCHAR(40);
  IF COL_LENGTH('dbo.stock_transfers', 'created_at') IS NULL ALTER TABLE dbo.stock_transfers ADD [created_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.stock_transfers', 'updated_at') IS NULL ALTER TABLE dbo.stock_transfers ADD [updated_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.stock_transfers', 'row_version') IS NULL ALTER TABLE dbo.stock_transfers ADD [row_version] INT DEFAULT 1;
  IF COL_LENGTH('dbo.stock_transfers', 'is_synced') IS NULL ALTER TABLE dbo.stock_transfers ADD [is_synced] BIT DEFAULT 0;
  IF COL_LENGTH('dbo.stock_transfers', 'sync_status') IS NULL ALTER TABLE dbo.stock_transfers ADD [sync_status] NVARCHAR(40) DEFAULT N'pending';
  IF COL_LENGTH('dbo.stock_transfers', 'sync_attempts') IS NULL ALTER TABLE dbo.stock_transfers ADD [sync_attempts] INT DEFAULT 0;
  IF COL_LENGTH('dbo.stock_transfers', 'last_error_at') IS NULL ALTER TABLE dbo.stock_transfers ADD [last_error_at] DATETIME2(3);
  IF COL_LENGTH('dbo.stock_transfers', 'client_transaction_id') IS NULL ALTER TABLE dbo.stock_transfers ADD [client_transaction_id] NVARCHAR(120);
END
GO
IF OBJECT_ID('dbo.stores', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.stores', 'id') IS NULL ALTER TABLE dbo.stores ADD [id] NVARCHAR(400);
  IF COL_LENGTH('dbo.stores', 'code') IS NULL ALTER TABLE dbo.stores ADD [code] NVARCHAR(400);
  IF COL_LENGTH('dbo.stores', 'name') IS NULL ALTER TABLE dbo.stores ADD [name] NVARCHAR(400);
  IF COL_LENGTH('dbo.stores', 'address') IS NULL ALTER TABLE dbo.stores ADD [address] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.stores', 'phone') IS NULL ALTER TABLE dbo.stores ADD [phone] NVARCHAR(400);
  IF COL_LENGTH('dbo.stores', 'created_at') IS NULL ALTER TABLE dbo.stores ADD [created_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.stores', 'updated_at') IS NULL ALTER TABLE dbo.stores ADD [updated_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.stores', 'group_id') IS NULL ALTER TABLE dbo.stores ADD [group_id] NVARCHAR(400);
  IF COL_LENGTH('dbo.stores', 'row_version') IS NULL ALTER TABLE dbo.stores ADD [row_version] INT DEFAULT 1;
  IF COL_LENGTH('dbo.stores', 'location_type') IS NULL ALTER TABLE dbo.stores ADD [location_type] NVARCHAR(MAX) DEFAULT N'store';
  IF COL_LENGTH('dbo.stores', 'parent_id') IS NULL ALTER TABLE dbo.stores ADD [parent_id] NVARCHAR(400);
  IF COL_LENGTH('dbo.stores', 'is_central') IS NULL ALTER TABLE dbo.stores ADD [is_central] BIT DEFAULT 0;
  IF COL_LENGTH('dbo.stores', 'building_name') IS NULL ALTER TABLE dbo.stores ADD [building_name] NVARCHAR(400);
  IF COL_LENGTH('dbo.stores', 'floor_label') IS NULL ALTER TABLE dbo.stores ADD [floor_label] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.stores', 'is_active') IS NULL ALTER TABLE dbo.stores ADD [is_active] BIT DEFAULT 1;
  IF COL_LENGTH('dbo.stores', 'archived_at') IS NULL ALTER TABLE dbo.stores ADD [archived_at] DATETIME2(3);
  IF COL_LENGTH('dbo.stores', 'is_primary_sub') IS NULL ALTER TABLE dbo.stores ADD [is_primary_sub] BIT DEFAULT 0;
  IF COL_LENGTH('dbo.stores', 'private_catalogue') IS NULL ALTER TABLE dbo.stores ADD [private_catalogue] BIT DEFAULT 0;
  IF COL_LENGTH('dbo.stores', 'is_synced') IS NULL ALTER TABLE dbo.stores ADD [is_synced] BIT DEFAULT 0;
  IF COL_LENGTH('dbo.stores', 'sync_status') IS NULL ALTER TABLE dbo.stores ADD [sync_status] NVARCHAR(40) DEFAULT N'pending';
  IF COL_LENGTH('dbo.stores', 'sync_attempts') IS NULL ALTER TABLE dbo.stores ADD [sync_attempts] INT DEFAULT 0;
  IF COL_LENGTH('dbo.stores', 'last_error_at') IS NULL ALTER TABLE dbo.stores ADD [last_error_at] DATETIME2(3);
  IF COL_LENGTH('dbo.stores', 'client_transaction_id') IS NULL ALTER TABLE dbo.stores ADD [client_transaction_id] NVARCHAR(120);
END
GO
IF OBJECT_ID('dbo.suppliers', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.suppliers', 'id') IS NULL ALTER TABLE dbo.suppliers ADD [id] UNIQUEIDENTIFIER DEFAULT NEWID();
  IF COL_LENGTH('dbo.suppliers', 'name') IS NULL ALTER TABLE dbo.suppliers ADD [name] NVARCHAR(400);
  IF COL_LENGTH('dbo.suppliers', 'contact_name') IS NULL ALTER TABLE dbo.suppliers ADD [contact_name] NVARCHAR(400);
  IF COL_LENGTH('dbo.suppliers', 'phone') IS NULL ALTER TABLE dbo.suppliers ADD [phone] NVARCHAR(400);
  IF COL_LENGTH('dbo.suppliers', 'email') IS NULL ALTER TABLE dbo.suppliers ADD [email] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.suppliers', 'address') IS NULL ALTER TABLE dbo.suppliers ADD [address] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.suppliers', 'tax_number') IS NULL ALTER TABLE dbo.suppliers ADD [tax_number] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.suppliers', 'notes') IS NULL ALTER TABLE dbo.suppliers ADD [notes] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.suppliers', 'is_active') IS NULL ALTER TABLE dbo.suppliers ADD [is_active] BIT DEFAULT 1;
  IF COL_LENGTH('dbo.suppliers', 'created_at') IS NULL ALTER TABLE dbo.suppliers ADD [created_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.suppliers', 'updated_at') IS NULL ALTER TABLE dbo.suppliers ADD [updated_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.suppliers', 'row_version') IS NULL ALTER TABLE dbo.suppliers ADD [row_version] INT DEFAULT 1;
  IF COL_LENGTH('dbo.suppliers', 'is_synced') IS NULL ALTER TABLE dbo.suppliers ADD [is_synced] BIT DEFAULT 0;
  IF COL_LENGTH('dbo.suppliers', 'sync_status') IS NULL ALTER TABLE dbo.suppliers ADD [sync_status] NVARCHAR(40) DEFAULT N'pending';
  IF COL_LENGTH('dbo.suppliers', 'sync_attempts') IS NULL ALTER TABLE dbo.suppliers ADD [sync_attempts] INT DEFAULT 0;
  IF COL_LENGTH('dbo.suppliers', 'last_error_at') IS NULL ALTER TABLE dbo.suppliers ADD [last_error_at] DATETIME2(3);
  IF COL_LENGTH('dbo.suppliers', 'client_transaction_id') IS NULL ALTER TABLE dbo.suppliers ADD [client_transaction_id] NVARCHAR(120);
END
GO
IF OBJECT_ID('dbo.sync_metadata', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.sync_metadata', 'id') IS NULL ALTER TABLE dbo.sync_metadata ADD [id] UNIQUEIDENTIFIER DEFAULT NEWID();
  IF COL_LENGTH('dbo.sync_metadata', 'store_id') IS NULL ALTER TABLE dbo.sync_metadata ADD [store_id] NVARCHAR(400);
  IF COL_LENGTH('dbo.sync_metadata', 'terminal_id') IS NULL ALTER TABLE dbo.sync_metadata ADD [terminal_id] NVARCHAR(400);
  IF COL_LENGTH('dbo.sync_metadata', 'table_name') IS NULL ALTER TABLE dbo.sync_metadata ADD [table_name] NVARCHAR(400);
  IF COL_LENGTH('dbo.sync_metadata', 'last_synced_at') IS NULL ALTER TABLE dbo.sync_metadata ADD [last_synced_at] DATETIME2(3);
  IF COL_LENGTH('dbo.sync_metadata', 'last_pushed_at') IS NULL ALTER TABLE dbo.sync_metadata ADD [last_pushed_at] DATETIME2(3);
  IF COL_LENGTH('dbo.sync_metadata', 'rows_pushed') IS NULL ALTER TABLE dbo.sync_metadata ADD [rows_pushed] INT DEFAULT 0;
  IF COL_LENGTH('dbo.sync_metadata', 'last_error') IS NULL ALTER TABLE dbo.sync_metadata ADD [last_error] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.sync_metadata', 'created_at') IS NULL ALTER TABLE dbo.sync_metadata ADD [created_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.sync_metadata', 'updated_at') IS NULL ALTER TABLE dbo.sync_metadata ADD [updated_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.sync_metadata', 'is_synced') IS NULL ALTER TABLE dbo.sync_metadata ADD [is_synced] BIT DEFAULT 0;
  IF COL_LENGTH('dbo.sync_metadata', 'sync_status') IS NULL ALTER TABLE dbo.sync_metadata ADD [sync_status] NVARCHAR(40) DEFAULT N'pending';
  IF COL_LENGTH('dbo.sync_metadata', 'row_version') IS NULL ALTER TABLE dbo.sync_metadata ADD [row_version] INT DEFAULT 0;
  IF COL_LENGTH('dbo.sync_metadata', 'sync_attempts') IS NULL ALTER TABLE dbo.sync_metadata ADD [sync_attempts] INT DEFAULT 0;
  IF COL_LENGTH('dbo.sync_metadata', 'last_error_at') IS NULL ALTER TABLE dbo.sync_metadata ADD [last_error_at] DATETIME2(3);
  IF COL_LENGTH('dbo.sync_metadata', 'client_transaction_id') IS NULL ALTER TABLE dbo.sync_metadata ADD [client_transaction_id] NVARCHAR(120);
END
GO
IF OBJECT_ID('dbo.system_audit_logs', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.system_audit_logs', 'id') IS NULL ALTER TABLE dbo.system_audit_logs ADD [id] UNIQUEIDENTIFIER DEFAULT NEWID();
  IF COL_LENGTH('dbo.system_audit_logs', 'actor_id') IS NULL ALTER TABLE dbo.system_audit_logs ADD [actor_id] NVARCHAR(400);
  IF COL_LENGTH('dbo.system_audit_logs', 'actor_name') IS NULL ALTER TABLE dbo.system_audit_logs ADD [actor_name] NVARCHAR(400);
  IF COL_LENGTH('dbo.system_audit_logs', 'actor_role') IS NULL ALTER TABLE dbo.system_audit_logs ADD [actor_role] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.system_audit_logs', 'action_type') IS NULL ALTER TABLE dbo.system_audit_logs ADD [action_type] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.system_audit_logs', 'entity_affected') IS NULL ALTER TABLE dbo.system_audit_logs ADD [entity_affected] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.system_audit_logs', 'entity_id') IS NULL ALTER TABLE dbo.system_audit_logs ADD [entity_id] NVARCHAR(400);
  IF COL_LENGTH('dbo.system_audit_logs', 'old_value') IS NULL ALTER TABLE dbo.system_audit_logs ADD [old_value] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.system_audit_logs', 'new_value') IS NULL ALTER TABLE dbo.system_audit_logs ADD [new_value] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.system_audit_logs', 'terminal_id') IS NULL ALTER TABLE dbo.system_audit_logs ADD [terminal_id] NVARCHAR(400);
  IF COL_LENGTH('dbo.system_audit_logs', 'ip_address') IS NULL ALTER TABLE dbo.system_audit_logs ADD [ip_address] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.system_audit_logs', 'store_id') IS NULL ALTER TABLE dbo.system_audit_logs ADD [store_id] NVARCHAR(400);
  IF COL_LENGTH('dbo.system_audit_logs', 'note') IS NULL ALTER TABLE dbo.system_audit_logs ADD [note] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.system_audit_logs', 'created_at') IS NULL ALTER TABLE dbo.system_audit_logs ADD [created_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.system_audit_logs', 'is_synced') IS NULL ALTER TABLE dbo.system_audit_logs ADD [is_synced] BIT DEFAULT 0;
  IF COL_LENGTH('dbo.system_audit_logs', 'sync_status') IS NULL ALTER TABLE dbo.system_audit_logs ADD [sync_status] NVARCHAR(40) DEFAULT N'pending';
  IF COL_LENGTH('dbo.system_audit_logs', 'row_version') IS NULL ALTER TABLE dbo.system_audit_logs ADD [row_version] INT DEFAULT 0;
  IF COL_LENGTH('dbo.system_audit_logs', 'sync_attempts') IS NULL ALTER TABLE dbo.system_audit_logs ADD [sync_attempts] INT DEFAULT 0;
  IF COL_LENGTH('dbo.system_audit_logs', 'last_error_at') IS NULL ALTER TABLE dbo.system_audit_logs ADD [last_error_at] DATETIME2(3);
  IF COL_LENGTH('dbo.system_audit_logs', 'client_transaction_id') IS NULL ALTER TABLE dbo.system_audit_logs ADD [client_transaction_id] NVARCHAR(120);
END
GO
IF OBJECT_ID('dbo.terminal_commands', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.terminal_commands', 'id') IS NULL ALTER TABLE dbo.terminal_commands ADD [id] UNIQUEIDENTIFIER DEFAULT NEWID();
  IF COL_LENGTH('dbo.terminal_commands', 'terminal_id') IS NULL ALTER TABLE dbo.terminal_commands ADD [terminal_id] NVARCHAR(400);
  IF COL_LENGTH('dbo.terminal_commands', 'store_id') IS NULL ALTER TABLE dbo.terminal_commands ADD [store_id] NVARCHAR(400);
  IF COL_LENGTH('dbo.terminal_commands', 'command') IS NULL ALTER TABLE dbo.terminal_commands ADD [command] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.terminal_commands', 'status') IS NULL ALTER TABLE dbo.terminal_commands ADD [status] NVARCHAR(MAX) DEFAULT N'pending';
  IF COL_LENGTH('dbo.terminal_commands', 'note') IS NULL ALTER TABLE dbo.terminal_commands ADD [note] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.terminal_commands', 'result') IS NULL ALTER TABLE dbo.terminal_commands ADD [result] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.terminal_commands', 'issued_by') IS NULL ALTER TABLE dbo.terminal_commands ADD [issued_by] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.terminal_commands', 'issued_role') IS NULL ALTER TABLE dbo.terminal_commands ADD [issued_role] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.terminal_commands', 'picked_up_at') IS NULL ALTER TABLE dbo.terminal_commands ADD [picked_up_at] DATETIME2(3);
  IF COL_LENGTH('dbo.terminal_commands', 'finished_at') IS NULL ALTER TABLE dbo.terminal_commands ADD [finished_at] DATETIME2(3);
  IF COL_LENGTH('dbo.terminal_commands', 'created_at') IS NULL ALTER TABLE dbo.terminal_commands ADD [created_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.terminal_commands', 'updated_at') IS NULL ALTER TABLE dbo.terminal_commands ADD [updated_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.terminal_commands', 'is_synced') IS NULL ALTER TABLE dbo.terminal_commands ADD [is_synced] BIT DEFAULT 0;
  IF COL_LENGTH('dbo.terminal_commands', 'sync_status') IS NULL ALTER TABLE dbo.terminal_commands ADD [sync_status] NVARCHAR(40) DEFAULT N'pending';
  IF COL_LENGTH('dbo.terminal_commands', 'row_version') IS NULL ALTER TABLE dbo.terminal_commands ADD [row_version] INT DEFAULT 0;
  IF COL_LENGTH('dbo.terminal_commands', 'sync_attempts') IS NULL ALTER TABLE dbo.terminal_commands ADD [sync_attempts] INT DEFAULT 0;
  IF COL_LENGTH('dbo.terminal_commands', 'last_error_at') IS NULL ALTER TABLE dbo.terminal_commands ADD [last_error_at] DATETIME2(3);
  IF COL_LENGTH('dbo.terminal_commands', 'client_transaction_id') IS NULL ALTER TABLE dbo.terminal_commands ADD [client_transaction_id] NVARCHAR(120);
END
GO
IF OBJECT_ID('dbo.terminal_tokens', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.terminal_tokens', 'id') IS NULL ALTER TABLE dbo.terminal_tokens ADD [id] UNIQUEIDENTIFIER DEFAULT NEWID();
  IF COL_LENGTH('dbo.terminal_tokens', 'location_id') IS NULL ALTER TABLE dbo.terminal_tokens ADD [location_id] NVARCHAR(400);
  IF COL_LENGTH('dbo.terminal_tokens', 'location_name') IS NULL ALTER TABLE dbo.terminal_tokens ADD [location_name] NVARCHAR(400);
  IF COL_LENGTH('dbo.terminal_tokens', 'device_name') IS NULL ALTER TABLE dbo.terminal_tokens ADD [device_name] NVARCHAR(400);
  IF COL_LENGTH('dbo.terminal_tokens', 'status') IS NULL ALTER TABLE dbo.terminal_tokens ADD [status] NVARCHAR(MAX) DEFAULT N'active';
  IF COL_LENGTH('dbo.terminal_tokens', 'created_at') IS NULL ALTER TABLE dbo.terminal_tokens ADD [created_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.terminal_tokens', 'activated_at') IS NULL ALTER TABLE dbo.terminal_tokens ADD [activated_at] DATETIME2(3);
  IF COL_LENGTH('dbo.terminal_tokens', 'revoked_at') IS NULL ALTER TABLE dbo.terminal_tokens ADD [revoked_at] DATETIME2(3);
  IF COL_LENGTH('dbo.terminal_tokens', 'last_seen_at') IS NULL ALTER TABLE dbo.terminal_tokens ADD [last_seen_at] DATETIME2(3);
  IF COL_LENGTH('dbo.terminal_tokens', 'reissued_at') IS NULL ALTER TABLE dbo.terminal_tokens ADD [reissued_at] DATETIME2(3);
  IF COL_LENGTH('dbo.terminal_tokens', 'replaced_by') IS NULL ALTER TABLE dbo.terminal_tokens ADD [replaced_by] UNIQUEIDENTIFIER;
  IF COL_LENGTH('dbo.terminal_tokens', 'claimed_by_device') IS NULL ALTER TABLE dbo.terminal_tokens ADD [claimed_by_device] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.terminal_tokens', 'claimed_at') IS NULL ALTER TABLE dbo.terminal_tokens ADD [claimed_at] DATETIME2(3);
  IF COL_LENGTH('dbo.terminal_tokens', 'platform') IS NULL ALTER TABLE dbo.terminal_tokens ADD [platform] NVARCHAR(MAX) DEFAULT N'unknown';
  IF COL_LENGTH('dbo.terminal_tokens', 'expires_at') IS NULL ALTER TABLE dbo.terminal_tokens ADD [expires_at] DATETIME2(3);
  IF COL_LENGTH('dbo.terminal_tokens', 'claimed_os') IS NULL ALTER TABLE dbo.terminal_tokens ADD [claimed_os] NVARCHAR(200);
  IF COL_LENGTH('dbo.terminal_tokens', 'claim_proof') IS NULL ALTER TABLE dbo.terminal_tokens ADD [claim_proof] NVARCHAR(400);
  IF COL_LENGTH('dbo.terminal_tokens', 'row_version') IS NULL ALTER TABLE dbo.terminal_tokens ADD [row_version] INT DEFAULT 1;
  IF COL_LENGTH('dbo.terminal_tokens', 'is_synced') IS NULL ALTER TABLE dbo.terminal_tokens ADD [is_synced] BIT DEFAULT 0;
  IF COL_LENGTH('dbo.terminal_tokens', 'sync_status') IS NULL ALTER TABLE dbo.terminal_tokens ADD [sync_status] NVARCHAR(40) DEFAULT N'pending';
  IF COL_LENGTH('dbo.terminal_tokens', 'sync_attempts') IS NULL ALTER TABLE dbo.terminal_tokens ADD [sync_attempts] INT DEFAULT 0;
  IF COL_LENGTH('dbo.terminal_tokens', 'last_error_at') IS NULL ALTER TABLE dbo.terminal_tokens ADD [last_error_at] DATETIME2(3);
  IF COL_LENGTH('dbo.terminal_tokens', 'client_transaction_id') IS NULL ALTER TABLE dbo.terminal_tokens ADD [client_transaction_id] NVARCHAR(120);
END
GO
IF OBJECT_ID('dbo.uom_units', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.uom_units', 'id') IS NULL ALTER TABLE dbo.uom_units ADD [id] UNIQUEIDENTIFIER DEFAULT NEWID();
  IF COL_LENGTH('dbo.uom_units', 'code') IS NULL ALTER TABLE dbo.uom_units ADD [code] NVARCHAR(400);
  IF COL_LENGTH('dbo.uom_units', 'name') IS NULL ALTER TABLE dbo.uom_units ADD [name] NVARCHAR(400);
  IF COL_LENGTH('dbo.uom_units', 'allow_decimal') IS NULL ALTER TABLE dbo.uom_units ADD [allow_decimal] BIT DEFAULT 0;
  IF COL_LENGTH('dbo.uom_units', 'sort') IS NULL ALTER TABLE dbo.uom_units ADD [sort] INT DEFAULT 0;
  IF COL_LENGTH('dbo.uom_units', 'created_at') IS NULL ALTER TABLE dbo.uom_units ADD [created_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.uom_units', 'updated_at') IS NULL ALTER TABLE dbo.uom_units ADD [updated_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.uom_units', 'row_version') IS NULL ALTER TABLE dbo.uom_units ADD [row_version] INT DEFAULT 1;
  IF COL_LENGTH('dbo.uom_units', 'is_synced') IS NULL ALTER TABLE dbo.uom_units ADD [is_synced] BIT DEFAULT 0;
  IF COL_LENGTH('dbo.uom_units', 'sync_status') IS NULL ALTER TABLE dbo.uom_units ADD [sync_status] NVARCHAR(40) DEFAULT N'pending';
  IF COL_LENGTH('dbo.uom_units', 'sync_attempts') IS NULL ALTER TABLE dbo.uom_units ADD [sync_attempts] INT DEFAULT 0;
  IF COL_LENGTH('dbo.uom_units', 'last_error_at') IS NULL ALTER TABLE dbo.uom_units ADD [last_error_at] DATETIME2(3);
  IF COL_LENGTH('dbo.uom_units', 'client_transaction_id') IS NULL ALTER TABLE dbo.uom_units ADD [client_transaction_id] NVARCHAR(120);
END
GO
IF OBJECT_ID('dbo.user_roles', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.user_roles', 'id') IS NULL ALTER TABLE dbo.user_roles ADD [id] UNIQUEIDENTIFIER DEFAULT NEWID();
  IF COL_LENGTH('dbo.user_roles', 'user_id') IS NULL ALTER TABLE dbo.user_roles ADD [user_id] UNIQUEIDENTIFIER;
  IF COL_LENGTH('dbo.user_roles', 'role') IS NULL ALTER TABLE dbo.user_roles ADD [role] NVARCHAR(40);
  IF COL_LENGTH('dbo.user_roles', 'created_at') IS NULL ALTER TABLE dbo.user_roles ADD [created_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.user_roles', 'is_synced') IS NULL ALTER TABLE dbo.user_roles ADD [is_synced] BIT DEFAULT 0;
  IF COL_LENGTH('dbo.user_roles', 'sync_status') IS NULL ALTER TABLE dbo.user_roles ADD [sync_status] NVARCHAR(40) DEFAULT N'pending';
  IF COL_LENGTH('dbo.user_roles', 'row_version') IS NULL ALTER TABLE dbo.user_roles ADD [row_version] INT DEFAULT 0;
  IF COL_LENGTH('dbo.user_roles', 'sync_attempts') IS NULL ALTER TABLE dbo.user_roles ADD [sync_attempts] INT DEFAULT 0;
  IF COL_LENGTH('dbo.user_roles', 'last_error_at') IS NULL ALTER TABLE dbo.user_roles ADD [last_error_at] DATETIME2(3);
  IF COL_LENGTH('dbo.user_roles', 'client_transaction_id') IS NULL ALTER TABLE dbo.user_roles ADD [client_transaction_id] NVARCHAR(120);
END
GO
IF OBJECT_ID('dbo.whatsapp_queue', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.whatsapp_queue', 'id') IS NULL ALTER TABLE dbo.whatsapp_queue ADD [id] UNIQUEIDENTIFIER DEFAULT NEWID();
  IF COL_LENGTH('dbo.whatsapp_queue', 'phone_number_id') IS NULL ALTER TABLE dbo.whatsapp_queue ADD [phone_number_id] NVARCHAR(400) DEFAULT N'';
  IF COL_LENGTH('dbo.whatsapp_queue', 'recipient') IS NULL ALTER TABLE dbo.whatsapp_queue ADD [recipient] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.whatsapp_queue', 'body') IS NULL ALTER TABLE dbo.whatsapp_queue ADD [body] NVARCHAR(MAX) DEFAULT N'';
  IF COL_LENGTH('dbo.whatsapp_queue', 'reference') IS NULL ALTER TABLE dbo.whatsapp_queue ADD [reference] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.whatsapp_queue', 'store_id') IS NULL ALTER TABLE dbo.whatsapp_queue ADD [store_id] NVARCHAR(400);
  IF COL_LENGTH('dbo.whatsapp_queue', 'status') IS NULL ALTER TABLE dbo.whatsapp_queue ADD [status] NVARCHAR(MAX) DEFAULT N'QUEUED';
  IF COL_LENGTH('dbo.whatsapp_queue', 'error') IS NULL ALTER TABLE dbo.whatsapp_queue ADD [error] NVARCHAR(MAX);
  IF COL_LENGTH('dbo.whatsapp_queue', 'queued_at') IS NULL ALTER TABLE dbo.whatsapp_queue ADD [queued_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.whatsapp_queue', 'sent_at') IS NULL ALTER TABLE dbo.whatsapp_queue ADD [sent_at] DATETIME2(3);
  IF COL_LENGTH('dbo.whatsapp_queue', 'created_at') IS NULL ALTER TABLE dbo.whatsapp_queue ADD [created_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.whatsapp_queue', 'updated_at') IS NULL ALTER TABLE dbo.whatsapp_queue ADD [updated_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.whatsapp_queue', 'is_synced') IS NULL ALTER TABLE dbo.whatsapp_queue ADD [is_synced] BIT DEFAULT 0;
  IF COL_LENGTH('dbo.whatsapp_queue', 'sync_status') IS NULL ALTER TABLE dbo.whatsapp_queue ADD [sync_status] NVARCHAR(40) DEFAULT N'pending';
  IF COL_LENGTH('dbo.whatsapp_queue', 'row_version') IS NULL ALTER TABLE dbo.whatsapp_queue ADD [row_version] INT DEFAULT 0;
  IF COL_LENGTH('dbo.whatsapp_queue', 'sync_attempts') IS NULL ALTER TABLE dbo.whatsapp_queue ADD [sync_attempts] INT DEFAULT 0;
  IF COL_LENGTH('dbo.whatsapp_queue', 'last_error_at') IS NULL ALTER TABLE dbo.whatsapp_queue ADD [last_error_at] DATETIME2(3);
  IF COL_LENGTH('dbo.whatsapp_queue', 'client_transaction_id') IS NULL ALTER TABLE dbo.whatsapp_queue ADD [client_transaction_id] NVARCHAR(120);
END
GO

/* =========================================================================
   0106 — Sync schema drift repair (additive, idempotent)
   Columns the central database gained after tills shipped. Without them the
   local write layer silently drops the data (idempotency keys, racket job
   cards, X/Z report counts) and pushes of payment rows fail centrally.
   Safe to re-run: every statement is guarded by COL_LENGTH.
   ========================================================================= */
IF OBJECT_ID('dbo.sales', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.sales', 'client_transaction_id') IS NULL ALTER TABLE dbo.sales ADD [client_transaction_id] NVARCHAR(120) NULL;
  IF COL_LENGTH('dbo.sales', 'cashier_id') IS NULL ALTER TABLE dbo.sales ADD [cashier_id] NVARCHAR(60) NULL;
  IF COL_LENGTH('dbo.sales', 'payments') IS NULL ALTER TABLE dbo.sales ADD [payments] NVARCHAR(MAX) NULL;
  IF COL_LENGTH('dbo.sales', 'coupon_code') IS NULL ALTER TABLE dbo.sales ADD [coupon_code] NVARCHAR(60) NULL;
  IF COL_LENGTH('dbo.sales', 'coupon_discount') IS NULL ALTER TABLE dbo.sales ADD [coupon_discount] DECIMAL(18, 4) NULL;
  IF COL_LENGTH('dbo.sales', 'coupon_promo_id') IS NULL ALTER TABLE dbo.sales ADD [coupon_promo_id] NVARCHAR(60) NULL;
  IF COL_LENGTH('dbo.sales', 'coupon_scope') IS NULL ALTER TABLE dbo.sales ADD [coupon_scope] NVARCHAR(40) NULL;
  IF COL_LENGTH('dbo.sales', 'store_name_snapshot') IS NULL ALTER TABLE dbo.sales ADD [store_name_snapshot] NVARCHAR(200) NULL;
  IF COL_LENGTH('dbo.sales', 'store_address_snapshot') IS NULL ALTER TABLE dbo.sales ADD [store_address_snapshot] NVARCHAR(400) NULL;
  IF COL_LENGTH('dbo.sales', 'created_by') IS NULL ALTER TABLE dbo.sales ADD [created_by] NVARCHAR(120) NULL;
  IF COL_LENGTH('dbo.sales', 'updated_by') IS NULL ALTER TABLE dbo.sales ADD [updated_by] NVARCHAR(120) NULL;
END
GO
IF OBJECT_ID('dbo.sale_items', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.sale_items', 'coupon_code') IS NULL ALTER TABLE dbo.sale_items ADD [coupon_code] NVARCHAR(60) NULL;
  IF COL_LENGTH('dbo.sale_items', 'coupon_discount') IS NULL ALTER TABLE dbo.sale_items ADD [coupon_discount] DECIMAL(18, 4) NULL;
  IF COL_LENGTH('dbo.sale_items', 'unit_cost') IS NULL ALTER TABLE dbo.sale_items ADD [unit_cost] DECIMAL(18, 4) NULL;
END
GO
IF OBJECT_ID('dbo.payment_transactions', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.payment_transactions', 'client_transaction_id') IS NULL ALTER TABLE dbo.payment_transactions ADD [client_transaction_id] NVARCHAR(120) NULL;
  IF COL_LENGTH('dbo.payment_transactions', 'status') IS NULL ALTER TABLE dbo.payment_transactions ADD [status] NVARCHAR(30) NULL;
  IF COL_LENGTH('dbo.payment_transactions', 'metadata') IS NULL ALTER TABLE dbo.payment_transactions ADD [metadata] NVARCHAR(MAX) NULL;
  IF COL_LENGTH('dbo.payment_transactions', 'cashier_id') IS NULL ALTER TABLE dbo.payment_transactions ADD [cashier_id] NVARCHAR(60) NULL;
END
GO
IF OBJECT_ID('dbo.bookings', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.bookings', 'ref') IS NULL ALTER TABLE dbo.bookings ADD [ref] NVARCHAR(40) NULL;
  IF COL_LENGTH('dbo.bookings', 'cashier') IS NULL ALTER TABLE dbo.bookings ADD [cashier] NVARCHAR(120) NULL;
  IF COL_LENGTH('dbo.bookings', 'service_type_id') IS NULL ALTER TABLE dbo.bookings ADD [service_type_id] NVARCHAR(60) NULL;
  IF COL_LENGTH('dbo.bookings', 'service_name') IS NULL ALTER TABLE dbo.bookings ADD [service_name] NVARCHAR(160) NULL;
  IF COL_LENGTH('dbo.bookings', 'service_fee') IS NULL ALTER TABLE dbo.bookings ADD [service_fee] DECIMAL(18, 4) NULL;
  IF COL_LENGTH('dbo.bookings', 'payment_timing') IS NULL ALTER TABLE dbo.bookings ADD [payment_timing] NVARCHAR(30) NULL;
  IF COL_LENGTH('dbo.bookings', 'sale_receipt_no') IS NULL ALTER TABLE dbo.bookings ADD [sale_receipt_no] NVARCHAR(60) NULL;
  IF COL_LENGTH('dbo.bookings', 'closed_at') IS NULL ALTER TABLE dbo.bookings ADD [closed_at] DATETIME2(3) NULL;
  IF COL_LENGTH('dbo.bookings', 'racket_model') IS NULL ALTER TABLE dbo.bookings ADD [racket_model] NVARCHAR(160) NULL;
  IF COL_LENGTH('dbo.bookings', 'string_type') IS NULL ALTER TABLE dbo.bookings ADD [string_type] NVARCHAR(160) NULL;
  IF COL_LENGTH('dbo.bookings', 'tension_main') IS NULL ALTER TABLE dbo.bookings ADD [tension_main] DECIMAL(9, 2) NULL;
  IF COL_LENGTH('dbo.bookings', 'tension_cross') IS NULL ALTER TABLE dbo.bookings ADD [tension_cross] DECIMAL(9, 2) NULL;
  IF COL_LENGTH('dbo.bookings', 'tension_unit') IS NULL ALTER TABLE dbo.bookings ADD [tension_unit] NVARCHAR(10) NULL;
  IF COL_LENGTH('dbo.bookings', 'grommet_notes') IS NULL ALTER TABLE dbo.bookings ADD [grommet_notes] NVARCHAR(MAX) NULL;
  IF COL_LENGTH('dbo.bookings', 'job_notes') IS NULL ALTER TABLE dbo.bookings ADD [job_notes] NVARCHAR(MAX) NULL;
  IF COL_LENGTH('dbo.bookings', 'dropped_off_at') IS NULL ALTER TABLE dbo.bookings ADD [dropped_off_at] DATETIME2(3) NULL;
  IF COL_LENGTH('dbo.bookings', 'promised_at') IS NULL ALTER TABLE dbo.bookings ADD [promised_at] DATETIME2(3) NULL;
  IF COL_LENGTH('dbo.bookings', 'job_status') IS NULL ALTER TABLE dbo.bookings ADD [job_status] NVARCHAR(40) NULL;
  IF COL_LENGTH('dbo.bookings', 'job_status_by') IS NULL ALTER TABLE dbo.bookings ADD [job_status_by] NVARCHAR(120) NULL;
  IF COL_LENGTH('dbo.bookings', 'job_status_at') IS NULL ALTER TABLE dbo.bookings ADD [job_status_at] DATETIME2(3) NULL;
  IF COL_LENGTH('dbo.bookings', 'notify_whatsapp') IS NULL ALTER TABLE dbo.bookings ADD [notify_whatsapp] BIT NULL;
  IF COL_LENGTH('dbo.bookings', 'tag_id') IS NULL ALTER TABLE dbo.bookings ADD [tag_id] NVARCHAR(60) NULL;
  IF COL_LENGTH('dbo.bookings', 'intake_note') IS NULL ALTER TABLE dbo.bookings ADD [intake_note] NVARCHAR(MAX) NULL;
  IF COL_LENGTH('dbo.bookings', 'string_origin') IS NULL ALTER TABLE dbo.bookings ADD [string_origin] NVARCHAR(40) NULL;
  IF COL_LENGTH('dbo.bookings', 'string_source_product_id') IS NULL ALTER TABLE dbo.bookings ADD [string_source_product_id] NVARCHAR(60) NULL;
  IF COL_LENGTH('dbo.bookings', 'grip_product_id') IS NULL ALTER TABLE dbo.bookings ADD [grip_product_id] NVARCHAR(60) NULL;
  IF COL_LENGTH('dbo.bookings', 'charges') IS NULL ALTER TABLE dbo.bookings ADD [charges] NVARCHAR(MAX) NULL;
  IF COL_LENGTH('dbo.bookings', 'technician') IS NULL ALTER TABLE dbo.bookings ADD [technician] NVARCHAR(120) NULL;
  IF COL_LENGTH('dbo.bookings', 'liability_accepted') IS NULL ALTER TABLE dbo.bookings ADD [liability_accepted] BIT NULL;
  IF COL_LENGTH('dbo.bookings', 'incident_note') IS NULL ALTER TABLE dbo.bookings ADD [incident_note] NVARCHAR(MAX) NULL;
END
GO
IF OBJECT_ID('dbo.shifts', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.shifts', 'status') IS NULL ALTER TABLE dbo.shifts ADD [status] NVARCHAR(20) NULL;
  IF COL_LENGTH('dbo.shifts', 'terminal_id') IS NULL ALTER TABLE dbo.shifts ADD [terminal_id] NVARCHAR(60) NULL;
  IF COL_LENGTH('dbo.shifts', 'terminal_name') IS NULL ALTER TABLE dbo.shifts ADD [terminal_name] NVARCHAR(120) NULL;
  IF COL_LENGTH('dbo.shifts', 'user_id') IS NULL ALTER TABLE dbo.shifts ADD [user_id] NVARCHAR(60) NULL;
  IF COL_LENGTH('dbo.shifts', 'opened_by_name') IS NULL ALTER TABLE dbo.shifts ADD [opened_by_name] NVARCHAR(120) NULL;
  IF COL_LENGTH('dbo.shifts', 'opened_by_staff_id') IS NULL ALTER TABLE dbo.shifts ADD [opened_by_staff_id] NVARCHAR(60) NULL;
  IF COL_LENGTH('dbo.shifts', 'opened_by_role') IS NULL ALTER TABLE dbo.shifts ADD [opened_by_role] NVARCHAR(40) NULL;
  IF COL_LENGTH('dbo.shifts', 'closed_by_name') IS NULL ALTER TABLE dbo.shifts ADD [closed_by_name] NVARCHAR(120) NULL;
  IF COL_LENGTH('dbo.shifts', 'closed_by_staff_id') IS NULL ALTER TABLE dbo.shifts ADD [closed_by_staff_id] NVARCHAR(60) NULL;
  IF COL_LENGTH('dbo.shifts', 'closed_by_role') IS NULL ALTER TABLE dbo.shifts ADD [closed_by_role] NVARCHAR(40) NULL;
  IF COL_LENGTH('dbo.shifts', 'closing_float') IS NULL ALTER TABLE dbo.shifts ADD [closing_float] DECIMAL(18, 4) NULL;
  IF COL_LENGTH('dbo.shifts', 'expected_cash') IS NULL ALTER TABLE dbo.shifts ADD [expected_cash] DECIMAL(18, 4) NULL;
  IF COL_LENGTH('dbo.shifts', 'expected_card') IS NULL ALTER TABLE dbo.shifts ADD [expected_card] DECIMAL(18, 4) NULL;
  IF COL_LENGTH('dbo.shifts', 'counted_card') IS NULL ALTER TABLE dbo.shifts ADD [counted_card] DECIMAL(18, 4) NULL;
  IF COL_LENGTH('dbo.shifts', 'expected_digital') IS NULL ALTER TABLE dbo.shifts ADD [expected_digital] DECIMAL(18, 4) NULL;
  IF COL_LENGTH('dbo.shifts', 'counted_digital') IS NULL ALTER TABLE dbo.shifts ADD [counted_digital] DECIMAL(18, 4) NULL;
  IF COL_LENGTH('dbo.shifts', 'variance_cash') IS NULL ALTER TABLE dbo.shifts ADD [variance_cash] DECIMAL(18, 4) NULL;
  IF COL_LENGTH('dbo.shifts', 'variance_card') IS NULL ALTER TABLE dbo.shifts ADD [variance_card] DECIMAL(18, 4) NULL;
  IF COL_LENGTH('dbo.shifts', 'variance_digital') IS NULL ALTER TABLE dbo.shifts ADD [variance_digital] DECIMAL(18, 4) NULL;
  IF COL_LENGTH('dbo.shifts', 'variance_total') IS NULL ALTER TABLE dbo.shifts ADD [variance_total] DECIMAL(18, 4) NULL;
  IF COL_LENGTH('dbo.shifts', 'overdue') IS NULL ALTER TABLE dbo.shifts ADD [overdue] BIT NULL;
END
GO
IF OBJECT_ID('dbo.products', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.products', 'stock_quantity') IS NULL ALTER TABLE dbo.products ADD [stock_quantity] INT NULL;
  IF COL_LENGTH('dbo.products', 'is_archived') IS NULL ALTER TABLE dbo.products ADD [is_archived] BIT NULL;
  IF COL_LENGTH('dbo.products', 'archived_at') IS NULL ALTER TABLE dbo.products ADD [archived_at] DATETIME2(3) NULL;
  IF COL_LENGTH('dbo.products', 'brand') IS NULL ALTER TABLE dbo.products ADD [brand] NVARCHAR(120) NULL;
  IF COL_LENGTH('dbo.products', 'product_group') IS NULL ALTER TABLE dbo.products ADD [product_group] NVARCHAR(120) NULL;
  IF COL_LENGTH('dbo.products', 'barcode_variants') IS NULL ALTER TABLE dbo.products ADD [barcode_variants] NVARCHAR(MAX) NULL;
  IF COL_LENGTH('dbo.products', 'landing_pct') IS NULL ALTER TABLE dbo.products ADD [landing_pct] DECIMAL(9, 4) NULL;
  IF COL_LENGTH('dbo.products', 'sub_category') IS NULL ALTER TABLE dbo.products ADD [sub_category] NVARCHAR(120) NULL;
  IF COL_LENGTH('dbo.products', 'unit') IS NULL ALTER TABLE dbo.products ADD [unit] NVARCHAR(40) NULL;
  IF COL_LENGTH('dbo.products', 'packs') IS NULL ALTER TABLE dbo.products ADD [packs] NVARCHAR(MAX) NULL;
  IF COL_LENGTH('dbo.products', 'barcode_aliases') IS NULL ALTER TABLE dbo.products ADD [barcode_aliases] NVARCHAR(MAX) NULL;
END
GO
IF OBJECT_ID('dbo.members', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.members', 'is_verified') IS NULL ALTER TABLE dbo.members ADD [is_verified] BIT NULL;
  IF COL_LENGTH('dbo.members', 'verified_at') IS NULL ALTER TABLE dbo.members ADD [verified_at] DATETIME2(3) NULL;
  IF COL_LENGTH('dbo.members', 'verified_channel') IS NULL ALTER TABLE dbo.members ADD [verified_channel] NVARCHAR(30) NULL;
END
GO

/* Draft physical counts: saved automatically so a count survives a restart. */
IF OBJECT_ID('dbo.stock_count_drafts', 'U') IS NULL
CREATE TABLE dbo.stock_count_drafts (
  id NVARCHAR(80) NOT NULL PRIMARY KEY,
  reference NVARCHAR(60) NULL, store_code NVARCHAR(40) NULL,
  store_id NVARCHAR(60) NULL, terminal_id NVARCHAR(80) NULL,
  staff_id NVARCHAR(80) NULL, staff_name NVARCHAR(200) NULL,
  status NVARCHAR(20) NOT NULL DEFAULT N'draft',
  reason NVARCHAR(80) NULL, note NVARCHAR(400) NOT NULL DEFAULT N'',
  lines NVARCHAR(MAX) NOT NULL DEFAULT N'[]',
  line_count INT NOT NULL DEFAULT 0, total_impact DECIMAL(18,4) NOT NULL DEFAULT 0,
  posted_at DATETIME2(3) NULL, posted_by NVARCHAR(200) NULL,
  is_synced BIT NOT NULL DEFAULT 0, sync_status NVARCHAR(40) NOT NULL DEFAULT N'pending',
  row_version INT NOT NULL DEFAULT 0, sync_attempts INT NOT NULL DEFAULT 0,
  last_error_at DATETIME2(3) NULL, client_transaction_id NVARCHAR(120) NULL,
  created_at DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME()
);
GO
IF OBJECT_ID('dbo.stock_count_drafts', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.stock_count_drafts', 'reference') IS NULL ALTER TABLE dbo.stock_count_drafts ADD [reference] NVARCHAR(60) NULL;
  IF COL_LENGTH('dbo.stock_count_drafts', 'store_code') IS NULL ALTER TABLE dbo.stock_count_drafts ADD [store_code] NVARCHAR(40) NULL;
  IF COL_LENGTH('dbo.stock_count_drafts', 'store_id') IS NULL ALTER TABLE dbo.stock_count_drafts ADD [store_id] NVARCHAR(60) NULL;
  IF COL_LENGTH('dbo.stock_count_drafts', 'terminal_id') IS NULL ALTER TABLE dbo.stock_count_drafts ADD [terminal_id] NVARCHAR(80) NULL;
  IF COL_LENGTH('dbo.stock_count_drafts', 'staff_id') IS NULL ALTER TABLE dbo.stock_count_drafts ADD [staff_id] NVARCHAR(80) NULL;
  IF COL_LENGTH('dbo.stock_count_drafts', 'staff_name') IS NULL ALTER TABLE dbo.stock_count_drafts ADD [staff_name] NVARCHAR(200) NULL;
  IF COL_LENGTH('dbo.stock_count_drafts', 'status') IS NULL ALTER TABLE dbo.stock_count_drafts ADD [status] NVARCHAR(20) DEFAULT N'draft';
  IF COL_LENGTH('dbo.stock_count_drafts', 'reason') IS NULL ALTER TABLE dbo.stock_count_drafts ADD [reason] NVARCHAR(80) NULL;
  IF COL_LENGTH('dbo.stock_count_drafts', 'note') IS NULL ALTER TABLE dbo.stock_count_drafts ADD [note] NVARCHAR(400) DEFAULT N'';
  IF COL_LENGTH('dbo.stock_count_drafts', 'lines') IS NULL ALTER TABLE dbo.stock_count_drafts ADD [lines] NVARCHAR(MAX) DEFAULT N'[]';
  IF COL_LENGTH('dbo.stock_count_drafts', 'line_count') IS NULL ALTER TABLE dbo.stock_count_drafts ADD [line_count] INT DEFAULT 0;
  IF COL_LENGTH('dbo.stock_count_drafts', 'total_impact') IS NULL ALTER TABLE dbo.stock_count_drafts ADD [total_impact] DECIMAL(18,4) DEFAULT 0;
  IF COL_LENGTH('dbo.stock_count_drafts', 'posted_at') IS NULL ALTER TABLE dbo.stock_count_drafts ADD [posted_at] DATETIME2(3) NULL;
  IF COL_LENGTH('dbo.stock_count_drafts', 'posted_by') IS NULL ALTER TABLE dbo.stock_count_drafts ADD [posted_by] NVARCHAR(200) NULL;
  IF COL_LENGTH('dbo.stock_count_drafts', 'is_synced') IS NULL ALTER TABLE dbo.stock_count_drafts ADD [is_synced] BIT DEFAULT 0;
  IF COL_LENGTH('dbo.stock_count_drafts', 'sync_status') IS NULL ALTER TABLE dbo.stock_count_drafts ADD [sync_status] NVARCHAR(40) DEFAULT N'pending';
  IF COL_LENGTH('dbo.stock_count_drafts', 'row_version') IS NULL ALTER TABLE dbo.stock_count_drafts ADD [row_version] INT DEFAULT 0;
  IF COL_LENGTH('dbo.stock_count_drafts', 'sync_attempts') IS NULL ALTER TABLE dbo.stock_count_drafts ADD [sync_attempts] INT DEFAULT 0;
  IF COL_LENGTH('dbo.stock_count_drafts', 'last_error_at') IS NULL ALTER TABLE dbo.stock_count_drafts ADD [last_error_at] DATETIME2(3) NULL;
  IF COL_LENGTH('dbo.stock_count_drafts', 'client_transaction_id') IS NULL ALTER TABLE dbo.stock_count_drafts ADD [client_transaction_id] NVARCHAR(120) NULL;
  IF COL_LENGTH('dbo.stock_count_drafts', 'created_at') IS NULL ALTER TABLE dbo.stock_count_drafts ADD [created_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
  IF COL_LENGTH('dbo.stock_count_drafts', 'updated_at') IS NULL ALTER TABLE dbo.stock_count_drafts ADD [updated_at] DATETIME2(3) DEFAULT SYSUTCDATETIME();
END
GO
IF OBJECT_ID('dbo.stock_adjustments', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.stock_adjustments', 'draft_id') IS NULL ALTER TABLE dbo.stock_adjustments ADD [draft_id] NVARCHAR(80) NULL;
END
GO


-- =====================================================================
-- Authorisation framework: rules, approval queue and the decision log.
-- Guarded so the file stays safe to re-run against a live till.
-- =====================================================================
IF OBJECT_ID('dbo.authorization_actions', 'U') IS NULL
CREATE TABLE dbo.authorization_actions (
  id NVARCHAR(80) NOT NULL PRIMARY KEY,
  action_key NVARCHAR(80) NOT NULL,
  scope_type NVARCHAR(20) NOT NULL DEFAULT N'global',
  scope_id NVARCHAR(60) NOT NULL DEFAULT N'',
  mode NVARCHAR(20) NOT NULL DEFAULT N'none',
  allowed_roles NVARCHAR(MAX) NOT NULL DEFAULT N'[]',
  allowed_user_ids NVARCHAR(MAX) NOT NULL DEFAULT N'[]',
  require_reason BIT NOT NULL DEFAULT 0,
  threshold DECIMAL(18,4) NULL,
  is_enabled BIT NOT NULL DEFAULT 1,
  is_synced BIT NOT NULL DEFAULT 0, sync_status NVARCHAR(40) NOT NULL DEFAULT N'pending',
  row_version INT NOT NULL DEFAULT 0, sync_attempts INT NOT NULL DEFAULT 0,
  last_error_at DATETIME2(3) NULL, client_transaction_id NVARCHAR(120) NULL,
  created_at DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME()
);
GO
IF OBJECT_ID('dbo.authorization_actions', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.authorization_actions', 'action_key') IS NULL ALTER TABLE dbo.authorization_actions ADD [action_key] NVARCHAR(80);
  IF COL_LENGTH('dbo.authorization_actions', 'scope_type') IS NULL ALTER TABLE dbo.authorization_actions ADD [scope_type] NVARCHAR(20) DEFAULT N'global';
  IF COL_LENGTH('dbo.authorization_actions', 'scope_id') IS NULL ALTER TABLE dbo.authorization_actions ADD [scope_id] NVARCHAR(60) DEFAULT N'';
  IF COL_LENGTH('dbo.authorization_actions', 'mode') IS NULL ALTER TABLE dbo.authorization_actions ADD [mode] NVARCHAR(20) DEFAULT N'none';
  IF COL_LENGTH('dbo.authorization_actions', 'allowed_roles') IS NULL ALTER TABLE dbo.authorization_actions ADD [allowed_roles] NVARCHAR(MAX) DEFAULT N'[]';
  IF COL_LENGTH('dbo.authorization_actions', 'allowed_user_ids') IS NULL ALTER TABLE dbo.authorization_actions ADD [allowed_user_ids] NVARCHAR(MAX) DEFAULT N'[]';
  IF COL_LENGTH('dbo.authorization_actions', 'require_reason') IS NULL ALTER TABLE dbo.authorization_actions ADD [require_reason] BIT DEFAULT 0;
  IF COL_LENGTH('dbo.authorization_actions', 'threshold') IS NULL ALTER TABLE dbo.authorization_actions ADD [threshold] DECIMAL(18,4) NULL;
  IF COL_LENGTH('dbo.authorization_actions', 'is_enabled') IS NULL ALTER TABLE dbo.authorization_actions ADD [is_enabled] BIT DEFAULT 1;
  IF COL_LENGTH('dbo.authorization_actions', 'is_synced') IS NULL ALTER TABLE dbo.authorization_actions ADD [is_synced] BIT DEFAULT 0;
  IF COL_LENGTH('dbo.authorization_actions', 'sync_status') IS NULL ALTER TABLE dbo.authorization_actions ADD [sync_status] NVARCHAR(40) DEFAULT N'pending';
  IF COL_LENGTH('dbo.authorization_actions', 'row_version') IS NULL ALTER TABLE dbo.authorization_actions ADD [row_version] INT DEFAULT 0;
  IF COL_LENGTH('dbo.authorization_actions', 'sync_attempts') IS NULL ALTER TABLE dbo.authorization_actions ADD [sync_attempts] INT DEFAULT 0;
  IF COL_LENGTH('dbo.authorization_actions', 'last_error_at') IS NULL ALTER TABLE dbo.authorization_actions ADD [last_error_at] DATETIME2(3) NULL;
  IF COL_LENGTH('dbo.authorization_actions', 'client_transaction_id') IS NULL ALTER TABLE dbo.authorization_actions ADD [client_transaction_id] NVARCHAR(120) NULL;
  IF COL_LENGTH('dbo.authorization_actions', 'created_at') IS NULL ALTER TABLE dbo.authorization_actions ADD [created_at] DATETIME2(3) NULL;
  IF COL_LENGTH('dbo.authorization_actions', 'updated_at') IS NULL ALTER TABLE dbo.authorization_actions ADD [updated_at] DATETIME2(3) NULL;
END
GO
IF OBJECT_ID('dbo.authorization_requests', 'U') IS NULL
CREATE TABLE dbo.authorization_requests (
  id NVARCHAR(80) NOT NULL PRIMARY KEY,
  action_key NVARCHAR(80) NOT NULL,
  requested_by NVARCHAR(120) NOT NULL,
  requested_by_name NVARCHAR(200) NULL,
  store_id NVARCHAR(60) NOT NULL DEFAULT N'',
  terminal_id NVARCHAR(80) NOT NULL DEFAULT N'',
  reason NVARCHAR(400) NULL,
  payload NVARCHAR(MAX) NOT NULL DEFAULT N'{}',
  status NVARCHAR(20) NOT NULL DEFAULT N'pending',
  decided_by NVARCHAR(120) NULL,
  decided_by_name NVARCHAR(200) NULL,
  decided_at DATETIME2(3) NULL,
  decision_note NVARCHAR(400) NULL,
  expires_at DATETIME2(3) NULL,
  consumed_at DATETIME2(3) NULL,
  is_synced BIT NOT NULL DEFAULT 0, sync_status NVARCHAR(40) NOT NULL DEFAULT N'pending',
  row_version INT NOT NULL DEFAULT 0, sync_attempts INT NOT NULL DEFAULT 0,
  last_error_at DATETIME2(3) NULL, client_transaction_id NVARCHAR(120) NULL,
  created_at DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME()
);
GO
IF OBJECT_ID('dbo.authorization_requests', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.authorization_requests', 'action_key') IS NULL ALTER TABLE dbo.authorization_requests ADD [action_key] NVARCHAR(80);
  IF COL_LENGTH('dbo.authorization_requests', 'requested_by') IS NULL ALTER TABLE dbo.authorization_requests ADD [requested_by] NVARCHAR(120);
  IF COL_LENGTH('dbo.authorization_requests', 'requested_by_name') IS NULL ALTER TABLE dbo.authorization_requests ADD [requested_by_name] NVARCHAR(200) NULL;
  IF COL_LENGTH('dbo.authorization_requests', 'store_id') IS NULL ALTER TABLE dbo.authorization_requests ADD [store_id] NVARCHAR(60) DEFAULT N'';
  IF COL_LENGTH('dbo.authorization_requests', 'terminal_id') IS NULL ALTER TABLE dbo.authorization_requests ADD [terminal_id] NVARCHAR(80) DEFAULT N'';
  IF COL_LENGTH('dbo.authorization_requests', 'reason') IS NULL ALTER TABLE dbo.authorization_requests ADD [reason] NVARCHAR(400) NULL;
  IF COL_LENGTH('dbo.authorization_requests', 'payload') IS NULL ALTER TABLE dbo.authorization_requests ADD [payload] NVARCHAR(MAX) DEFAULT N'{}';
  IF COL_LENGTH('dbo.authorization_requests', 'status') IS NULL ALTER TABLE dbo.authorization_requests ADD [status] NVARCHAR(20) DEFAULT N'pending';
  IF COL_LENGTH('dbo.authorization_requests', 'decided_by') IS NULL ALTER TABLE dbo.authorization_requests ADD [decided_by] NVARCHAR(120) NULL;
  IF COL_LENGTH('dbo.authorization_requests', 'decided_by_name') IS NULL ALTER TABLE dbo.authorization_requests ADD [decided_by_name] NVARCHAR(200) NULL;
  IF COL_LENGTH('dbo.authorization_requests', 'decided_at') IS NULL ALTER TABLE dbo.authorization_requests ADD [decided_at] DATETIME2(3) NULL;
  IF COL_LENGTH('dbo.authorization_requests', 'decision_note') IS NULL ALTER TABLE dbo.authorization_requests ADD [decision_note] NVARCHAR(400) NULL;
  IF COL_LENGTH('dbo.authorization_requests', 'expires_at') IS NULL ALTER TABLE dbo.authorization_requests ADD [expires_at] DATETIME2(3) NULL;
  IF COL_LENGTH('dbo.authorization_requests', 'consumed_at') IS NULL ALTER TABLE dbo.authorization_requests ADD [consumed_at] DATETIME2(3) NULL;
  IF COL_LENGTH('dbo.authorization_requests', 'is_synced') IS NULL ALTER TABLE dbo.authorization_requests ADD [is_synced] BIT DEFAULT 0;
  IF COL_LENGTH('dbo.authorization_requests', 'sync_status') IS NULL ALTER TABLE dbo.authorization_requests ADD [sync_status] NVARCHAR(40) DEFAULT N'pending';
  IF COL_LENGTH('dbo.authorization_requests', 'row_version') IS NULL ALTER TABLE dbo.authorization_requests ADD [row_version] INT DEFAULT 0;
  IF COL_LENGTH('dbo.authorization_requests', 'sync_attempts') IS NULL ALTER TABLE dbo.authorization_requests ADD [sync_attempts] INT DEFAULT 0;
  IF COL_LENGTH('dbo.authorization_requests', 'last_error_at') IS NULL ALTER TABLE dbo.authorization_requests ADD [last_error_at] DATETIME2(3) NULL;
  IF COL_LENGTH('dbo.authorization_requests', 'client_transaction_id') IS NULL ALTER TABLE dbo.authorization_requests ADD [client_transaction_id] NVARCHAR(120) NULL;
  IF COL_LENGTH('dbo.authorization_requests', 'created_at') IS NULL ALTER TABLE dbo.authorization_requests ADD [created_at] DATETIME2(3) NULL;
  IF COL_LENGTH('dbo.authorization_requests', 'updated_at') IS NULL ALTER TABLE dbo.authorization_requests ADD [updated_at] DATETIME2(3) NULL;
END
GO
IF OBJECT_ID('dbo.authorization_log', 'U') IS NULL
CREATE TABLE dbo.authorization_log (
  id NVARCHAR(80) NOT NULL PRIMARY KEY,
  action_key NVARCHAR(80) NOT NULL,
  mode_used NVARCHAR(20) NOT NULL,
  request_id NVARCHAR(80) NULL,
  requested_by NVARCHAR(120) NULL,
  authorized_by NVARCHAR(120) NULL,
  authorizer_role NVARCHAR(40) NULL,
  store_id NVARCHAR(60) NOT NULL DEFAULT N'',
  terminal_id NVARCHAR(80) NOT NULL DEFAULT N'',
  outcome NVARCHAR(20) NOT NULL,
  detail NVARCHAR(MAX) NOT NULL DEFAULT N'{}',
  is_synced BIT NOT NULL DEFAULT 0, sync_status NVARCHAR(40) NOT NULL DEFAULT N'pending',
  row_version INT NOT NULL DEFAULT 0, sync_attempts INT NOT NULL DEFAULT 0,
  last_error_at DATETIME2(3) NULL, client_transaction_id NVARCHAR(120) NULL,
  created_at DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME()
);
GO
IF OBJECT_ID('dbo.authorization_log', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.authorization_log', 'action_key') IS NULL ALTER TABLE dbo.authorization_log ADD [action_key] NVARCHAR(80);
  IF COL_LENGTH('dbo.authorization_log', 'mode_used') IS NULL ALTER TABLE dbo.authorization_log ADD [mode_used] NVARCHAR(20);
  IF COL_LENGTH('dbo.authorization_log', 'request_id') IS NULL ALTER TABLE dbo.authorization_log ADD [request_id] NVARCHAR(80) NULL;
  IF COL_LENGTH('dbo.authorization_log', 'requested_by') IS NULL ALTER TABLE dbo.authorization_log ADD [requested_by] NVARCHAR(120) NULL;
  IF COL_LENGTH('dbo.authorization_log', 'authorized_by') IS NULL ALTER TABLE dbo.authorization_log ADD [authorized_by] NVARCHAR(120) NULL;
  IF COL_LENGTH('dbo.authorization_log', 'authorizer_role') IS NULL ALTER TABLE dbo.authorization_log ADD [authorizer_role] NVARCHAR(40) NULL;
  IF COL_LENGTH('dbo.authorization_log', 'store_id') IS NULL ALTER TABLE dbo.authorization_log ADD [store_id] NVARCHAR(60) DEFAULT N'';
  IF COL_LENGTH('dbo.authorization_log', 'terminal_id') IS NULL ALTER TABLE dbo.authorization_log ADD [terminal_id] NVARCHAR(80) DEFAULT N'';
  IF COL_LENGTH('dbo.authorization_log', 'outcome') IS NULL ALTER TABLE dbo.authorization_log ADD [outcome] NVARCHAR(20);
  IF COL_LENGTH('dbo.authorization_log', 'detail') IS NULL ALTER TABLE dbo.authorization_log ADD [detail] NVARCHAR(MAX) DEFAULT N'{}';
  IF COL_LENGTH('dbo.authorization_log', 'is_synced') IS NULL ALTER TABLE dbo.authorization_log ADD [is_synced] BIT DEFAULT 0;
  IF COL_LENGTH('dbo.authorization_log', 'sync_status') IS NULL ALTER TABLE dbo.authorization_log ADD [sync_status] NVARCHAR(40) DEFAULT N'pending';
  IF COL_LENGTH('dbo.authorization_log', 'row_version') IS NULL ALTER TABLE dbo.authorization_log ADD [row_version] INT DEFAULT 0;
  IF COL_LENGTH('dbo.authorization_log', 'sync_attempts') IS NULL ALTER TABLE dbo.authorization_log ADD [sync_attempts] INT DEFAULT 0;
  IF COL_LENGTH('dbo.authorization_log', 'last_error_at') IS NULL ALTER TABLE dbo.authorization_log ADD [last_error_at] DATETIME2(3) NULL;
  IF COL_LENGTH('dbo.authorization_log', 'client_transaction_id') IS NULL ALTER TABLE dbo.authorization_log ADD [client_transaction_id] NVARCHAR(120) NULL;
  IF COL_LENGTH('dbo.authorization_log', 'created_at') IS NULL ALTER TABLE dbo.authorization_log ADD [created_at] DATETIME2(3) NULL;
  IF COL_LENGTH('dbo.authorization_log', 'updated_at') IS NULL ALTER TABLE dbo.authorization_log ADD [updated_at] DATETIME2(3) NULL;
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ux_authorization_actions_scope')
CREATE UNIQUE INDEX ux_authorization_actions_scope ON dbo.authorization_actions (action_key, scope_type, scope_id);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_authorization_requests_status')
CREATE INDEX ix_authorization_requests_status ON dbo.authorization_requests (status, store_id, created_at);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_authorization_log_created')
CREATE INDEX ix_authorization_log_created ON dbo.authorization_log (created_at);
GO

/* ------------------------------------------------------------------ */
/* record_edits — before/after history of authorised edits to posted   */
/* stock counts and receiving entries.                                 */
/* ------------------------------------------------------------------ */
IF OBJECT_ID('dbo.record_edits', 'U') IS NULL
CREATE TABLE dbo.record_edits (
  id NVARCHAR(80) NOT NULL PRIMARY KEY,
  record_type NVARCHAR(40) NOT NULL,
  record_id NVARCHAR(80) NOT NULL,
  reference NVARCHAR(60) NULL,
  store_id NVARCHAR(60) NULL,
  terminal_id NVARCHAR(80) NULL,
  action_key NVARCHAR(64) NOT NULL,
  request_id NVARCHAR(80) NULL,
  edited_by NVARCHAR(80) NULL,
  edited_by_name NVARCHAR(200) NULL,
  authorized_by NVARCHAR(80) NULL,
  authorized_by_name NVARCHAR(200) NULL,
  mode_used NVARCHAR(20) NULL,
  before_value NVARCHAR(MAX) NOT NULL DEFAULT N'{}',
  after_value NVARCHAR(MAX) NOT NULL DEFAULT N'{}',
  stock_deltas NVARCHAR(MAX) NOT NULL DEFAULT N'{}',
  note NVARCHAR(400) NULL,
  is_synced BIT NOT NULL DEFAULT 0, sync_status NVARCHAR(40) NOT NULL DEFAULT N'pending',
  row_version INT NOT NULL DEFAULT 0, sync_attempts INT NOT NULL DEFAULT 0,
  last_error_at DATETIME2(3) NULL, client_transaction_id NVARCHAR(120) NULL,
  created_at DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME()
);
GO
IF OBJECT_ID('dbo.record_edits', 'U') IS NOT NULL
BEGIN
  IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_record_edits_record' AND object_id = OBJECT_ID('dbo.record_edits'))
    CREATE INDEX ix_record_edits_record ON dbo.record_edits (record_type, record_id, created_at DESC);
  IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_record_edits_store' AND object_id = OBJECT_ID('dbo.record_edits'))
    CREATE INDEX ix_record_edits_store ON dbo.record_edits (store_id, created_at DESC);
END
GO

/* Pending-edit hold on already-posted records. */
IF OBJECT_ID('dbo.stock_count_drafts', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.stock_count_drafts', 'pending_edit_request_id') IS NULL ALTER TABLE dbo.stock_count_drafts ADD [pending_edit_request_id] NVARCHAR(80) NULL;
  IF COL_LENGTH('dbo.stock_count_drafts', 'pending_edit_by') IS NULL ALTER TABLE dbo.stock_count_drafts ADD [pending_edit_by] NVARCHAR(80) NULL;
  IF COL_LENGTH('dbo.stock_count_drafts', 'pending_edit_at') IS NULL ALTER TABLE dbo.stock_count_drafts ADD [pending_edit_at] DATETIME2(3) NULL;
END
GO
IF OBJECT_ID('dbo.purchase_orders', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.purchase_orders', 'pending_edit_request_id') IS NULL ALTER TABLE dbo.purchase_orders ADD [pending_edit_request_id] NVARCHAR(80) NULL;
  IF COL_LENGTH('dbo.purchase_orders', 'pending_edit_by') IS NULL ALTER TABLE dbo.purchase_orders ADD [pending_edit_by] NVARCHAR(80) NULL;
  IF COL_LENGTH('dbo.purchase_orders', 'pending_edit_at') IS NULL ALTER TABLE dbo.purchase_orders ADD [pending_edit_at] DATETIME2(3) NULL;
END
GO

/* ------------------------------------------------------------------ */
/* Schema alignment — fields the central database already has that the */
/* till was missing, so a pulled or restored row keeps its meaning.    */
/* ------------------------------------------------------------------ */
IF OBJECT_ID('dbo.booking_payments', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.booking_payments', 'reversed_at') IS NULL ALTER TABLE dbo.booking_payments ADD [reversed_at] DATETIME2(3) NULL;
  IF COL_LENGTH('dbo.booking_payments', 'reversed_by') IS NULL ALTER TABLE dbo.booking_payments ADD [reversed_by] NVARCHAR(120) NULL;
END
GO
IF OBJECT_ID('dbo.shift_cash_counts', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.shift_cash_counts', 'counted_by_user_id') IS NULL ALTER TABLE dbo.shift_cash_counts ADD [counted_by_user_id] NVARCHAR(120) NULL;
END
GO
IF OBJECT_ID('dbo.shift_close_events', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.shift_close_events', 'actor_user_id') IS NULL ALTER TABLE dbo.shift_close_events ADD [actor_user_id] NVARCHAR(120) NULL;
END
GO

/* Governance trail written offline: an event raised, an edit recorded or an
   approval decided with no connection is kept here and pushed on reconnect. */
IF OBJECT_ID('dbo.activity_events', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.activity_events', 'branch_id') IS NULL ALTER TABLE dbo.activity_events ADD [branch_id] NVARCHAR(60) NULL;
  IF COL_LENGTH('dbo.activity_events', 'is_synced') IS NULL ALTER TABLE dbo.activity_events ADD [is_synced] BIT NOT NULL DEFAULT 0;
  IF COL_LENGTH('dbo.activity_events', 'sync_status') IS NULL ALTER TABLE dbo.activity_events ADD [sync_status] NVARCHAR(40) NOT NULL DEFAULT N'pending';
  IF COL_LENGTH('dbo.activity_events', 'sync_attempts') IS NULL ALTER TABLE dbo.activity_events ADD [sync_attempts] INT NOT NULL DEFAULT 0;
  IF COL_LENGTH('dbo.activity_events', 'last_error_at') IS NULL ALTER TABLE dbo.activity_events ADD [last_error_at] DATETIME2(3) NULL;
  IF COL_LENGTH('dbo.activity_events', 'client_transaction_id') IS NULL ALTER TABLE dbo.activity_events ADD [client_transaction_id] NVARCHAR(120) NULL;
END
GO
IF OBJECT_ID('dbo.member_verifications', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.member_verifications', 'is_synced') IS NULL ALTER TABLE dbo.member_verifications ADD [is_synced] BIT NOT NULL DEFAULT 0;
  IF COL_LENGTH('dbo.member_verifications', 'sync_status') IS NULL ALTER TABLE dbo.member_verifications ADD [sync_status] NVARCHAR(40) NOT NULL DEFAULT N'pending';
  IF COL_LENGTH('dbo.member_verifications', 'sync_attempts') IS NULL ALTER TABLE dbo.member_verifications ADD [sync_attempts] INT NOT NULL DEFAULT 0;
  IF COL_LENGTH('dbo.member_verifications', 'last_error_at') IS NULL ALTER TABLE dbo.member_verifications ADD [last_error_at] DATETIME2(3) NULL;
  IF COL_LENGTH('dbo.member_verifications', 'client_transaction_id') IS NULL ALTER TABLE dbo.member_verifications ADD [client_transaction_id] NVARCHAR(120) NULL;
END
GO

/* ------------------------------------------------------------------ */
/* Status history — every state change of every tracked record.        */
/* Written on the till first so a change made with no connection is    */
/* never lost, then pushed like any other trading record.              */
/* ------------------------------------------------------------------ */
IF OBJECT_ID('dbo.entity_status_history', 'U') IS NULL
CREATE TABLE dbo.entity_status_history (
  id                  UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
  entity_type         NVARCHAR(80)     NOT NULL,
  entity_id           NVARCHAR(120)    NOT NULL,
  status_kind         NVARCHAR(60)     NOT NULL DEFAULT N'status',
  previous_status     NVARCHAR(80)     NULL,
  new_status          NVARCHAR(80)     NOT NULL,
  reason              NVARCHAR(600)    NULL,
  actor_id            NVARCHAR(120)    NULL,
  actor_name          NVARCHAR(200)    NULL,
  actor_role          NVARCHAR(60)     NULL,
  store_id            NVARCHAR(80)     NULL,
  branch_id           NVARCHAR(60)     NULL,
  terminal_id         NVARCHAR(120)    NULL,
  related_entity_type NVARCHAR(80)     NULL,
  related_entity_id   NVARCHAR(120)    NULL,
  metadata            NVARCHAR(MAX)    NOT NULL DEFAULT N'{}',
  client_event_id     NVARCHAR(120)    NULL,
  occurred_at         DATETIME2(3)     NOT NULL DEFAULT SYSUTCDATETIME(),
  is_synced           BIT              NOT NULL DEFAULT 0,
  sync_status         NVARCHAR(40)     NOT NULL DEFAULT N'pending',
  sync_attempts       INT              NOT NULL DEFAULT 0,
  last_error_at       DATETIME2(3)     NULL,
  created_at          DATETIME2(3)     NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at          DATETIME2(3)     NOT NULL DEFAULT SYSUTCDATETIME()
);
GO
IF OBJECT_ID('dbo.entity_status_history', 'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.indexes
                   WHERE name = 'entity_status_history_entity_idx'
                     AND object_id = OBJECT_ID('dbo.entity_status_history'))
CREATE INDEX entity_status_history_entity_idx
  ON dbo.entity_status_history (entity_type, entity_id, occurred_at DESC);
GO

/* Business events now say which record changed and how, not just a
   sentence of text, so history can be queried instead of read. */
IF OBJECT_ID('dbo.activity_events', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.activity_events', 'entity_type') IS NULL ALTER TABLE dbo.activity_events ADD [entity_type] NVARCHAR(80) NULL;
  IF COL_LENGTH('dbo.activity_events', 'entity_id') IS NULL ALTER TABLE dbo.activity_events ADD [entity_id] NVARCHAR(120) NULL;
  IF COL_LENGTH('dbo.activity_events', 'previous_state') IS NULL ALTER TABLE dbo.activity_events ADD [previous_state] NVARCHAR(80) NULL;
  IF COL_LENGTH('dbo.activity_events', 'new_state') IS NULL ALTER TABLE dbo.activity_events ADD [new_state] NVARCHAR(80) NULL;
END
GO

/* A branch column so a rebuilt till can recover its own audit trail. */
IF OBJECT_ID('dbo.audit_logs', 'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.audit_logs', 'store_id') IS NULL ALTER TABLE dbo.audit_logs ADD [store_id] NVARCHAR(80) NULL;
END
GO

/* Tombstones.
   A deletion has to travel like any other change, so head office never removes
   a catalogue or member row outright — it stamps deleted_at. The till mirrors
   the stamp, drops its own copy on the next pull, and every read filters the
   stamped rows out in the meantime. */
IF OBJECT_ID('dbo.products', 'U') IS NOT NULL AND COL_LENGTH('dbo.products', 'deleted_at') IS NULL ALTER TABLE dbo.products ADD [deleted_at] DATETIME2(3) NULL;
GO
IF OBJECT_ID('dbo.product_categories', 'U') IS NOT NULL AND COL_LENGTH('dbo.product_categories', 'deleted_at') IS NULL ALTER TABLE dbo.product_categories ADD [deleted_at] DATETIME2(3) NULL;
GO
IF OBJECT_ID('dbo.product_barcodes', 'U') IS NOT NULL AND COL_LENGTH('dbo.product_barcodes', 'deleted_at') IS NULL ALTER TABLE dbo.product_barcodes ADD [deleted_at] DATETIME2(3) NULL;
GO
IF OBJECT_ID('dbo.uom_units', 'U') IS NOT NULL AND COL_LENGTH('dbo.uom_units', 'deleted_at') IS NULL ALTER TABLE dbo.uom_units ADD [deleted_at] DATETIME2(3) NULL;
GO
IF OBJECT_ID('dbo.suppliers', 'U') IS NOT NULL AND COL_LENGTH('dbo.suppliers', 'deleted_at') IS NULL ALTER TABLE dbo.suppliers ADD [deleted_at] DATETIME2(3) NULL;
GO
IF OBJECT_ID('dbo.promotions', 'U') IS NOT NULL AND COL_LENGTH('dbo.promotions', 'deleted_at') IS NULL ALTER TABLE dbo.promotions ADD [deleted_at] DATETIME2(3) NULL;
GO
IF OBJECT_ID('dbo.membership_tiers', 'U') IS NOT NULL AND COL_LENGTH('dbo.membership_tiers', 'deleted_at') IS NULL ALTER TABLE dbo.membership_tiers ADD [deleted_at] DATETIME2(3) NULL;
GO
IF OBJECT_ID('dbo.stores', 'U') IS NOT NULL AND COL_LENGTH('dbo.stores', 'deleted_at') IS NULL ALTER TABLE dbo.stores ADD [deleted_at] DATETIME2(3) NULL;
GO
IF OBJECT_ID('dbo.members', 'U') IS NOT NULL AND COL_LENGTH('dbo.members', 'deleted_at') IS NULL ALTER TABLE dbo.members ADD [deleted_at] DATETIME2(3) NULL;
GO
