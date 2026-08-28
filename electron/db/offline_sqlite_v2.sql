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
PRAGMA busy_timeout = 5000;

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
  cashier_id   TEXT,
  cashier_name TEXT,
  note         TEXT NOT NULL DEFAULT '',
  paid_at      TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  updated_at   TEXT,
  status       TEXT NOT NULL DEFAULT 'completed',
  metadata     TEXT NOT NULL DEFAULT '{}',
  client_transaction_id TEXT,
  is_synced    INTEGER NOT NULL DEFAULT 0,
  sync_status  TEXT NOT NULL DEFAULT 'pending',
  row_version  INTEGER NOT NULL DEFAULT 1,
  sync_attempts INTEGER NOT NULL DEFAULT 0,
  sync_error   TEXT,
  last_error_at TEXT,
  synced_at    TEXT
);
CREATE INDEX IF NOT EXISTS payment_transactions_sale_idx ON payment_transactions (sale_id);
CREATE INDEX IF NOT EXISTS payment_transactions_booking_idx ON payment_transactions (booking_id);
CREATE INDEX IF NOT EXISTS payment_transactions_created_idx ON payment_transactions (created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS payment_transactions_client_txn_idx
  ON payment_transactions (client_transaction_id) WHERE client_transaction_id IS NOT NULL;

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
  staff_id       TEXT,
  staff_name     TEXT,
  role           TEXT,
  note           TEXT NOT NULL DEFAULT '',
  created_at     TEXT NOT NULL,
  updated_at     TEXT,
  client_transaction_id TEXT,
  is_synced      INTEGER NOT NULL DEFAULT 0,
  sync_status    TEXT NOT NULL DEFAULT 'pending',
  row_version    INTEGER NOT NULL DEFAULT 1,
  sync_attempts INTEGER NOT NULL DEFAULT 0,
  sync_error     TEXT,
  last_error_at TEXT,
  synced_at      TEXT
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
  draft_id       TEXT,
  created_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS stock_adjustments_product_idx ON stock_adjustments (product_id, created_at DESC);

CREATE TABLE IF NOT EXISTS system_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at TEXT
);

-- ------------------------------------------------- catalogue + ops mirrors
CREATE TABLE IF NOT EXISTS suppliers (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  contact_name TEXT,
  phone        TEXT,
  email        TEXT,
  address      TEXT,
  is_active    INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT,
  updated_at   TEXT
);

CREATE TABLE IF NOT EXISTS product_categories (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  kind       TEXT NOT NULL DEFAULT 'category',
  sort       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS uom_units (
  id            TEXT PRIMARY KEY,
  code          TEXT NOT NULL,
  name          TEXT NOT NULL,
  allow_decimal INTEGER NOT NULL DEFAULT 0,
  sort          INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT,
  updated_at    TEXT
);

CREATE TABLE IF NOT EXISTS membership_tiers (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  discount_percentage REAL NOT NULL DEFAULT 0,
  points_multiplier   REAL NOT NULL DEFAULT 1,
  created_at          TEXT,
  updated_at          TEXT
);

CREATE TABLE IF NOT EXISTS promotions (
  id               TEXT PRIMARY KEY,
  title            TEXT NOT NULL,
  promo_type       TEXT NOT NULL,
  min_spend        REAL NOT NULL DEFAULT 0,
  discount_percent REAL NOT NULL DEFAULT 0,
  discount_amount  REAL NOT NULL DEFAULT 0,
  foc_product_id   TEXT,
  points_per_dollar REAL NOT NULL DEFAULT 0,
  tier_rates       TEXT,
  is_active        INTEGER NOT NULL DEFAULT 1,
  start_date       TEXT,
  end_date         TEXT,
  created_at       TEXT,
  updated_at       TEXT
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id                TEXT PRIMARY KEY,
  po_number         TEXT,
  supplier_id       TEXT,
  supplier_name     TEXT,
  operator_name     TEXT,
  store_id          TEXT,
  invoice_date      TEXT,
  total_cost        REAL NOT NULL DEFAULT 0,
  total_items_count INTEGER NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'posted',
  created_at        TEXT NOT NULL,
  updated_at        TEXT
);
CREATE INDEX IF NOT EXISTS purchase_orders_created_idx ON purchase_orders (created_at DESC);
CREATE INDEX IF NOT EXISTS purchase_orders_store_status_idx ON purchase_orders (store_id, status);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id                TEXT PRIMARY KEY,
  po_id             TEXT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id        TEXT,
  barcode           TEXT,
  sku               TEXT,
  product_name      TEXT,
  cost_price        REAL NOT NULL DEFAULT 0,
  selling_price     REAL NOT NULL DEFAULT 0,
  quantity_received INTEGER NOT NULL DEFAULT 0,
  subtotal_cost     REAL NOT NULL DEFAULT 0,
  created_at        TEXT,
  updated_at        TEXT
);
CREATE INDEX IF NOT EXISTS purchase_order_items_po_idx ON purchase_order_items (po_id);

CREATE TABLE IF NOT EXISTS stock_transfers (
  id            TEXT PRIMARY KEY,
  ref           TEXT NOT NULL,
  kind          TEXT NOT NULL DEFAULT 'transfer',
  from_store_id TEXT NOT NULL,
  to_store_id   TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending',
  note          TEXT NOT NULL DEFAULT '',
  created_by    TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT
);
CREATE INDEX IF NOT EXISTS stock_transfers_status_idx ON stock_transfers (status, created_at DESC);

CREATE TABLE IF NOT EXISTS stock_transfer_items (
  id                TEXT PRIMARY KEY,
  transfer_id       TEXT NOT NULL REFERENCES stock_transfers(id) ON DELETE CASCADE,
  product_id        TEXT,
  barcode           TEXT,
  sku               TEXT,
  product_name      TEXT,
  quantity          INTEGER NOT NULL DEFAULT 0,
  quantity_received INTEGER NOT NULL DEFAULT 0,
  unit_cost         REAL NOT NULL DEFAULT 0,
  created_at        TEXT
);
CREATE INDEX IF NOT EXISTS stock_transfer_items_transfer_idx ON stock_transfer_items (transfer_id);

CREATE TABLE IF NOT EXISTS held_orders (
  id            TEXT PRIMARY KEY,
  label         TEXT NOT NULL,
  store_id      TEXT,
  shift_id      TEXT,
  held_by       TEXT,
  total         REAL NOT NULL DEFAULT 0,
  lines         TEXT NOT NULL DEFAULT '[]',
  cart_discount REAL NOT NULL DEFAULT 0,
  member_id     TEXT,
  member_name   TEXT,
  note          TEXT NOT NULL DEFAULT '',
  held_at       TEXT NOT NULL,
  created_at    TEXT,
  updated_at    TEXT
);
CREATE INDEX IF NOT EXISTS held_orders_store_idx ON held_orders (store_id, held_at DESC);

-- Inventory deltas already applied locally: a replay can never deduct twice.
CREATE TABLE IF NOT EXISTS stock_delta_applied (
  movement_id TEXT PRIMARY KEY,
  product_id  TEXT,
  store_id    TEXT,
  delta       INTEGER NOT NULL DEFAULT 0,
  applied_at  TEXT NOT NULL
);

-- ---------------------------------------------------------------- sync plumbing
-- Every offline write lands here first and is drained by the sync engine.
CREATE TABLE IF NOT EXISTS offline_sync_queue (
  id            TEXT PRIMARY KEY,
  table_name    TEXT NOT NULL,
  record_id     TEXT,
  action_type   TEXT NOT NULL DEFAULT 'INSERT' CHECK (action_type IN ('INSERT', 'UPDATE', 'DELETE')),
  payload_json  TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'failed', 'dead_letter')),
  error_message TEXT,
  attempts      INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TEXT,
  client_transaction_id TEXT,
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

-- Per-table high-water marks, scoped to the branch and till so one machine can
-- serve two branches. The puller resumes from last_synced_at, so one slow
-- table never holds the others back.
CREATE TABLE IF NOT EXISTS sync_metadata (
  table_name     TEXT NOT NULL,
  store_id       TEXT NOT NULL DEFAULT '',
  terminal_id    TEXT NOT NULL DEFAULT '',
  last_synced_at TEXT,
  last_pushed_at TEXT,
  rows_pushed    INTEGER NOT NULL DEFAULT 0,
  last_error     TEXT,
  updated_at     TEXT,
  PRIMARY KEY (table_name, store_id, terminal_id)
);

-- ============================================================================
--  Added in 1.3.x — mirrors for the newer POS features.
--  Column names match the central database exactly, so a queued row is pushed
--  up with no field mapping, and a branch running SQL Server instead of this
--  file ends up with the same shape.
-- ============================================================================

-- ---------------------------------------------------------------- catalogue
CREATE TABLE IF NOT EXISTS payment_types (
  id                 TEXT PRIMARY KEY,
  name               TEXT NOT NULL,
  type_code          TEXT NOT NULL,
  requires_reference INTEGER NOT NULL DEFAULT 0,
  is_active          INTEGER NOT NULL DEFAULT 1,
  icon               TEXT,
  sort_order         INTEGER NOT NULL DEFAULT 0,
  is_system          INTEGER NOT NULL DEFAULT 0,
  is_synced          INTEGER NOT NULL DEFAULT 0,
  sync_status        TEXT NOT NULL DEFAULT 'pending',
  row_version        INTEGER NOT NULL DEFAULT 1,
  created_at         TEXT,
  updated_at         TEXT
);

CREATE TABLE IF NOT EXISTS stores (
  id          TEXT PRIMARY KEY,
  code        TEXT,
  name        TEXT NOT NULL,
  address     TEXT,
  phone       TEXT,
  group_id    TEXT,
  is_synced   INTEGER NOT NULL DEFAULT 1,
  sync_status TEXT NOT NULL DEFAULT 'synced',
  row_version INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT,
  updated_at  TEXT
);

-- ---------------------------------------------------------------- coupons
CREATE TABLE IF NOT EXISTS coupon_campaigns (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  slug           TEXT NOT NULL,
  discount_type  TEXT NOT NULL DEFAULT 'percent',
  discount_value REAL NOT NULL DEFAULT 0,
  scope          TEXT NOT NULL DEFAULT 'all',
  scope_value    TEXT,
  max_claims     INTEGER,
  max_per_member INTEGER,
  claims_count   INTEGER NOT NULL DEFAULT 0,
  starts_at      TEXT,
  expires_at     TEXT,
  is_active      INTEGER NOT NULL DEFAULT 1,
  is_welcome     INTEGER NOT NULL DEFAULT 0,
  is_synced      INTEGER NOT NULL DEFAULT 0,
  sync_status    TEXT NOT NULL DEFAULT 'pending',
  row_version    INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT,
  updated_at     TEXT
);

CREATE TABLE IF NOT EXISTS issued_vouchers (
  id               TEXT PRIMARY KEY,
  token_slug       TEXT NOT NULL,
  campaign_id      TEXT,
  member_id        TEXT,
  status           TEXT NOT NULL DEFAULT 'issued',
  issued_at        TEXT,
  expires_at       TEXT,
  issued_by        TEXT,
  issued_source    TEXT,
  redeemed_at      TEXT,
  redeemed_by      TEXT,
  redeemed_sale_id TEXT,
  disabled_at      TEXT,
  disabled_by      TEXT,
  disable_reason   TEXT,
  store_id         TEXT,
  is_synced        INTEGER NOT NULL DEFAULT 0,
  sync_status      TEXT NOT NULL DEFAULT 'pending',
  row_version      INTEGER NOT NULL DEFAULT 1,
  created_at       TEXT,
  updated_at       TEXT
);
CREATE INDEX IF NOT EXISTS issued_vouchers_token_idx ON issued_vouchers (token_slug);

CREATE TABLE IF NOT EXISTS coupon_events (
  id            TEXT PRIMARY KEY,
  event_type    TEXT NOT NULL,
  campaign_id   TEXT,
  campaign_name TEXT,
  voucher_token TEXT,
  member_id     TEXT,
  member_phone  TEXT,
  store_id      TEXT,
  terminal_id   TEXT,
  staff_name    TEXT,
  staff_role    TEXT,
  sale_id       TEXT,
  note          TEXT,
  is_synced     INTEGER NOT NULL DEFAULT 0,
  sync_status   TEXT NOT NULL DEFAULT 'pending',
  created_at    TEXT,
  updated_at    TEXT
);

-- ---------------------------------------------------------------- till floor
CREATE TABLE IF NOT EXISTS drawer_events (
  id          TEXT PRIMARY KEY,
  store_id    TEXT,
  terminal_id TEXT,
  shift_id    TEXT,
  staff_id    TEXT,
  staff_name  TEXT,
  role        TEXT,
  reason      TEXT,
  note        TEXT,
  approved_by TEXT,
  is_synced   INTEGER NOT NULL DEFAULT 0,
  sync_status TEXT NOT NULL DEFAULT 'pending',
  created_at  TEXT,
  updated_at  TEXT
);

CREATE TABLE IF NOT EXISTS shift_sessions (
  id            TEXT PRIMARY KEY,
  shift_id      TEXT NOT NULL,
  store_id      TEXT,
  terminal_id   TEXT,
  terminal_name TEXT,
  staff_id      TEXT,
  staff_name    TEXT,
  role          TEXT,
  signed_in_at  TEXT,
  signed_out_at TEXT,
  is_synced     INTEGER NOT NULL DEFAULT 0,
  sync_status   TEXT NOT NULL DEFAULT 'pending',
  row_version   INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT,
  updated_at    TEXT
);
CREATE INDEX IF NOT EXISTS shift_sessions_shift_idx ON shift_sessions (shift_id);

-- ------------------------------------------------------- staff (offline PIN)
CREATE TABLE IF NOT EXISTS staff_roles (
  slug        TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  base_level  TEXT,
  permissions TEXT NOT NULL DEFAULT '{}',
  is_core     INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT,
  updated_at  TEXT
);

CREATE TABLE IF NOT EXISTS app_users (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  full_name     TEXT,
  email         TEXT,
  role          TEXT,
  role_slug     TEXT,
  store_id      TEXT,
  is_active     INTEGER NOT NULL DEFAULT 1,
  permissions   TEXT NOT NULL DEFAULT '{}',
  pin_hash      TEXT,
  pin_length    INTEGER,
  last_login_at TEXT,
  is_synced     INTEGER NOT NULL DEFAULT 1,
  sync_status   TEXT NOT NULL DEFAULT 'synced',
  row_version   INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT,
  updated_at    TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS app_users_user_id_idx ON app_users (user_id);

CREATE TABLE IF NOT EXISTS cashiers (
  id            TEXT PRIMARY KEY,
  username      TEXT NOT NULL,
  full_name     TEXT,
  pin_hash      TEXT,
  store_id      TEXT,
  role_slug     TEXT,
  permissions   TEXT NOT NULL DEFAULT '{}',
  is_active     INTEGER NOT NULL DEFAULT 1,
  last_login_at TEXT,
  is_synced     INTEGER NOT NULL DEFAULT 1,
  sync_status   TEXT NOT NULL DEFAULT 'synced',
  created_at    TEXT,
  updated_at    TEXT
);

-- ---------------------------------------------------------------- members OTP
CREATE TABLE IF NOT EXISTS member_verifications (
  id          TEXT PRIMARY KEY,
  member_id   TEXT,
  phone       TEXT,
  email       TEXT,
  channel     TEXT NOT NULL DEFAULT 'whatsapp',
  otp_code    TEXT,
  attempts    INTEGER NOT NULL DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'pending',
  sent_by     TEXT,
  store_id    TEXT,
  expires_at  TEXT,
  verified_at TEXT,
  is_synced   INTEGER NOT NULL DEFAULT 0,
  sync_status TEXT NOT NULL DEFAULT 'pending',
  created_at  TEXT,
  updated_at  TEXT
);

-- ------------------------------------------------------ terminal supervision
CREATE TABLE IF NOT EXISTS branch_telemetry (
  terminal_id         TEXT PRIMARY KEY,
  store_id            TEXT,
  branch_id           TEXT,
  terminal_name       TEXT,
  staff_name          TEXT,
  staff_role          TEXT,
  db_mode             TEXT,
  connection_status   TEXT,
  storage_engine      TEXT,
  pending_count       INTEGER NOT NULL DEFAULT 0,
  pending_queue_count INTEGER NOT NULL DEFAULT 0,
  conflict_count      INTEGER NOT NULL DEFAULT 0,
  status              TEXT,
  app_version         TEXT,
  platform            TEXT,
  last_synced_at      TEXT,
  last_ping           TEXT,
  last_seen_at        TEXT,
  is_synced           INTEGER NOT NULL DEFAULT 0,
  sync_status         TEXT NOT NULL DEFAULT 'pending',
  created_at          TEXT,
  updated_at          TEXT
);

CREATE TABLE IF NOT EXISTS terminal_commands (
  id           TEXT PRIMARY KEY,
  terminal_id  TEXT NOT NULL,
  store_id     TEXT,
  command      TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending',
  note         TEXT,
  result       TEXT,
  issued_by    TEXT,
  issued_role  TEXT,
  picked_up_at TEXT,
  finished_at  TEXT,
  is_synced    INTEGER NOT NULL DEFAULT 0,
  sync_status  TEXT NOT NULL DEFAULT 'pending',
  created_at   TEXT,
  updated_at   TEXT
);
CREATE INDEX IF NOT EXISTS terminal_commands_terminal_idx
  ON terminal_commands (terminal_id, status);

CREATE TABLE IF NOT EXISTS whatsapp_queue (
  id              TEXT PRIMARY KEY,
  phone_number_id TEXT,
  recipient       TEXT NOT NULL,
  body            TEXT NOT NULL,
  reference       TEXT,
  store_id        TEXT,
  status          TEXT NOT NULL DEFAULT 'queued',
  error           TEXT,
  queued_at       TEXT,
  sent_at         TEXT,
  is_synced       INTEGER NOT NULL DEFAULT 0,
  sync_status     TEXT NOT NULL DEFAULT 'pending',
  created_at      TEXT,
  updated_at      TEXT
);
CREATE INDEX IF NOT EXISTS whatsapp_queue_status_idx ON whatsapp_queue (status, queued_at);

-- ---------------------------------------------------------------- audit trail
CREATE TABLE IF NOT EXISTS activity_events (
  id              TEXT PRIMARY KEY,
  event_type      TEXT NOT NULL,
  severity        TEXT NOT NULL DEFAULT 'info',
  title           TEXT,
  message         TEXT,
  actor_id        TEXT,
  actor_name      TEXT,
  actor_role      TEXT,
  terminal_id     TEXT,
  terminal_name   TEXT,
  store_id        TEXT,
  entity_type     TEXT,
  entity_id       TEXT,
  amount          REAL,
  meta            TEXT NOT NULL DEFAULT '{}',
  whatsapp_status TEXT,
  whatsapp_error  TEXT,
  client_event_id TEXT,
  is_synced       INTEGER NOT NULL DEFAULT 0,
  sync_status     TEXT NOT NULL DEFAULT 'pending',
  created_at      TEXT,
  updated_at      TEXT
);
CREATE INDEX IF NOT EXISTS activity_events_created_idx ON activity_events (created_at DESC);

CREATE TABLE IF NOT EXISTS audit_logs (
  id              TEXT PRIMARY KEY,
  user_id         TEXT,
  user_name       TEXT,
  action          TEXT,
  action_category TEXT,
  action_name     TEXT,
  target_module   TEXT,
  entity          TEXT,
  before_state    TEXT,
  after_state     TEXT,
  details         TEXT NOT NULL DEFAULT '{}',
  is_synced       INTEGER NOT NULL DEFAULT 0,
  sync_status     TEXT NOT NULL DEFAULT 'pending',
  created_at      TEXT,
  updated_at      TEXT
);
CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON audit_logs (created_at DESC);


-- ==========================================================================
--  Cloud-parity top-up: tables added since the last revision.
--  Additive only; the runtime column check in sqlite.cjs fills in any
--  column added to an existing table.
-- ==========================================================================

-- ---- integration_settings ----
CREATE TABLE IF NOT EXISTS integration_settings (
  id TEXT PRIMARY KEY NOT NULL,
  provider_name TEXT,
  api_keys_encrypted TEXT DEFAULT '{}' NOT NULL,
  verification_channel TEXT DEFAULT 'whatsapp' NOT NULL,
  strict_verification INTEGER DEFAULT 0 NOT NULL,
  is_active INTEGER DEFAULT 1 NOT NULL,
  updated_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  is_synced INTEGER DEFAULT 0,
  sync_status TEXT DEFAULT 'pending',
  row_version INTEGER DEFAULT 0,
  sync_attempts INTEGER DEFAULT 0,
  last_error_at TEXT,
  client_transaction_id TEXT
);
CREATE INDEX IF NOT EXISTS ix_integration_settings_created_at ON integration_settings (created_at);

-- ---- offline_sync_audit_log ----
CREATE TABLE IF NOT EXISTS offline_sync_audit_log (
  id TEXT PRIMARY KEY NOT NULL,
  terminal_id TEXT,
  store_id TEXT,
  direction TEXT,
  table_name TEXT,
  record_id TEXT,
  records INTEGER DEFAULT 0 NOT NULL,
  status TEXT DEFAULT 'ok' NOT NULL,
  error_message TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  created_at TEXT NOT NULL,
  is_synced INTEGER DEFAULT 0,
  sync_status TEXT DEFAULT 'pending',
  row_version INTEGER DEFAULT 0,
  sync_attempts INTEGER DEFAULT 0,
  last_error_at TEXT,
  client_transaction_id TEXT
);
CREATE INDEX IF NOT EXISTS ix_offline_sync_audit_log_store_id ON offline_sync_audit_log (store_id);
CREATE INDEX IF NOT EXISTS ix_offline_sync_audit_log_status ON offline_sync_audit_log (status);
CREATE INDEX IF NOT EXISTS ix_offline_sync_audit_log_created_at ON offline_sync_audit_log (created_at);

-- ---- pin_attempts ----
CREATE TABLE IF NOT EXISTS pin_attempts (
  key TEXT PRIMARY KEY NOT NULL,
  attempts INTEGER DEFAULT 0 NOT NULL,
  window_started_at TEXT NOT NULL,
  locked_until TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  is_synced INTEGER DEFAULT 0,
  sync_status TEXT DEFAULT 'pending',
  row_version INTEGER DEFAULT 0,
  sync_attempts INTEGER DEFAULT 0,
  last_error_at TEXT,
  client_transaction_id TEXT
);
CREATE INDEX IF NOT EXISTS ix_pin_attempts_created_at ON pin_attempts (created_at);

-- ---- pos_settings ----
CREATE TABLE IF NOT EXISTS pos_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 NOT NULL,
  tax_percentage REAL DEFAULT 0 NOT NULL,
  enable_tax INTEGER DEFAULT 1 NOT NULL,
  tax_mode TEXT DEFAULT 'exclusive' NOT NULL,
  paper_size TEXT DEFAULT '80mm' NOT NULL,
  header_text TEXT,
  footer_text TEXT,
  show_logo INTEGER DEFAULT 1 NOT NULL,
  show_points INTEGER DEFAULT 1 NOT NULL,
  show_barcode INTEGER DEFAULT 1 NOT NULL,
  show_tax_details INTEGER DEFAULT 1 NOT NULL,
  updated_at TEXT NOT NULL,
  company_name TEXT DEFAULT 'NORTHWIND & CO.' NOT NULL,
  tax_number TEXT,
  reg_number TEXT,
  phone TEXT,
  website TEXT,
  fonts TEXT DEFAULT '{}' NOT NULL,
  custom_lines TEXT DEFAULT '[]' NOT NULL,
  qr TEXT DEFAULT '{}' NOT NULL,
  review_max_voids INTEGER DEFAULT 5 NOT NULL,
  review_max_refunds INTEGER DEFAULT 3 NOT NULL,
  review_max_refund_value REAL DEFAULT 200 NOT NULL,
  review_max_nosale INTEGER DEFAULT 5 NOT NULL,
  review_max_discount_pct REAL DEFAULT 15 NOT NULL,
  day_start_time TEXT DEFAULT '09:00' NOT NULL,
  day_end_time TEXT DEFAULT '22:00' NOT NULL,
  max_shift_hours REAL DEFAULT 12 NOT NULL,
  shift_reminder_minutes INTEGER DEFAULT 30 NOT NULL,
  ui_visibility TEXT DEFAULT '{"hidden": {}}' NOT NULL,
  integration_settings TEXT DEFAULT '{}' NOT NULL,
  region_country TEXT DEFAULT '' NOT NULL,
  time_zone TEXT DEFAULT '' NOT NULL,
  date_format TEXT DEFAULT 'dd/MM/yyyy' NOT NULL,
  time_format TEXT DEFAULT '24h' NOT NULL,
  booking_slip TEXT DEFAULT '{}' NOT NULL,
  notification_settings TEXT DEFAULT '{}' NOT NULL,
  row_version INTEGER DEFAULT 1 NOT NULL,
  logo_data_url TEXT,
  receipt_design TEXT DEFAULT '{}' NOT NULL,
  is_synced INTEGER DEFAULT 0,
  sync_status TEXT DEFAULT 'pending',
  sync_attempts INTEGER DEFAULT 0,
  last_error_at TEXT,
  client_transaction_id TEXT
);
CREATE INDEX IF NOT EXISTS ix_pos_settings_phone ON pos_settings (phone);

-- ---- public_flags ----
CREATE TABLE IF NOT EXISTS public_flags (
  key TEXT PRIMARY KEY NOT NULL,
  enabled INTEGER DEFAULT 1 NOT NULL,
  updated_at TEXT NOT NULL,
  is_synced INTEGER DEFAULT 0,
  sync_status TEXT DEFAULT 'pending',
  row_version INTEGER DEFAULT 0,
  sync_attempts INTEGER DEFAULT 0,
  last_error_at TEXT,
  client_transaction_id TEXT
);

-- ---- secure_settings ----
CREATE TABLE IF NOT EXISTS secure_settings (
  key TEXT PRIMARY KEY NOT NULL,
  ciphertext TEXT,
  hint TEXT,
  updated_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  is_synced INTEGER DEFAULT 0,
  sync_status TEXT DEFAULT 'pending',
  row_version INTEGER DEFAULT 0,
  sync_attempts INTEGER DEFAULT 0,
  last_error_at TEXT,
  client_transaction_id TEXT
);
CREATE INDEX IF NOT EXISTS ix_secure_settings_created_at ON secure_settings (created_at);

-- ---- security_findings ----
CREATE TABLE IF NOT EXISTS security_findings (
  id TEXT PRIMARY KEY NOT NULL,
  fingerprint TEXT,
  source TEXT,
  severity TEXT DEFAULT 'medium' NOT NULL,
  title TEXT,
  detail TEXT DEFAULT '' NOT NULL,
  deployment_ref TEXT,
  status TEXT DEFAULT 'open' NOT NULL,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  acknowledged_by TEXT,
  acknowledged_at TEXT,
  resolved_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  is_synced INTEGER DEFAULT 0,
  sync_status TEXT DEFAULT 'pending',
  row_version INTEGER DEFAULT 0,
  sync_attempts INTEGER DEFAULT 0,
  last_error_at TEXT,
  client_transaction_id TEXT
);
CREATE INDEX IF NOT EXISTS ix_security_findings_status ON security_findings (status);
CREATE INDEX IF NOT EXISTS ix_security_findings_created_at ON security_findings (created_at);

-- ---- settings_locks ----
CREATE TABLE IF NOT EXISTS settings_locks (
  section TEXT PRIMARY KEY NOT NULL,
  locked INTEGER DEFAULT 0 NOT NULL,
  updated_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  is_synced INTEGER DEFAULT 0,
  sync_status TEXT DEFAULT 'pending',
  row_version INTEGER DEFAULT 0,
  sync_attempts INTEGER DEFAULT 0,
  last_error_at TEXT,
  client_transaction_id TEXT
);
CREATE INDEX IF NOT EXISTS ix_settings_locks_created_at ON settings_locks (created_at);

-- ---- settings_overrides ----
CREATE TABLE IF NOT EXISTS settings_overrides (
  scope TEXT DEFAULT 'BRANCH' NOT NULL,
  scope_id TEXT DEFAULT '' NOT NULL,
  section TEXT NOT NULL,
  patch TEXT DEFAULT '{}' NOT NULL,
  updated_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  is_synced INTEGER DEFAULT 0,
  sync_status TEXT DEFAULT 'pending',
  row_version INTEGER DEFAULT 0,
  sync_attempts INTEGER DEFAULT 0,
  last_error_at TEXT,
  client_transaction_id TEXT,
  PRIMARY KEY (scope, scope_id, section)
);
CREATE INDEX IF NOT EXISTS ix_settings_overrides_created_at ON settings_overrides (created_at);

-- ---- sku_audit ----
CREATE TABLE IF NOT EXISTS sku_audit (
  id TEXT PRIMARY KEY NOT NULL,
  sku TEXT,
  product_id TEXT,
  product_name TEXT,
  source TEXT DEFAULT 'auto' NOT NULL,
  previous_sku TEXT,
  store_id TEXT,
  store_name TEXT,
  terminal_id TEXT,
  staff_id TEXT,
  staff_name TEXT,
  role TEXT,
  created_at TEXT NOT NULL,
  is_synced INTEGER DEFAULT 0,
  sync_status TEXT DEFAULT 'pending',
  row_version INTEGER DEFAULT 0,
  sync_attempts INTEGER DEFAULT 0,
  last_error_at TEXT,
  client_transaction_id TEXT
);
CREATE INDEX IF NOT EXISTS ix_sku_audit_sku ON sku_audit (sku);
CREATE INDEX IF NOT EXISTS ix_sku_audit_product_id ON sku_audit (product_id);
CREATE INDEX IF NOT EXISTS ix_sku_audit_store_id ON sku_audit (store_id);
CREATE INDEX IF NOT EXISTS ix_sku_audit_created_at ON sku_audit (created_at);

-- ---- system_audit_logs ----
CREATE TABLE IF NOT EXISTS system_audit_logs (
  id TEXT PRIMARY KEY NOT NULL,
  actor_id TEXT,
  actor_name TEXT,
  actor_role TEXT,
  action_type TEXT,
  entity_affected TEXT,
  entity_id TEXT,
  old_value TEXT,
  new_value TEXT,
  terminal_id TEXT,
  ip_address TEXT,
  store_id TEXT,
  note TEXT,
  created_at TEXT NOT NULL,
  is_synced INTEGER DEFAULT 0,
  sync_status TEXT DEFAULT 'pending',
  row_version INTEGER DEFAULT 0,
  sync_attempts INTEGER DEFAULT 0,
  last_error_at TEXT,
  client_transaction_id TEXT
);
CREATE INDEX IF NOT EXISTS ix_system_audit_logs_store_id ON system_audit_logs (store_id);
CREATE INDEX IF NOT EXISTS ix_system_audit_logs_created_at ON system_audit_logs (created_at);

-- ---- terminal_tokens ----
CREATE TABLE IF NOT EXISTS terminal_tokens (
  id TEXT PRIMARY KEY NOT NULL,
  location_id TEXT,
  location_name TEXT,
  device_name TEXT,
  status TEXT DEFAULT 'active' NOT NULL,
  created_at TEXT NOT NULL,
  activated_at TEXT,
  revoked_at TEXT,
  last_seen_at TEXT,
  reissued_at TEXT,
  replaced_by TEXT,
  claimed_by_device TEXT,
  claimed_at TEXT,
  platform TEXT DEFAULT 'unknown' NOT NULL,
  row_version INTEGER DEFAULT 1 NOT NULL,
  is_synced INTEGER DEFAULT 0,
  sync_status TEXT DEFAULT 'pending',
  sync_attempts INTEGER DEFAULT 0,
  last_error_at TEXT,
  client_transaction_id TEXT
);
CREATE INDEX IF NOT EXISTS ix_terminal_tokens_status ON terminal_tokens (status);
CREATE INDEX IF NOT EXISTS ix_terminal_tokens_created_at ON terminal_tokens (created_at);

-- ---- user_roles ----
CREATE TABLE IF NOT EXISTS user_roles (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT,
  role TEXT,
  created_at TEXT NOT NULL,
  is_synced INTEGER DEFAULT 0,
  sync_status TEXT DEFAULT 'pending',
  row_version INTEGER DEFAULT 0,
  sync_attempts INTEGER DEFAULT 0,
  last_error_at TEXT,
  client_transaction_id TEXT
);
CREATE INDEX IF NOT EXISTS ix_user_roles_created_at ON user_roles (created_at);

-- ---- stock_count_drafts ----
CREATE TABLE IF NOT EXISTS stock_count_drafts (
  id           TEXT PRIMARY KEY NOT NULL,
  reference    TEXT,
  store_id     TEXT,
  store_code   TEXT,
  terminal_id  TEXT,
  staff_id     TEXT,
  staff_name   TEXT,
  status       TEXT NOT NULL DEFAULT 'draft',
  reason       TEXT,
  note         TEXT NOT NULL DEFAULT '',
  lines        TEXT NOT NULL DEFAULT '[]',
  line_count   INTEGER NOT NULL DEFAULT 0,
  total_impact REAL NOT NULL DEFAULT 0,
  posted_at    TEXT,
  posted_by    TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT,
  is_synced    INTEGER DEFAULT 0,
  sync_status  TEXT DEFAULT 'pending',
  row_version  INTEGER DEFAULT 0,
  sync_attempts INTEGER DEFAULT 0,
  last_error_at TEXT,
  client_transaction_id TEXT
);
CREATE INDEX IF NOT EXISTS ix_stock_count_drafts_store ON stock_count_drafts (store_id, status, updated_at);
CREATE INDEX IF NOT EXISTS ix_stock_count_drafts_created ON stock_count_drafts (store_id, status, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS ux_stock_count_drafts_reference ON stock_count_drafts (reference) WHERE reference IS NOT NULL;
