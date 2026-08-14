-- ============================================================================
--  offline_sqlite_v2.sql — local Electron database
--  Location: app.getPath('userData')/local_pos_database.db
--
--  Mirrors online_schema_v2.sql. Every UUID is TEXT so ids round-trip to
--  PostgreSQL unchanged; every timestamp is an ISO-8601 UTC string.
--  Idempotent: executed on every app start.
-- ============================================================================

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;

-- ---------------------------------------------------------------- generic mirror
-- Catalogue rows pulled from the cloud (server-wins). Kept for entities that
-- do not yet have a typed table below.
CREATE TABLE IF NOT EXISTS mirror (
  entity      TEXT NOT NULL,
  id          TEXT NOT NULL,
  payload     TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (entity, id)
);

CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT);

-- ---------------------------------------------------------------- typed mirrors
CREATE TABLE IF NOT EXISTS products (
  id              TEXT PRIMARY KEY,
  barcode         TEXT NOT NULL DEFAULT '',
  sku             TEXT,
  name            TEXT NOT NULL,
  category        TEXT,
  product_group   TEXT,
  sub_category    TEXT,
  unit            TEXT,
  brand           TEXT,
  cost_price      REAL NOT NULL DEFAULT 0,
  selling_price   REAL NOT NULL DEFAULT 0,
  tax_rate        REAL NOT NULL DEFAULT 0,
  stock_quantity  INTEGER NOT NULL DEFAULT 0,
  reorder_level   INTEGER NOT NULL DEFAULT 0,
  stock_by_store  TEXT NOT NULL DEFAULT '{}',
  is_archived     INTEGER NOT NULL DEFAULT 0,
  updated_at      TEXT
);
CREATE INDEX IF NOT EXISTS products_barcode_idx ON products (barcode);
CREATE INDEX IF NOT EXISTS products_sku_idx ON products (sku);
CREATE INDEX IF NOT EXISTS products_name_idx ON products (name);

CREATE TABLE IF NOT EXISTS product_barcodes (
  id          TEXT PRIMARY KEY,
  product_id  TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  barcode     TEXT NOT NULL UNIQUE,
  label       TEXT,
  pack_size   REAL NOT NULL DEFAULT 1,
  is_primary  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT
);
CREATE INDEX IF NOT EXISTS product_barcodes_product_idx ON product_barcodes (product_id);

CREATE TABLE IF NOT EXISTS members (
  id             TEXT PRIMARY KEY,
  member_code    TEXT NOT NULL,
  full_name      TEXT NOT NULL,
  phone          TEXT NOT NULL,
  email          TEXT,
  tier_id        TEXT,
  loyalty_points REAL NOT NULL DEFAULT 0,
  total_spent    REAL NOT NULL DEFAULT 0,
  updated_at     TEXT
);
CREATE INDEX IF NOT EXISTS members_phone_idx ON members (phone);
CREATE INDEX IF NOT EXISTS members_code_idx ON members (member_code);

CREATE TABLE IF NOT EXISTS shifts (
  id             TEXT PRIMARY KEY,
  store_id       TEXT NOT NULL,
  terminal_id    TEXT,
  opened_by_name TEXT NOT NULL,
  opened_at      TEXT NOT NULL,
  closed_at      TEXT,
  opening_float  REAL NOT NULL DEFAULT 0,
  counted_cash   REAL,
  expected_cash  REAL,
  status         TEXT NOT NULL DEFAULT 'open',
  updated_at     TEXT
);
CREATE INDEX IF NOT EXISTS shifts_store_idx ON shifts (store_id, opened_at DESC);

CREATE TABLE IF NOT EXISTS sales (
  id              TEXT PRIMARY KEY,
  bill_number     TEXT NOT NULL,
  member_id       TEXT,
  store_id        TEXT,
  shift_id        TEXT,
  cashier_name    TEXT,
  subtotal_amount REAL NOT NULL DEFAULT 0,
  discount_amount REAL NOT NULL DEFAULT 0,
  tax_amount      REAL NOT NULL DEFAULT 0,
  total_amount    REAL NOT NULL DEFAULT 0,
  paid_amount     REAL NOT NULL DEFAULT 0,
  change_amount   REAL NOT NULL DEFAULT 0,
  payment_type    TEXT NOT NULL DEFAULT 'cash',
  payments        TEXT NOT NULL DEFAULT '[]',
  is_refunded     INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS sales_bill_number_idx ON sales (bill_number);
CREATE INDEX IF NOT EXISTS sales_created_idx ON sales (created_at DESC);
CREATE INDEX IF NOT EXISTS sales_store_created_idx ON sales (store_id, created_at DESC);

CREATE TABLE IF NOT EXISTS sale_items (
  id              TEXT PRIMARY KEY,
  sale_id         TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id      TEXT,
  product_name    TEXT NOT NULL,
  unit_price      REAL NOT NULL DEFAULT 0,
  unit_cost       REAL NOT NULL DEFAULT 0,
  quantity        INTEGER NOT NULL DEFAULT 0,
  discount_amount REAL NOT NULL DEFAULT 0,
  tax_rate        REAL NOT NULL DEFAULT 0,
  is_return       INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT
);
CREATE INDEX IF NOT EXISTS sale_items_sale_idx ON sale_items (sale_id);

CREATE TABLE IF NOT EXISTS bookings (
  id                 TEXT PRIMARY KEY,
  ref                TEXT NOT NULL,
  store_id           TEXT,
  customer_name      TEXT NOT NULL,
  customer_phone     TEXT NOT NULL,
  member_id          TEXT,
  service_name       TEXT,
  service_fee        REAL NOT NULL DEFAULT 0,
  racket_model       TEXT,
  string_type        TEXT,
  tension_main       REAL,
  tension_cross      REAL,
  tension_unit       TEXT NOT NULL DEFAULT 'lb',
  liability_accepted INTEGER NOT NULL DEFAULT 0,
  incident_note      TEXT,
  job_status         TEXT NOT NULL DEFAULT 'received',
  status             TEXT NOT NULL DEFAULT 'open',
  total              REAL NOT NULL DEFAULT 0,
  paid               REAL NOT NULL DEFAULT 0,
  promised_at        TEXT,
  created_at         TEXT NOT NULL,
  updated_at         TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS bookings_ref_idx ON bookings (ref);
CREATE INDEX IF NOT EXISTS bookings_status_idx ON bookings (job_status, created_at DESC);
CREATE INDEX IF NOT EXISTS bookings_phone_idx ON bookings (customer_phone);

CREATE TABLE IF NOT EXISTS booking_payments (
  id         TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  amount     REAL NOT NULL DEFAULT 0,
  method     TEXT NOT NULL DEFAULT 'cash',
  cashier    TEXT,
  paid_at    TEXT NOT NULL,
  created_at TEXT
);
CREATE INDEX IF NOT EXISTS booking_payments_booking_idx ON booking_payments (booking_id);

CREATE TABLE IF NOT EXISTS payment_transactions (
  id           TEXT PRIMARY KEY,
  source_type  TEXT NOT NULL CHECK (source_type IN ('sale', 'booking')),
  sale_id      TEXT,
  booking_id   TEXT,
  member_id    TEXT,
  store_id     TEXT,
  shift_id     TEXT,
  terminal_id  TEXT,
  amount       REAL NOT NULL DEFAULT 0,
  method       TEXT NOT NULL DEFAULT 'cash',
  kind         TEXT NOT NULL DEFAULT 'payment',
  reference    TEXT,
  cashier_name TEXT,
  note         TEXT NOT NULL DEFAULT '',
  paid_at      TEXT NOT NULL,
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS payment_transactions_sale_idx ON payment_transactions (sale_id);
CREATE INDEX IF NOT EXISTS payment_transactions_booking_idx ON payment_transactions (booking_id);
CREATE INDEX IF NOT EXISTS payment_transactions_created_idx ON payment_transactions (created_at DESC);

CREATE TABLE IF NOT EXISTS item_activity_logs (
  id             TEXT PRIMARY KEY,
  product_id     TEXT,
  product_name   TEXT,
  sku            TEXT,
  barcode        TEXT,
  store_id       TEXT,
  terminal_id    TEXT,
  activity_type  TEXT NOT NULL,
  reference      TEXT,
  quantity_delta INTEGER NOT NULL DEFAULT 0,
  stock_before   INTEGER,
  stock_after    INTEGER,
  unit_cost      REAL NOT NULL DEFAULT 0,
  staff_name     TEXT,
  note           TEXT NOT NULL DEFAULT '',
  created_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS item_activity_logs_product_idx ON item_activity_logs (product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS item_activity_logs_created_idx ON item_activity_logs (created_at DESC);

CREATE TABLE IF NOT EXISTS stock_adjustments (
  id             TEXT PRIMARY KEY,
  product_id     TEXT,
  product_name   TEXT,
  store_id       TEXT,
  reason         TEXT NOT NULL,
  note           TEXT NOT NULL DEFAULT '',
  previous_stock INTEGER NOT NULL DEFAULT 0,
  updated_stock  INTEGER NOT NULL DEFAULT 0,
  delta          INTEGER NOT NULL DEFAULT 0,
  staff_name     TEXT,
  created_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS stock_adjustments_product_idx ON stock_adjustments (product_id, created_at DESC);

CREATE TABLE IF NOT EXISTS system_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at TEXT
);

-- ---------------------------------------------------------------- sync plumbing
-- Every offline write lands here first and is drained by the sync engine.
CREATE TABLE IF NOT EXISTS offline_sync_queue (
  id            TEXT PRIMARY KEY,
  table_name    TEXT NOT NULL,
  record_id     TEXT,
  action_type   TEXT NOT NULL DEFAULT 'INSERT' CHECK (action_type IN ('INSERT', 'UPDATE')),
  payload_json  TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'failed')),
  error_message TEXT,
  attempts      INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS offline_sync_queue_status_idx ON offline_sync_queue (status, created_at);
CREATE INDEX IF NOT EXISTS offline_sync_queue_table_idx ON offline_sync_queue (table_name, created_at);

-- Local mirror of the cloud offline_sync_audit_log.
CREATE TABLE IF NOT EXISTS sync_audit (
  id         TEXT PRIMARY KEY,
  at         TEXT NOT NULL,
  direction  TEXT NOT NULL,
  entity     TEXT NOT NULL,
  record_id  TEXT,
  records    INTEGER NOT NULL DEFAULT 0,
  status     TEXT NOT NULL,
  error      TEXT
);
CREATE INDEX IF NOT EXISTS sync_audit_at_idx ON sync_audit (at DESC);

-- Legacy table kept so pre-v2 installs can be drained on first launch.
CREATE TABLE IF NOT EXISTS outbox (
  id         TEXT PRIMARY KEY,
  entity     TEXT NOT NULL,
  record_id  TEXT,
  payload    TEXT NOT NULL,
  created_at TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'pending',
  attempts   INTEGER NOT NULL DEFAULT 0,
  error      TEXT
);
