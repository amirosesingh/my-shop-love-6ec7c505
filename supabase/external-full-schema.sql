-- ============================================================
-- Lucky Charms POS — complete backend schema
-- Safe to run repeatedly on an existing database: nothing is dropped.
-- Paste the whole file into the SQL editor and run once.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ---------- enum types ----------
DO $$ BEGIN CREATE TYPE public.app_role AS ENUM ('admin', 'manager', 'staff'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- tables ----------

CREATE TABLE IF NOT EXISTS public.app_users (
  id uuid DEFAULT gen_random_uuid(),
  user_id character varying(64),
  full_name character varying(160),
  email character varying(255),
  role app_role DEFAULT 'staff'::app_role,
  store_id character varying(64),
  is_active boolean DEFAULT true,
  permissions jsonb DEFAULT jsonb_build_object('can_open_drawer', true, 'can_close_drawer', true, 'can_view_drawer_balance', false, 'can_process_sale', true, 'can_give_discount', false, 'can_void_item', false, 'can_hold_cart', true, 'can_process_refund', false, 'can_process_exchange', false, 'can_view_inventory', true, 'can_edit_product_price', false, 'can_add_new_product', false, 'can_receive_purchase_order', false, 'can_add_member', true, 'can_edit_member_points', false, 'can_apply_member_discount', true, 'can_view_sales_reports', false, 'can_access_pos_settings', false, 'can_manage_staff', false),
  pin_hash text DEFAULT ''::text,
  auth_user_id uuid,
  last_login_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (id)
);
ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS user_id character varying(64);
ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS full_name character varying(160);
ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS email character varying(255);
ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS role app_role DEFAULT 'staff'::app_role;
ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS store_id character varying(64);
ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS permissions jsonb DEFAULT jsonb_build_object('can_open_drawer', true, 'can_close_drawer', true, 'can_view_drawer_balance', false, 'can_process_sale', true, 'can_give_discount', false, 'can_void_item', false, 'can_hold_cart', true, 'can_process_refund', false, 'can_process_exchange', false, 'can_view_inventory', true, 'can_edit_product_price', false, 'can_add_new_product', false, 'can_receive_purchase_order', false, 'can_add_member', true, 'can_edit_member_points', false, 'can_apply_member_discount', true, 'can_view_sales_reports', false, 'can_access_pos_settings', false, 'can_manage_staff', false);
ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS pin_hash text DEFAULT ''::text;
ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS auth_user_id uuid;
ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS last_login_at timestamp with time zone;
ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
DO $$ BEGIN ALTER TABLE public.app_users ADD CONSTRAINT app_users_user_id_key UNIQUE (user_id); EXCEPTION WHEN others THEN NULL; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS app_users_auth_user_id_key ON public.app_users USING btree (auth_user_id) WHERE (auth_user_id IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS app_users_pkey ON public.app_users USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS app_users_user_id_key ON public.app_users USING btree (user_id);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid DEFAULT gen_random_uuid(),
  user_name text,
  action_category text,
  action_name text,
  target_module text,
  details jsonb,
  created_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (id)
);
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS user_name text;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS action_category text;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS action_name text;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS target_module text;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS details jsonb;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs USING btree (created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS audit_logs_pkey ON public.audit_logs USING btree (id);

CREATE TABLE IF NOT EXISTS public.booking_payments (
  id uuid DEFAULT gen_random_uuid(),
  booking_id uuid,
  amount numeric DEFAULT 0,
  method text DEFAULT 'cash'::text,
  cashier text,
  paid_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (id)
);
ALTER TABLE public.booking_payments ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.booking_payments ADD COLUMN IF NOT EXISTS booking_id uuid;
ALTER TABLE public.booking_payments ADD COLUMN IF NOT EXISTS amount numeric DEFAULT 0;
ALTER TABLE public.booking_payments ADD COLUMN IF NOT EXISTS method text DEFAULT 'cash'::text;
ALTER TABLE public.booking_payments ADD COLUMN IF NOT EXISTS cashier text;
ALTER TABLE public.booking_payments ADD COLUMN IF NOT EXISTS paid_at timestamp with time zone DEFAULT now();
ALTER TABLE public.booking_payments ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
DO $$ BEGIN ALTER TABLE public.booking_payments ADD CONSTRAINT booking_payments_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE; EXCEPTION WHEN others THEN NULL; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS booking_payments_pkey ON public.booking_payments USING btree (id);

CREATE TABLE IF NOT EXISTS public.bookings (
  id uuid DEFAULT gen_random_uuid(),
  ref text,
  store_id text,
  shift_id text,
  customer_name text DEFAULT ''::text,
  customer_phone text DEFAULT ''::text,
  member_id uuid,
  service_type_id text,
  service_name text,
  service_fee numeric DEFAULT 0,
  payment_timing text,
  lines jsonb DEFAULT '[]'::jsonb,
  subtotal numeric DEFAULT 0,
  discount numeric DEFAULT 0,
  tax numeric DEFAULT 0,
  total numeric DEFAULT 0,
  paid numeric DEFAULT 0,
  due_date date,
  note text DEFAULT ''::text,
  cashier text,
  status text DEFAULT 'active'::text,
  sale_receipt_no text,
  closed_at timestamp with time zone,
  racket_model text,
  string_type text,
  tension_main numeric,
  tension_cross numeric,
  tension_unit text DEFAULT 'lb'::text,
  grommet_notes text,
  job_notes text,
  dropped_off_at timestamp with time zone,
  promised_at timestamp with time zone,
  job_status text DEFAULT 'received'::text,
  job_status_by text,
  job_status_at timestamp with time zone,
  notify_whatsapp boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (id)
);
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS ref text;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS store_id text;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS shift_id text;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS customer_name text DEFAULT ''::text;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS customer_phone text DEFAULT ''::text;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS member_id uuid;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS service_type_id text;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS service_name text;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS service_fee numeric DEFAULT 0;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS payment_timing text;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS lines jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS subtotal numeric DEFAULT 0;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS discount numeric DEFAULT 0;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS tax numeric DEFAULT 0;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS total numeric DEFAULT 0;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS paid numeric DEFAULT 0;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS due_date date;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS note text DEFAULT ''::text;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS cashier text;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS status text DEFAULT 'active'::text;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS sale_receipt_no text;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS closed_at timestamp with time zone;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS racket_model text;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS string_type text;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS tension_main numeric;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS tension_cross numeric;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS tension_unit text DEFAULT 'lb'::text;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS grommet_notes text;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS job_notes text;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS dropped_off_at timestamp with time zone;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS promised_at timestamp with time zone;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS job_status text DEFAULT 'received'::text;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS job_status_by text;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS job_status_at timestamp with time zone;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS notify_whatsapp boolean DEFAULT false;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
DO $$ BEGIN ALTER TABLE public.bookings ADD CONSTRAINT bookings_member_id_fkey FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE SET NULL; EXCEPTION WHEN others THEN NULL; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS bookings_ref_key ON public.bookings USING btree (ref);
CREATE UNIQUE INDEX IF NOT EXISTS bookings_pkey ON public.bookings USING btree (id);

CREATE TABLE IF NOT EXISTS public.cashiers (
  id uuid DEFAULT gen_random_uuid(),
  username text,
  full_name text DEFAULT ''::text,
  pin_hash text,
  store_id text,
  permissions jsonb DEFAULT '{}'::jsonb,
  is_active boolean DEFAULT true,
  last_login_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (id)
);
ALTER TABLE public.cashiers ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.cashiers ADD COLUMN IF NOT EXISTS username text;
ALTER TABLE public.cashiers ADD COLUMN IF NOT EXISTS full_name text DEFAULT ''::text;
ALTER TABLE public.cashiers ADD COLUMN IF NOT EXISTS pin_hash text;
ALTER TABLE public.cashiers ADD COLUMN IF NOT EXISTS store_id text;
ALTER TABLE public.cashiers ADD COLUMN IF NOT EXISTS permissions jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.cashiers ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE public.cashiers ADD COLUMN IF NOT EXISTS last_login_at timestamp with time zone;
ALTER TABLE public.cashiers ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
ALTER TABLE public.cashiers ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS cashiers_pkey ON public.cashiers USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS cashiers_username_key ON public.cashiers USING btree (lower(username));

CREATE TABLE IF NOT EXISTS public.coupon_campaigns (
  id uuid DEFAULT gen_random_uuid(),
  name text,
  slug text,
  discount_type text DEFAULT 'PERCENTAGE'::text,
  discount_value numeric DEFAULT 0,
  scope text DEFAULT 'BILL'::text,
  scope_value text,
  max_claims integer,
  max_per_member integer DEFAULT 1,
  claims_count integer DEFAULT 0,
  starts_at timestamp with time zone,
  expires_at timestamp with time zone,
  is_active boolean DEFAULT true,
  is_welcome boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (id)
);
ALTER TABLE public.coupon_campaigns ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.coupon_campaigns ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE public.coupon_campaigns ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE public.coupon_campaigns ADD COLUMN IF NOT EXISTS discount_type text DEFAULT 'PERCENTAGE'::text;
ALTER TABLE public.coupon_campaigns ADD COLUMN IF NOT EXISTS discount_value numeric DEFAULT 0;
ALTER TABLE public.coupon_campaigns ADD COLUMN IF NOT EXISTS scope text DEFAULT 'BILL'::text;
ALTER TABLE public.coupon_campaigns ADD COLUMN IF NOT EXISTS scope_value text;
ALTER TABLE public.coupon_campaigns ADD COLUMN IF NOT EXISTS max_claims integer;
ALTER TABLE public.coupon_campaigns ADD COLUMN IF NOT EXISTS max_per_member integer DEFAULT 1;
ALTER TABLE public.coupon_campaigns ADD COLUMN IF NOT EXISTS claims_count integer DEFAULT 0;
ALTER TABLE public.coupon_campaigns ADD COLUMN IF NOT EXISTS starts_at timestamp with time zone;
ALTER TABLE public.coupon_campaigns ADD COLUMN IF NOT EXISTS expires_at timestamp with time zone;
ALTER TABLE public.coupon_campaigns ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE public.coupon_campaigns ADD COLUMN IF NOT EXISTS is_welcome boolean DEFAULT false;
ALTER TABLE public.coupon_campaigns ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
ALTER TABLE public.coupon_campaigns ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
DO $$ BEGIN ALTER TABLE public.coupon_campaigns ADD CONSTRAINT coupon_campaigns_slug_key UNIQUE (slug); EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.coupon_campaigns ADD CONSTRAINT coupon_campaigns_discount_type_check CHECK ((discount_type = ANY (ARRAY['PERCENTAGE'::text, 'FIXED_AMOUNT'::text]))); EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.coupon_campaigns ADD CONSTRAINT coupon_campaigns_scope_check CHECK ((scope = ANY (ARRAY['BILL'::text, 'CATEGORY'::text, 'PRODUCT'::text]))); EXCEPTION WHEN others THEN NULL; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS coupon_campaigns_slug_key ON public.coupon_campaigns USING btree (slug);
CREATE UNIQUE INDEX IF NOT EXISTS coupon_campaigns_pkey ON public.coupon_campaigns USING btree (id);

CREATE TABLE IF NOT EXISTS public.coupon_events (
  id uuid DEFAULT gen_random_uuid(),
  event_type text,
  campaign_id uuid,
  campaign_name text,
  voucher_token text,
  member_id uuid,
  member_phone text,
  store_id text,
  terminal_id text,
  staff_name text,
  staff_role text,
  sale_id text,
  note text,
  created_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (id)
);
ALTER TABLE public.coupon_events ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.coupon_events ADD COLUMN IF NOT EXISTS event_type text;
ALTER TABLE public.coupon_events ADD COLUMN IF NOT EXISTS campaign_id uuid;
ALTER TABLE public.coupon_events ADD COLUMN IF NOT EXISTS campaign_name text;
ALTER TABLE public.coupon_events ADD COLUMN IF NOT EXISTS voucher_token text;
ALTER TABLE public.coupon_events ADD COLUMN IF NOT EXISTS member_id uuid;
ALTER TABLE public.coupon_events ADD COLUMN IF NOT EXISTS member_phone text;
ALTER TABLE public.coupon_events ADD COLUMN IF NOT EXISTS store_id text;
ALTER TABLE public.coupon_events ADD COLUMN IF NOT EXISTS terminal_id text;
ALTER TABLE public.coupon_events ADD COLUMN IF NOT EXISTS staff_name text;
ALTER TABLE public.coupon_events ADD COLUMN IF NOT EXISTS staff_role text;
ALTER TABLE public.coupon_events ADD COLUMN IF NOT EXISTS sale_id text;
ALTER TABLE public.coupon_events ADD COLUMN IF NOT EXISTS note text;
ALTER TABLE public.coupon_events ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
DO $$ BEGIN ALTER TABLE public.coupon_events ADD CONSTRAINT coupon_events_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES coupon_campaigns(id) ON DELETE CASCADE; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.coupon_events ADD CONSTRAINT coupon_events_member_id_fkey FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE SET NULL; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.coupon_events ADD CONSTRAINT coupon_events_event_type_check CHECK ((event_type = ANY (ARRAY['CLAIMED'::text, 'ISSUED_MANUAL'::text, 'REDEEMED'::text, 'BLOCKED'::text, 'DISABLED'::text, 'REENABLED'::text]))); EXCEPTION WHEN others THEN NULL; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS coupon_events_pkey ON public.coupon_events USING btree (id);
CREATE INDEX IF NOT EXISTS coupon_events_created_idx ON public.coupon_events USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS coupon_events_campaign_idx ON public.coupon_events USING btree (campaign_id);

CREATE TABLE IF NOT EXISTS public.drawer_events (
  id uuid DEFAULT gen_random_uuid(),
  store_id text,
  terminal_id text,
  shift_id text,
  staff_id text,
  staff_name text,
  role text,
  reason text,
  note text,
  approved_by text,
  created_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (id)
);
ALTER TABLE public.drawer_events ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.drawer_events ADD COLUMN IF NOT EXISTS store_id text;
ALTER TABLE public.drawer_events ADD COLUMN IF NOT EXISTS terminal_id text;
ALTER TABLE public.drawer_events ADD COLUMN IF NOT EXISTS shift_id text;
ALTER TABLE public.drawer_events ADD COLUMN IF NOT EXISTS staff_id text;
ALTER TABLE public.drawer_events ADD COLUMN IF NOT EXISTS staff_name text;
ALTER TABLE public.drawer_events ADD COLUMN IF NOT EXISTS role text;
ALTER TABLE public.drawer_events ADD COLUMN IF NOT EXISTS reason text;
ALTER TABLE public.drawer_events ADD COLUMN IF NOT EXISTS note text;
ALTER TABLE public.drawer_events ADD COLUMN IF NOT EXISTS approved_by text;
ALTER TABLE public.drawer_events ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS drawer_events_pkey ON public.drawer_events USING btree (id);

CREATE TABLE IF NOT EXISTS public.held_orders (
  id uuid DEFAULT gen_random_uuid(),
  label text DEFAULT ''::text,
  store_id text,
  shift_id text,
  held_by text,
  total numeric DEFAULT 0,
  lines jsonb DEFAULT '[]'::jsonb,
  cart_discount numeric DEFAULT 0,
  cart_discount_type text DEFAULT 'amount'::text,
  exchange_ref text,
  member_id uuid,
  member_name text,
  coupon jsonb,
  note text DEFAULT ''::text,
  cancelled_from text,
  held_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (id)
);
ALTER TABLE public.held_orders ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.held_orders ADD COLUMN IF NOT EXISTS label text DEFAULT ''::text;
ALTER TABLE public.held_orders ADD COLUMN IF NOT EXISTS store_id text;
ALTER TABLE public.held_orders ADD COLUMN IF NOT EXISTS shift_id text;
ALTER TABLE public.held_orders ADD COLUMN IF NOT EXISTS held_by text;
ALTER TABLE public.held_orders ADD COLUMN IF NOT EXISTS total numeric DEFAULT 0;
ALTER TABLE public.held_orders ADD COLUMN IF NOT EXISTS lines jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.held_orders ADD COLUMN IF NOT EXISTS cart_discount numeric DEFAULT 0;
ALTER TABLE public.held_orders ADD COLUMN IF NOT EXISTS cart_discount_type text DEFAULT 'amount'::text;
ALTER TABLE public.held_orders ADD COLUMN IF NOT EXISTS exchange_ref text;
ALTER TABLE public.held_orders ADD COLUMN IF NOT EXISTS member_id uuid;
ALTER TABLE public.held_orders ADD COLUMN IF NOT EXISTS member_name text;
ALTER TABLE public.held_orders ADD COLUMN IF NOT EXISTS coupon jsonb;
ALTER TABLE public.held_orders ADD COLUMN IF NOT EXISTS note text DEFAULT ''::text;
ALTER TABLE public.held_orders ADD COLUMN IF NOT EXISTS cancelled_from text;
ALTER TABLE public.held_orders ADD COLUMN IF NOT EXISTS held_at timestamp with time zone DEFAULT now();
ALTER TABLE public.held_orders ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
ALTER TABLE public.held_orders ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS held_orders_pkey ON public.held_orders USING btree (id);

CREATE TABLE IF NOT EXISTS public.issued_vouchers (
  id uuid DEFAULT gen_random_uuid(),
  token_slug text,
  campaign_id uuid,
  member_id uuid,
  status text DEFAULT 'ISSUED'::text,
  issued_at timestamp with time zone DEFAULT now(),
  expires_at timestamp with time zone,
  issued_by text,
  issued_source text DEFAULT 'PUBLIC'::text,
  redeemed_at timestamp with time zone,
  redeemed_by text,
  redeemed_sale_id text,
  disabled_at timestamp with time zone,
  disabled_by text,
  disable_reason text,
  store_id text,
  PRIMARY KEY (id)
);
ALTER TABLE public.issued_vouchers ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.issued_vouchers ADD COLUMN IF NOT EXISTS token_slug text;
ALTER TABLE public.issued_vouchers ADD COLUMN IF NOT EXISTS campaign_id uuid;
ALTER TABLE public.issued_vouchers ADD COLUMN IF NOT EXISTS member_id uuid;
ALTER TABLE public.issued_vouchers ADD COLUMN IF NOT EXISTS status text DEFAULT 'ISSUED'::text;
ALTER TABLE public.issued_vouchers ADD COLUMN IF NOT EXISTS issued_at timestamp with time zone DEFAULT now();
ALTER TABLE public.issued_vouchers ADD COLUMN IF NOT EXISTS expires_at timestamp with time zone;
ALTER TABLE public.issued_vouchers ADD COLUMN IF NOT EXISTS issued_by text;
ALTER TABLE public.issued_vouchers ADD COLUMN IF NOT EXISTS issued_source text DEFAULT 'PUBLIC'::text;
ALTER TABLE public.issued_vouchers ADD COLUMN IF NOT EXISTS redeemed_at timestamp with time zone;
ALTER TABLE public.issued_vouchers ADD COLUMN IF NOT EXISTS redeemed_by text;
ALTER TABLE public.issued_vouchers ADD COLUMN IF NOT EXISTS redeemed_sale_id text;
ALTER TABLE public.issued_vouchers ADD COLUMN IF NOT EXISTS disabled_at timestamp with time zone;
ALTER TABLE public.issued_vouchers ADD COLUMN IF NOT EXISTS disabled_by text;
ALTER TABLE public.issued_vouchers ADD COLUMN IF NOT EXISTS disable_reason text;
ALTER TABLE public.issued_vouchers ADD COLUMN IF NOT EXISTS store_id text;
DO $$ BEGIN ALTER TABLE public.issued_vouchers ADD CONSTRAINT issued_vouchers_token_slug_key UNIQUE (token_slug); EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.issued_vouchers ADD CONSTRAINT issued_vouchers_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES coupon_campaigns(id) ON DELETE CASCADE; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.issued_vouchers ADD CONSTRAINT issued_vouchers_member_id_fkey FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE SET NULL; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.issued_vouchers ADD CONSTRAINT issued_vouchers_status_check CHECK ((status = ANY (ARRAY['ISSUED'::text, 'REDEEMED'::text, 'EXPIRED'::text, 'DISABLED'::text]))); EXCEPTION WHEN others THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS issued_vouchers_campaign_member_idx ON public.issued_vouchers USING btree (campaign_id, member_id);
CREATE INDEX IF NOT EXISTS issued_vouchers_member_idx ON public.issued_vouchers USING btree (member_id);
CREATE UNIQUE INDEX IF NOT EXISTS issued_vouchers_token_slug_key ON public.issued_vouchers USING btree (token_slug);
CREATE UNIQUE INDEX IF NOT EXISTS issued_vouchers_pkey ON public.issued_vouchers USING btree (id);

CREATE TABLE IF NOT EXISTS public.members (
  id uuid DEFAULT gen_random_uuid(),
  member_code text,
  full_name text,
  phone text,
  email text,
  address text,
  date_of_birth date,
  tier_id uuid,
  loyalty_points numeric DEFAULT 0,
  total_spent numeric DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (id)
);
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS member_code text;
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS full_name text;
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS date_of_birth date;
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS tier_id uuid;
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS loyalty_points numeric DEFAULT 0;
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS total_spent numeric DEFAULT 0;
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
DO $$ BEGIN ALTER TABLE public.members ADD CONSTRAINT members_member_code_key UNIQUE (member_code); EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.members ADD CONSTRAINT members_phone_key UNIQUE (phone); EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.members ADD CONSTRAINT members_tier_id_fkey FOREIGN KEY (tier_id) REFERENCES membership_tiers(id) ON DELETE SET NULL; EXCEPTION WHEN others THEN NULL; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS members_member_code_key ON public.members USING btree (member_code);
CREATE UNIQUE INDEX IF NOT EXISTS members_pkey ON public.members USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS members_phone_key ON public.members USING btree (phone);

CREATE TABLE IF NOT EXISTS public.membership_tiers (
  id uuid DEFAULT gen_random_uuid(),
  name text,
  discount_percentage numeric DEFAULT 0,
  points_multiplier numeric DEFAULT 1.0,
  created_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (id)
);
ALTER TABLE public.membership_tiers ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.membership_tiers ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE public.membership_tiers ADD COLUMN IF NOT EXISTS discount_percentage numeric DEFAULT 0;
ALTER TABLE public.membership_tiers ADD COLUMN IF NOT EXISTS points_multiplier numeric DEFAULT 1.0;
ALTER TABLE public.membership_tiers ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
DO $$ BEGIN ALTER TABLE public.membership_tiers ADD CONSTRAINT membership_tiers_name_key UNIQUE (name); EXCEPTION WHEN others THEN NULL; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS membership_tiers_name_key ON public.membership_tiers USING btree (name);
CREATE UNIQUE INDEX IF NOT EXISTS membership_tiers_pkey ON public.membership_tiers USING btree (id);

CREATE TABLE IF NOT EXISTS public.pos_settings (
  id integer DEFAULT 1,
  tax_percentage numeric DEFAULT 0,
  enable_tax boolean DEFAULT true,
  tax_mode text DEFAULT 'exclusive'::text,
  paper_size text DEFAULT '80mm'::text,
  header_text text,
  footer_text text,
  show_logo boolean DEFAULT true,
  show_points boolean DEFAULT true,
  show_barcode boolean DEFAULT true,
  show_tax_details boolean DEFAULT true,
  updated_at timestamp with time zone DEFAULT now(),
  company_name text DEFAULT 'NORTHWIND & CO.'::text,
  tax_number text,
  reg_number text,
  phone text,
  website text,
  fonts jsonb DEFAULT '{}'::jsonb,
  custom_lines jsonb DEFAULT '[]'::jsonb,
  qr jsonb DEFAULT '{}'::jsonb,
  review_max_voids integer DEFAULT 5,
  review_max_refunds integer DEFAULT 3,
  review_max_refund_value numeric DEFAULT 200,
  review_max_nosale integer DEFAULT 5,
  review_max_discount_pct numeric DEFAULT 15,
  day_start_time text DEFAULT '09:00'::text,
  day_end_time text DEFAULT '22:00'::text,
  max_shift_hours numeric DEFAULT 12,
  shift_reminder_minutes integer DEFAULT 30,
  ui_visibility jsonb DEFAULT '{"hidden": {}}'::jsonb,
  integration_settings jsonb DEFAULT '{}'::jsonb,
  region_country text DEFAULT ''::text,
  time_zone text DEFAULT ''::text,
  date_format text DEFAULT 'dd/MM/yyyy'::text,
  time_format text DEFAULT '24h'::text,
  booking_slip jsonb DEFAULT '{}'::jsonb,
  PRIMARY KEY (id)
);
ALTER TABLE public.pos_settings ADD COLUMN IF NOT EXISTS id integer DEFAULT 1;
ALTER TABLE public.pos_settings ADD COLUMN IF NOT EXISTS tax_percentage numeric DEFAULT 0;
ALTER TABLE public.pos_settings ADD COLUMN IF NOT EXISTS enable_tax boolean DEFAULT true;
ALTER TABLE public.pos_settings ADD COLUMN IF NOT EXISTS tax_mode text DEFAULT 'exclusive'::text;
ALTER TABLE public.pos_settings ADD COLUMN IF NOT EXISTS paper_size text DEFAULT '80mm'::text;
ALTER TABLE public.pos_settings ADD COLUMN IF NOT EXISTS header_text text;
ALTER TABLE public.pos_settings ADD COLUMN IF NOT EXISTS footer_text text;
ALTER TABLE public.pos_settings ADD COLUMN IF NOT EXISTS show_logo boolean DEFAULT true;
ALTER TABLE public.pos_settings ADD COLUMN IF NOT EXISTS show_points boolean DEFAULT true;
ALTER TABLE public.pos_settings ADD COLUMN IF NOT EXISTS show_barcode boolean DEFAULT true;
ALTER TABLE public.pos_settings ADD COLUMN IF NOT EXISTS show_tax_details boolean DEFAULT true;
ALTER TABLE public.pos_settings ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
ALTER TABLE public.pos_settings ADD COLUMN IF NOT EXISTS company_name text DEFAULT 'NORTHWIND & CO.'::text;
ALTER TABLE public.pos_settings ADD COLUMN IF NOT EXISTS tax_number text;
ALTER TABLE public.pos_settings ADD COLUMN IF NOT EXISTS reg_number text;
ALTER TABLE public.pos_settings ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.pos_settings ADD COLUMN IF NOT EXISTS website text;
ALTER TABLE public.pos_settings ADD COLUMN IF NOT EXISTS fonts jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.pos_settings ADD COLUMN IF NOT EXISTS custom_lines jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.pos_settings ADD COLUMN IF NOT EXISTS qr jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.pos_settings ADD COLUMN IF NOT EXISTS review_max_voids integer DEFAULT 5;
ALTER TABLE public.pos_settings ADD COLUMN IF NOT EXISTS review_max_refunds integer DEFAULT 3;
ALTER TABLE public.pos_settings ADD COLUMN IF NOT EXISTS review_max_refund_value numeric DEFAULT 200;
ALTER TABLE public.pos_settings ADD COLUMN IF NOT EXISTS review_max_nosale integer DEFAULT 5;
ALTER TABLE public.pos_settings ADD COLUMN IF NOT EXISTS review_max_discount_pct numeric DEFAULT 15;
ALTER TABLE public.pos_settings ADD COLUMN IF NOT EXISTS day_start_time text DEFAULT '09:00'::text;
ALTER TABLE public.pos_settings ADD COLUMN IF NOT EXISTS day_end_time text DEFAULT '22:00'::text;
ALTER TABLE public.pos_settings ADD COLUMN IF NOT EXISTS max_shift_hours numeric DEFAULT 12;
ALTER TABLE public.pos_settings ADD COLUMN IF NOT EXISTS shift_reminder_minutes integer DEFAULT 30;
ALTER TABLE public.pos_settings ADD COLUMN IF NOT EXISTS ui_visibility jsonb DEFAULT '{"hidden": {}}'::jsonb;
ALTER TABLE public.pos_settings ADD COLUMN IF NOT EXISTS integration_settings jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.pos_settings ADD COLUMN IF NOT EXISTS region_country text DEFAULT ''::text;
ALTER TABLE public.pos_settings ADD COLUMN IF NOT EXISTS time_zone text DEFAULT ''::text;
ALTER TABLE public.pos_settings ADD COLUMN IF NOT EXISTS date_format text DEFAULT 'dd/MM/yyyy'::text;
ALTER TABLE public.pos_settings ADD COLUMN IF NOT EXISTS time_format text DEFAULT '24h'::text;
ALTER TABLE public.pos_settings ADD COLUMN IF NOT EXISTS booking_slip jsonb DEFAULT '{}'::jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS pos_settings_pkey ON public.pos_settings USING btree (id);

CREATE TABLE IF NOT EXISTS public.product_categories (
  id uuid DEFAULT gen_random_uuid(),
  name text,
  parent_id uuid,
  sort integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (id)
);
ALTER TABLE public.product_categories ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.product_categories ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE public.product_categories ADD COLUMN IF NOT EXISTS parent_id uuid;
ALTER TABLE public.product_categories ADD COLUMN IF NOT EXISTS sort integer DEFAULT 0;
ALTER TABLE public.product_categories ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
ALTER TABLE public.product_categories ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
DO $$ BEGIN ALTER TABLE public.product_categories ADD CONSTRAINT product_categories_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES product_categories(id) ON DELETE CASCADE; EXCEPTION WHEN others THEN NULL; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS product_categories_pkey ON public.product_categories USING btree (id);

CREATE TABLE IF NOT EXISTS public.products (
  id uuid DEFAULT gen_random_uuid(),
  barcode text,
  name text,
  category text,
  cost_price numeric DEFAULT 0,
  selling_price numeric DEFAULT 0,
  ecom_price numeric,
  stock_quantity integer DEFAULT 0,
  custom_points numeric,
  point_multiplier numeric DEFAULT 1.0,
  created_at timestamp with time zone DEFAULT now(),
  sku text,
  reorder_level integer DEFAULT 0,
  tax_rate numeric DEFAULT 0,
  ecom_visible boolean DEFAULT true,
  stock_by_store jsonb DEFAULT '{}'::jsonb,
  updated_at timestamp with time zone DEFAULT now(),
  landing_pct numeric,
  sub_category text,
  unit text,
  packs jsonb DEFAULT '[]'::jsonb,
  barcode_aliases text[] DEFAULT '{}'::text[],
  PRIMARY KEY (id)
);
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS barcode text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS cost_price numeric DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS selling_price numeric DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS ecom_price numeric;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS stock_quantity integer DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS custom_points numeric;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS point_multiplier numeric DEFAULT 1.0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS sku text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS reorder_level integer DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS tax_rate numeric DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS ecom_visible boolean DEFAULT true;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS stock_by_store jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS landing_pct numeric;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS sub_category text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS unit text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS packs jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS barcode_aliases text[] DEFAULT '{}'::text[];
DO $$ BEGIN ALTER TABLE public.products ADD CONSTRAINT products_barcode_key UNIQUE (barcode); EXCEPTION WHEN others THEN NULL; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS products_pkey ON public.products USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS products_sku_unique_idx ON public.products USING btree (lower(sku)) WHERE ((sku IS NOT NULL) AND (sku <> ''::text));
CREATE UNIQUE INDEX IF NOT EXISTS products_barcode_key ON public.products USING btree (barcode);

CREATE TABLE IF NOT EXISTS public.promotions (
  id uuid DEFAULT gen_random_uuid(),
  title text,
  promo_type text,
  min_spend numeric DEFAULT 0,
  discount_percent numeric DEFAULT 0,
  discount_amount numeric DEFAULT 0,
  foc_product_id uuid,
  points_per_dollar numeric DEFAULT 1,
  tier_rates jsonb,
  is_active boolean DEFAULT true,
  start_date date,
  end_date date,
  created_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (id)
);
ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS promo_type text;
ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS min_spend numeric DEFAULT 0;
ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS discount_percent numeric DEFAULT 0;
ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS discount_amount numeric DEFAULT 0;
ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS foc_product_id uuid;
ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS points_per_dollar numeric DEFAULT 1;
ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS tier_rates jsonb;
ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS start_date date;
ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS end_date date;
ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
DO $$ BEGIN ALTER TABLE public.promotions ADD CONSTRAINT promotions_foc_product_id_fkey FOREIGN KEY (foc_product_id) REFERENCES products(id) ON DELETE SET NULL; EXCEPTION WHEN others THEN NULL; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS promotions_pkey ON public.promotions USING btree (id);

CREATE TABLE IF NOT EXISTS public.purchase_order_items (
  id uuid DEFAULT gen_random_uuid(),
  po_id uuid,
  product_id uuid,
  barcode text,
  product_name text,
  cost_price numeric DEFAULT 0,
  selling_price numeric DEFAULT 0,
  quantity_received integer DEFAULT 0,
  subtotal_cost numeric DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (id)
);
ALTER TABLE public.purchase_order_items ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.purchase_order_items ADD COLUMN IF NOT EXISTS po_id uuid;
ALTER TABLE public.purchase_order_items ADD COLUMN IF NOT EXISTS product_id uuid;
ALTER TABLE public.purchase_order_items ADD COLUMN IF NOT EXISTS barcode text;
ALTER TABLE public.purchase_order_items ADD COLUMN IF NOT EXISTS product_name text;
ALTER TABLE public.purchase_order_items ADD COLUMN IF NOT EXISTS cost_price numeric DEFAULT 0;
ALTER TABLE public.purchase_order_items ADD COLUMN IF NOT EXISTS selling_price numeric DEFAULT 0;
ALTER TABLE public.purchase_order_items ADD COLUMN IF NOT EXISTS quantity_received integer DEFAULT 0;
ALTER TABLE public.purchase_order_items ADD COLUMN IF NOT EXISTS subtotal_cost numeric DEFAULT 0;
ALTER TABLE public.purchase_order_items ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
DO $$ BEGIN ALTER TABLE public.purchase_order_items ADD CONSTRAINT purchase_order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.purchase_order_items ADD CONSTRAINT purchase_order_items_po_id_fkey FOREIGN KEY (po_id) REFERENCES purchase_orders(id) ON DELETE CASCADE; EXCEPTION WHEN others THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_po_items_po_id ON public.purchase_order_items USING btree (po_id);
CREATE UNIQUE INDEX IF NOT EXISTS purchase_order_items_pkey ON public.purchase_order_items USING btree (id);

CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id uuid DEFAULT gen_random_uuid(),
  po_number text,
  supplier_name text,
  operator_name text,
  total_cost numeric DEFAULT 0,
  total_items_count integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  supplier_id uuid,
  PRIMARY KEY (id)
);
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS po_number text;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS supplier_name text;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS operator_name text;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS total_cost numeric DEFAULT 0;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS total_items_count integer DEFAULT 0;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS supplier_id uuid;
DO $$ BEGIN ALTER TABLE public.purchase_orders ADD CONSTRAINT purchase_orders_po_number_key UNIQUE (po_number); EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.purchase_orders ADD CONSTRAINT purchase_orders_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES suppliers(id); EXCEPTION WHEN others THEN NULL; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS purchase_orders_pkey ON public.purchase_orders USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS purchase_orders_po_number_key ON public.purchase_orders USING btree (po_number);

CREATE TABLE IF NOT EXISTS public.sale_items (
  id uuid DEFAULT gen_random_uuid(),
  sale_id uuid,
  product_id uuid,
  product_name text,
  unit_price numeric DEFAULT 0,
  quantity integer DEFAULT 1,
  discount_percent numeric DEFAULT 0,
  discount_amount numeric DEFAULT 0,
  is_return boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  tax_rate numeric DEFAULT 0,
  is_foc boolean DEFAULT false,
  promo_id text,
  coupon_code text,
  coupon_discount numeric DEFAULT 0,
  unit_cost numeric DEFAULT 0,
  PRIMARY KEY (id)
);
ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS sale_id uuid;
ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS product_id uuid;
ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS product_name text;
ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS unit_price numeric DEFAULT 0;
ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS quantity integer DEFAULT 1;
ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS discount_percent numeric DEFAULT 0;
ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS discount_amount numeric DEFAULT 0;
ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS is_return boolean DEFAULT false;
ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS tax_rate numeric DEFAULT 0;
ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS is_foc boolean DEFAULT false;
ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS promo_id text;
ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS coupon_code text;
ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS coupon_discount numeric DEFAULT 0;
ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS unit_cost numeric DEFAULT 0;
DO $$ BEGIN ALTER TABLE public.sale_items ADD CONSTRAINT sale_items_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.sale_items ADD CONSTRAINT sale_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL; EXCEPTION WHEN others THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON public.sale_items USING btree (sale_id);
CREATE UNIQUE INDEX IF NOT EXISTS sale_items_pkey ON public.sale_items USING btree (id);

CREATE TABLE IF NOT EXISTS public.sales (
  id uuid DEFAULT gen_random_uuid(),
  bill_number text,
  member_id uuid,
  store_id text,
  cashier_name text,
  subtotal_amount numeric DEFAULT 0,
  total_amount numeric DEFAULT 0,
  discount_amount numeric DEFAULT 0,
  tax_amount numeric DEFAULT 0,
  payment_type text DEFAULT 'cash'::text,
  points_earned numeric DEFAULT 0,
  points_redeemed numeric DEFAULT 0,
  is_exchange boolean DEFAULT false,
  original_bill_number text,
  is_refunded boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  shift_id text,
  paid_amount numeric DEFAULT 0,
  change_amount numeric DEFAULT 0,
  exchange_credit numeric DEFAULT 0,
  exchanged_to_bill_number text,
  coupon_code text,
  coupon_promo_id text,
  coupon_scope text,
  coupon_discount numeric DEFAULT 0,
  payments jsonb DEFAULT '[]'::jsonb,
  PRIMARY KEY (id)
);
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS bill_number text;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS member_id uuid;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS store_id text;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS cashier_name text;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS subtotal_amount numeric DEFAULT 0;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS total_amount numeric DEFAULT 0;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS discount_amount numeric DEFAULT 0;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS tax_amount numeric DEFAULT 0;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS payment_type text DEFAULT 'cash'::text;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS points_earned numeric DEFAULT 0;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS points_redeemed numeric DEFAULT 0;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS is_exchange boolean DEFAULT false;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS original_bill_number text;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS is_refunded boolean DEFAULT false;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS shift_id text;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS paid_amount numeric DEFAULT 0;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS change_amount numeric DEFAULT 0;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS exchange_credit numeric DEFAULT 0;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS exchanged_to_bill_number text;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS coupon_code text;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS coupon_promo_id text;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS coupon_scope text;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS coupon_discount numeric DEFAULT 0;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS payments jsonb DEFAULT '[]'::jsonb;
DO $$ BEGIN ALTER TABLE public.sales ADD CONSTRAINT sales_bill_number_key UNIQUE (bill_number); EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.sales ADD CONSTRAINT sales_member_id_fkey FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE SET NULL; EXCEPTION WHEN others THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_sales_created_at ON public.sales USING btree (created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS sales_pkey ON public.sales USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS sales_bill_number_key ON public.sales USING btree (bill_number);
CREATE INDEX IF NOT EXISTS idx_sales_member_id ON public.sales USING btree (member_id);

CREATE TABLE IF NOT EXISTS public.secure_settings (
  key text,
  ciphertext text,
  hint text,
  updated_by text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (key)
);
ALTER TABLE public.secure_settings ADD COLUMN IF NOT EXISTS key text;
ALTER TABLE public.secure_settings ADD COLUMN IF NOT EXISTS ciphertext text;
ALTER TABLE public.secure_settings ADD COLUMN IF NOT EXISTS hint text;
ALTER TABLE public.secure_settings ADD COLUMN IF NOT EXISTS updated_by text;
ALTER TABLE public.secure_settings ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
ALTER TABLE public.secure_settings ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS secure_settings_pkey ON public.secure_settings USING btree (key);

CREATE TABLE IF NOT EXISTS public.shift_sessions (
  id uuid DEFAULT gen_random_uuid(),
  shift_id text,
  store_id text,
  terminal_id text,
  terminal_name text,
  staff_id text,
  staff_name text,
  role text,
  signed_in_at timestamp with time zone DEFAULT now(),
  signed_out_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (id)
);
ALTER TABLE public.shift_sessions ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.shift_sessions ADD COLUMN IF NOT EXISTS shift_id text;
ALTER TABLE public.shift_sessions ADD COLUMN IF NOT EXISTS store_id text;
ALTER TABLE public.shift_sessions ADD COLUMN IF NOT EXISTS terminal_id text;
ALTER TABLE public.shift_sessions ADD COLUMN IF NOT EXISTS terminal_name text;
ALTER TABLE public.shift_sessions ADD COLUMN IF NOT EXISTS staff_id text;
ALTER TABLE public.shift_sessions ADD COLUMN IF NOT EXISTS staff_name text;
ALTER TABLE public.shift_sessions ADD COLUMN IF NOT EXISTS role text;
ALTER TABLE public.shift_sessions ADD COLUMN IF NOT EXISTS signed_in_at timestamp with time zone DEFAULT now();
ALTER TABLE public.shift_sessions ADD COLUMN IF NOT EXISTS signed_out_at timestamp with time zone;
ALTER TABLE public.shift_sessions ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
ALTER TABLE public.shift_sessions ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS shift_sessions_pkey ON public.shift_sessions USING btree (id);
CREATE INDEX IF NOT EXISTS shift_sessions_shift_idx ON public.shift_sessions USING btree (shift_id);
CREATE INDEX IF NOT EXISTS shift_sessions_store_idx ON public.shift_sessions USING btree (store_id, signed_in_at DESC);

CREATE TABLE IF NOT EXISTS public.shifts (
  id uuid DEFAULT gen_random_uuid(),
  store_id text,
  terminal_id text,
  terminal_name text,
  opened_by_name text DEFAULT 'Cashier'::text,
  opened_by_staff_id text,
  opened_by_role text,
  closed_by_name text,
  closed_by_staff_id text,
  closed_by_role text,
  opened_at timestamp with time zone DEFAULT now(),
  closed_at timestamp with time zone,
  opening_float numeric DEFAULT 0,
  counted_cash numeric,
  expected_cash numeric,
  note text DEFAULT ''::text,
  overdue boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  status text DEFAULT 'OPEN'::text,
  closing_float numeric,
  user_id uuid,
  PRIMARY KEY (id)
);
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS store_id text;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS terminal_id text;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS terminal_name text;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS opened_by_name text DEFAULT 'Cashier'::text;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS opened_by_staff_id text;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS opened_by_role text;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS closed_by_name text;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS closed_by_staff_id text;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS closed_by_role text;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS opened_at timestamp with time zone DEFAULT now();
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS closed_at timestamp with time zone;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS opening_float numeric DEFAULT 0;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS counted_cash numeric;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS expected_cash numeric;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS note text DEFAULT ''::text;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS overdue boolean DEFAULT false;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS status text DEFAULT 'OPEN'::text;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS closing_float numeric;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS user_id uuid;
DO $$ BEGIN ALTER TABLE public.shifts ADD CONSTRAINT shifts_status_check CHECK ((status = ANY (ARRAY['OPEN'::text, 'CLOSED'::text]))); EXCEPTION WHEN others THEN NULL; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS shifts_pkey ON public.shifts USING btree (id);
CREATE INDEX IF NOT EXISTS shifts_open_by_store_idx ON public.shifts USING btree (store_id, opened_at DESC) WHERE (status = 'OPEN'::text);
CREATE INDEX IF NOT EXISTS shifts_open_by_store ON public.shifts USING btree (store_id) WHERE (closed_at IS NULL);

CREATE TABLE IF NOT EXISTS public.sku_audit (
  id uuid DEFAULT gen_random_uuid(),
  sku text,
  product_id uuid,
  product_name text,
  source text DEFAULT 'auto'::text,
  previous_sku text,
  store_id text,
  store_name text,
  terminal_id text,
  staff_id text,
  staff_name text,
  role text,
  created_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (id)
);
ALTER TABLE public.sku_audit ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.sku_audit ADD COLUMN IF NOT EXISTS sku text;
ALTER TABLE public.sku_audit ADD COLUMN IF NOT EXISTS product_id uuid;
ALTER TABLE public.sku_audit ADD COLUMN IF NOT EXISTS product_name text;
ALTER TABLE public.sku_audit ADD COLUMN IF NOT EXISTS source text DEFAULT 'auto'::text;
ALTER TABLE public.sku_audit ADD COLUMN IF NOT EXISTS previous_sku text;
ALTER TABLE public.sku_audit ADD COLUMN IF NOT EXISTS store_id text;
ALTER TABLE public.sku_audit ADD COLUMN IF NOT EXISTS store_name text;
ALTER TABLE public.sku_audit ADD COLUMN IF NOT EXISTS terminal_id text;
ALTER TABLE public.sku_audit ADD COLUMN IF NOT EXISTS staff_id text;
ALTER TABLE public.sku_audit ADD COLUMN IF NOT EXISTS staff_name text;
ALTER TABLE public.sku_audit ADD COLUMN IF NOT EXISTS role text;
ALTER TABLE public.sku_audit ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
CREATE INDEX IF NOT EXISTS sku_audit_created_idx ON public.sku_audit USING btree (created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS sku_audit_pkey ON public.sku_audit USING btree (id);

CREATE TABLE IF NOT EXISTS public.stock_adjustments (
  id uuid DEFAULT gen_random_uuid(),
  product_id uuid,
  product_name text,
  sku text,
  barcode text,
  store_id text,
  terminal_id text,
  reason text DEFAULT 'manual'::text,
  note text DEFAULT ''::text,
  previous_stock integer DEFAULT 0,
  updated_stock integer DEFAULT 0,
  delta integer DEFAULT 0,
  cost_impact numeric DEFAULT 0,
  staff_id text,
  staff_name text,
  role text,
  created_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (id)
);
ALTER TABLE public.stock_adjustments ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.stock_adjustments ADD COLUMN IF NOT EXISTS product_id uuid;
ALTER TABLE public.stock_adjustments ADD COLUMN IF NOT EXISTS product_name text;
ALTER TABLE public.stock_adjustments ADD COLUMN IF NOT EXISTS sku text;
ALTER TABLE public.stock_adjustments ADD COLUMN IF NOT EXISTS barcode text;
ALTER TABLE public.stock_adjustments ADD COLUMN IF NOT EXISTS store_id text;
ALTER TABLE public.stock_adjustments ADD COLUMN IF NOT EXISTS terminal_id text;
ALTER TABLE public.stock_adjustments ADD COLUMN IF NOT EXISTS reason text DEFAULT 'manual'::text;
ALTER TABLE public.stock_adjustments ADD COLUMN IF NOT EXISTS note text DEFAULT ''::text;
ALTER TABLE public.stock_adjustments ADD COLUMN IF NOT EXISTS previous_stock integer DEFAULT 0;
ALTER TABLE public.stock_adjustments ADD COLUMN IF NOT EXISTS updated_stock integer DEFAULT 0;
ALTER TABLE public.stock_adjustments ADD COLUMN IF NOT EXISTS delta integer DEFAULT 0;
ALTER TABLE public.stock_adjustments ADD COLUMN IF NOT EXISTS cost_impact numeric DEFAULT 0;
ALTER TABLE public.stock_adjustments ADD COLUMN IF NOT EXISTS staff_id text;
ALTER TABLE public.stock_adjustments ADD COLUMN IF NOT EXISTS staff_name text;
ALTER TABLE public.stock_adjustments ADD COLUMN IF NOT EXISTS role text;
ALTER TABLE public.stock_adjustments ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
DO $$ BEGIN ALTER TABLE public.stock_adjustments ADD CONSTRAINT stock_adjustments_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL; EXCEPTION WHEN others THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS stock_adjustments_created_idx ON public.stock_adjustments USING btree (created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS stock_adjustments_pkey ON public.stock_adjustments USING btree (id);

CREATE TABLE IF NOT EXISTS public.stock_transfer_items (
  id uuid DEFAULT gen_random_uuid(),
  transfer_id uuid,
  product_id uuid,
  barcode text,
  sku text,
  product_name text,
  quantity integer DEFAULT 0,
  quantity_received integer DEFAULT 0,
  unit_cost numeric DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (id)
);
ALTER TABLE public.stock_transfer_items ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.stock_transfer_items ADD COLUMN IF NOT EXISTS transfer_id uuid;
ALTER TABLE public.stock_transfer_items ADD COLUMN IF NOT EXISTS product_id uuid;
ALTER TABLE public.stock_transfer_items ADD COLUMN IF NOT EXISTS barcode text;
ALTER TABLE public.stock_transfer_items ADD COLUMN IF NOT EXISTS sku text;
ALTER TABLE public.stock_transfer_items ADD COLUMN IF NOT EXISTS product_name text;
ALTER TABLE public.stock_transfer_items ADD COLUMN IF NOT EXISTS quantity integer DEFAULT 0;
ALTER TABLE public.stock_transfer_items ADD COLUMN IF NOT EXISTS quantity_received integer DEFAULT 0;
ALTER TABLE public.stock_transfer_items ADD COLUMN IF NOT EXISTS unit_cost numeric DEFAULT 0;
ALTER TABLE public.stock_transfer_items ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
DO $$ BEGIN ALTER TABLE public.stock_transfer_items ADD CONSTRAINT stock_transfer_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.stock_transfer_items ADD CONSTRAINT stock_transfer_items_transfer_id_fkey FOREIGN KEY (transfer_id) REFERENCES stock_transfers(id) ON DELETE CASCADE; EXCEPTION WHEN others THEN NULL; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS stock_transfer_items_pkey ON public.stock_transfer_items USING btree (id);
CREATE INDEX IF NOT EXISTS stock_transfer_items_transfer_idx ON public.stock_transfer_items USING btree (transfer_id);

CREATE TABLE IF NOT EXISTS public.stock_transfers (
  id uuid DEFAULT gen_random_uuid(),
  ref text,
  kind text DEFAULT 'transfer'::text,
  transfer_scope text DEFAULT 'INTRA_GROUP'::text,
  from_store_id text,
  from_store_name text,
  from_group_id text,
  to_store_id text,
  to_store_name text,
  to_group_id text,
  status text DEFAULT 'pending'::text,
  note text DEFAULT ''::text,
  created_by text,
  approved_by text,
  approved_at timestamp with time zone,
  received_by text,
  received_at timestamp with time zone,
  rejected_reason text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (id)
);
ALTER TABLE public.stock_transfers ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.stock_transfers ADD COLUMN IF NOT EXISTS ref text;
ALTER TABLE public.stock_transfers ADD COLUMN IF NOT EXISTS kind text DEFAULT 'transfer'::text;
ALTER TABLE public.stock_transfers ADD COLUMN IF NOT EXISTS transfer_scope text DEFAULT 'INTRA_GROUP'::text;
ALTER TABLE public.stock_transfers ADD COLUMN IF NOT EXISTS from_store_id text;
ALTER TABLE public.stock_transfers ADD COLUMN IF NOT EXISTS from_store_name text;
ALTER TABLE public.stock_transfers ADD COLUMN IF NOT EXISTS from_group_id text;
ALTER TABLE public.stock_transfers ADD COLUMN IF NOT EXISTS to_store_id text;
ALTER TABLE public.stock_transfers ADD COLUMN IF NOT EXISTS to_store_name text;
ALTER TABLE public.stock_transfers ADD COLUMN IF NOT EXISTS to_group_id text;
ALTER TABLE public.stock_transfers ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending'::text;
ALTER TABLE public.stock_transfers ADD COLUMN IF NOT EXISTS note text DEFAULT ''::text;
ALTER TABLE public.stock_transfers ADD COLUMN IF NOT EXISTS created_by text;
ALTER TABLE public.stock_transfers ADD COLUMN IF NOT EXISTS approved_by text;
ALTER TABLE public.stock_transfers ADD COLUMN IF NOT EXISTS approved_at timestamp with time zone;
ALTER TABLE public.stock_transfers ADD COLUMN IF NOT EXISTS received_by text;
ALTER TABLE public.stock_transfers ADD COLUMN IF NOT EXISTS received_at timestamp with time zone;
ALTER TABLE public.stock_transfers ADD COLUMN IF NOT EXISTS rejected_reason text;
ALTER TABLE public.stock_transfers ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
ALTER TABLE public.stock_transfers ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
DO $$ BEGIN ALTER TABLE public.stock_transfers ADD CONSTRAINT stock_transfers_ref_key UNIQUE (ref); EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.stock_transfers ADD CONSTRAINT stock_transfers_transfer_scope_check CHECK ((transfer_scope = ANY (ARRAY['INTRA_GROUP'::text, 'INTER_GROUP'::text]))); EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.stock_transfers ADD CONSTRAINT stock_transfers_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'pending'::text, 'approved'::text, 'in_transit'::text, 'received'::text, 'rejected'::text, 'cancelled'::text]))); EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.stock_transfers ADD CONSTRAINT stock_transfers_kind_check CHECK ((kind = ANY (ARRAY['transfer'::text, 'request'::text]))); EXCEPTION WHEN others THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS stock_transfers_status_idx ON public.stock_transfers USING btree (status);
CREATE UNIQUE INDEX IF NOT EXISTS stock_transfers_pkey ON public.stock_transfers USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS stock_transfers_ref_key ON public.stock_transfers USING btree (ref);
CREATE INDEX IF NOT EXISTS stock_transfers_from_idx ON public.stock_transfers USING btree (from_store_id);
CREATE INDEX IF NOT EXISTS stock_transfers_to_idx ON public.stock_transfers USING btree (to_store_id);

CREATE TABLE IF NOT EXISTS public.stores (
  id text,
  code text,
  name text,
  address text,
  phone text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  group_id text,
  PRIMARY KEY (id)
);
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS id text;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS code text;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS group_id text;
CREATE UNIQUE INDEX IF NOT EXISTS stores_pkey ON public.stores USING btree (id);

CREATE TABLE IF NOT EXISTS public.suppliers (
  id uuid DEFAULT gen_random_uuid(),
  name text,
  contact_name text,
  phone text,
  email text,
  address text,
  tax_number text,
  notes text,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (id)
);
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS contact_name text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS tax_number text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS suppliers_pkey ON public.suppliers USING btree (id);

CREATE TABLE IF NOT EXISTS public.terminal_tokens (
  id uuid DEFAULT gen_random_uuid(),
  location_id text,
  location_name text,
  device_name text,
  status text DEFAULT 'active'::text,
  created_at timestamp with time zone DEFAULT now(),
  activated_at timestamp with time zone,
  revoked_at timestamp with time zone,
  last_seen_at timestamp with time zone,
  reissued_at timestamp with time zone,
  replaced_by uuid,
  claimed_by_device text,
  claimed_at timestamp with time zone,
  platform text DEFAULT 'unknown'::text,
  PRIMARY KEY (id)
);
ALTER TABLE public.terminal_tokens ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.terminal_tokens ADD COLUMN IF NOT EXISTS location_id text;
ALTER TABLE public.terminal_tokens ADD COLUMN IF NOT EXISTS location_name text;
ALTER TABLE public.terminal_tokens ADD COLUMN IF NOT EXISTS device_name text;
ALTER TABLE public.terminal_tokens ADD COLUMN IF NOT EXISTS status text DEFAULT 'active'::text;
ALTER TABLE public.terminal_tokens ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
ALTER TABLE public.terminal_tokens ADD COLUMN IF NOT EXISTS activated_at timestamp with time zone;
ALTER TABLE public.terminal_tokens ADD COLUMN IF NOT EXISTS revoked_at timestamp with time zone;
ALTER TABLE public.terminal_tokens ADD COLUMN IF NOT EXISTS last_seen_at timestamp with time zone;
ALTER TABLE public.terminal_tokens ADD COLUMN IF NOT EXISTS reissued_at timestamp with time zone;
ALTER TABLE public.terminal_tokens ADD COLUMN IF NOT EXISTS replaced_by uuid;
ALTER TABLE public.terminal_tokens ADD COLUMN IF NOT EXISTS claimed_by_device text;
ALTER TABLE public.terminal_tokens ADD COLUMN IF NOT EXISTS claimed_at timestamp with time zone;
ALTER TABLE public.terminal_tokens ADD COLUMN IF NOT EXISTS platform text DEFAULT 'unknown'::text;
DO $$ BEGIN ALTER TABLE public.terminal_tokens ADD CONSTRAINT terminal_tokens_location_id_fkey FOREIGN KEY (location_id) REFERENCES stores(id) ON DELETE SET NULL; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.terminal_tokens ADD CONSTRAINT terminal_tokens_status_check CHECK ((status = ANY (ARRAY['active'::text, 'used'::text, 'revoked'::text]))); EXCEPTION WHEN others THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS terminal_tokens_location_idx ON public.terminal_tokens USING btree (location_id);
CREATE UNIQUE INDEX IF NOT EXISTS terminal_tokens_pkey ON public.terminal_tokens USING btree (id);

CREATE TABLE IF NOT EXISTS public.uom_units (
  id uuid DEFAULT gen_random_uuid(),
  code text,
  name text,
  allow_decimal boolean DEFAULT false,
  sort integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (id)
);
ALTER TABLE public.uom_units ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.uom_units ADD COLUMN IF NOT EXISTS code text;
ALTER TABLE public.uom_units ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE public.uom_units ADD COLUMN IF NOT EXISTS allow_decimal boolean DEFAULT false;
ALTER TABLE public.uom_units ADD COLUMN IF NOT EXISTS sort integer DEFAULT 0;
ALTER TABLE public.uom_units ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
ALTER TABLE public.uom_units ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
DO $$ BEGIN ALTER TABLE public.uom_units ADD CONSTRAINT uom_units_code_key UNIQUE (code); EXCEPTION WHEN others THEN NULL; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS uom_units_code_key ON public.uom_units USING btree (code);
CREATE UNIQUE INDEX IF NOT EXISTS uom_units_pkey ON public.uom_units USING btree (id);

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid DEFAULT gen_random_uuid(),
  user_id uuid,
  role app_role,
  created_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (id)
);
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS role app_role;
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
DO $$ BEGIN ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role); EXCEPTION WHEN others THEN NULL; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS user_roles_user_id_role_key ON public.user_roles USING btree (user_id, role);
CREATE UNIQUE INDEX IF NOT EXISTS user_roles_pkey ON public.user_roles USING btree (id);

CREATE TABLE IF NOT EXISTS public.whatsapp_queue (
  id uuid DEFAULT gen_random_uuid(),
  phone_number_id text DEFAULT ''::text,
  recipient text,
  body text DEFAULT ''::text,
  reference text,
  store_id text,
  status text DEFAULT 'QUEUED'::text,
  error text,
  queued_at timestamp with time zone DEFAULT now(),
  sent_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (id)
);
ALTER TABLE public.whatsapp_queue ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.whatsapp_queue ADD COLUMN IF NOT EXISTS phone_number_id text DEFAULT ''::text;
ALTER TABLE public.whatsapp_queue ADD COLUMN IF NOT EXISTS recipient text;
ALTER TABLE public.whatsapp_queue ADD COLUMN IF NOT EXISTS body text DEFAULT ''::text;
ALTER TABLE public.whatsapp_queue ADD COLUMN IF NOT EXISTS reference text;
ALTER TABLE public.whatsapp_queue ADD COLUMN IF NOT EXISTS store_id text;
ALTER TABLE public.whatsapp_queue ADD COLUMN IF NOT EXISTS status text DEFAULT 'QUEUED'::text;
ALTER TABLE public.whatsapp_queue ADD COLUMN IF NOT EXISTS error text;
ALTER TABLE public.whatsapp_queue ADD COLUMN IF NOT EXISTS queued_at timestamp with time zone DEFAULT now();
ALTER TABLE public.whatsapp_queue ADD COLUMN IF NOT EXISTS sent_at timestamp with time zone;
ALTER TABLE public.whatsapp_queue ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();
ALTER TABLE public.whatsapp_queue ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_queue_pkey ON public.whatsapp_queue USING btree (id);
-- ---------- functions ----------
CREATE OR REPLACE FUNCTION public.campaign_is_live(_c coupon_campaigns)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT _c.is_active
    AND (_c.starts_at IS NULL OR now() >= _c.starts_at)
    AND (_c.expires_at IS NULL OR now() <= _c.expires_at)
    AND (_c.max_claims IS NULL OR _c.claims_count < _c.max_claims)
$function$;

CREATE OR REPLACE FUNCTION public.coupon_claim(_slug text, _phone text, _full_name text DEFAULT NULL::text, _email text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _c public.coupon_campaigns;
  _member uuid;
  _token text;
  _held integer;
BEGIN
  SELECT * INTO _c FROM public.coupon_campaigns WHERE slug = _slug FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CAMPAIGN_NOT_FOUND'; END IF;
  IF NOT _c.is_active THEN RAISE EXCEPTION 'CAMPAIGN_INACTIVE'; END IF;
  IF _c.starts_at IS NOT NULL AND now() < _c.starts_at THEN RAISE EXCEPTION 'CAMPAIGN_NOT_STARTED'; END IF;
  IF _c.expires_at IS NOT NULL AND now() > _c.expires_at THEN RAISE EXCEPTION 'CAMPAIGN_EXPIRED'; END IF;

  _member := public.member_join(_phone, _full_name, _email);

  SELECT count(*) INTO _held FROM public.issued_vouchers
   WHERE campaign_id = _c.id AND member_id = _member;

  SELECT token_slug INTO _token FROM public.issued_vouchers
   WHERE campaign_id = _c.id AND member_id = _member AND status = 'ISSUED'
   ORDER BY issued_at DESC LIMIT 1;
  IF _token IS NOT NULL THEN RETURN _token; END IF;

  IF _c.max_per_member IS NOT NULL AND _held >= _c.max_per_member THEN
    PERFORM public.coupon_log('BLOCKED', _c, NULL, _member, _phone, NULL, NULL, NULL, NULL, NULL,
      'Per-member limit reached');
    RAISE EXCEPTION 'MEMBER_LIMIT_REACHED';
  END IF;

  IF _c.max_claims IS NOT NULL AND _c.claims_count >= _c.max_claims THEN
    PERFORM public.coupon_log('BLOCKED', _c, NULL, _member, _phone, NULL, NULL, NULL, NULL, NULL,
      'Campaign fully claimed');
    RAISE EXCEPTION 'CAMPAIGN_FULLY_CLAIMED';
  END IF;

  _token := public.voucher_token();
  INSERT INTO public.issued_vouchers (token_slug, campaign_id, member_id, issued_source)
  VALUES (_token, _c.id, _member, 'PUBLIC');

  UPDATE public.coupon_campaigns SET claims_count = claims_count + 1 WHERE id = _c.id;

  PERFORM public.coupon_log('CLAIMED', _c, _token, _member, _phone);
  RETURN _token;
END $function$;

CREATE OR REPLACE FUNCTION public.coupon_events_readonly()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN RAISE EXCEPTION 'coupon_events is append-only'; END; $function$;

CREATE OR REPLACE FUNCTION public.coupon_issue_manual(_slug text, _phone text, _full_name text DEFAULT NULL::text, _expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone, _staff text DEFAULT NULL::text, _role text DEFAULT NULL::text, _store text DEFAULT NULL::text, _ignore_limit boolean DEFAULT false)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _c public.coupon_campaigns;
  _member uuid;
  _token text;
  _held integer;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Only staff can issue vouchers';
  END IF;

  SELECT * INTO _c FROM public.coupon_campaigns WHERE slug = _slug FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CAMPAIGN_NOT_FOUND'; END IF;

  _member := public.member_join(_phone, _full_name, NULL);

  SELECT count(*) INTO _held FROM public.issued_vouchers
   WHERE campaign_id = _c.id AND member_id = _member;

  IF NOT _ignore_limit AND _c.max_per_member IS NOT NULL AND _held >= _c.max_per_member THEN
    PERFORM public.coupon_log('BLOCKED', _c, NULL, _member, _phone, _store, NULL, _staff, _role, NULL,
      'Manual issue blocked by per-member limit');
    RAISE EXCEPTION 'MEMBER_LIMIT_REACHED';
  END IF;

  _token := public.voucher_token();
  INSERT INTO public.issued_vouchers
    (token_slug, campaign_id, member_id, expires_at, issued_by, issued_source)
  VALUES (_token, _c.id, _member, _expires_at, _staff, 'MANUAL');

  UPDATE public.coupon_campaigns SET claims_count = claims_count + 1 WHERE id = _c.id;

  PERFORM public.coupon_log('ISSUED_MANUAL', _c, _token, _member, _phone, _store, NULL, _staff, _role,
    NULL, CASE WHEN _expires_at IS NULL THEN NULL ELSE 'Custom expiry' END);

  RETURN _token;
END $function$;

CREATE OR REPLACE FUNCTION public.coupon_log(_type text, _campaign coupon_campaigns, _token text DEFAULT NULL::text, _member uuid DEFAULT NULL::uuid, _phone text DEFAULT NULL::text, _store text DEFAULT NULL::text, _terminal text DEFAULT NULL::text, _staff text DEFAULT NULL::text, _role text DEFAULT NULL::text, _sale text DEFAULT NULL::text, _note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  INSERT INTO public.coupon_events (
    event_type, campaign_id, campaign_name, voucher_token, member_id, member_phone,
    store_id, terminal_id, staff_name, staff_role, sale_id, note
  ) VALUES (
    _type, _campaign.id, _campaign.name, _token, _member, _phone,
    _store, _terminal, _staff, _role, _sale, _note
  );
$function$;

CREATE OR REPLACE FUNCTION public.current_app_user()
 RETURNS TABLE(id uuid, user_id text, full_name text, role app_role, store_id text, email text, permissions jsonb, is_active boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT a.id, a.user_id::text, a.full_name::text, a.role, a.store_id::text,
         a.email::text, a.permissions, a.is_active
  FROM public.app_users a
  WHERE a.auth_user_id = auth.uid()
     OR lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  LIMIT 1
$function$;

CREATE OR REPLACE FUNCTION public.delete_cashier(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NOT public.is_app_supervisor() THEN
    RAISE EXCEPTION 'Only supervisors and admins can manage cashiers';
  END IF;
  DELETE FROM public.cashiers WHERE id = p_id;
END $function$;

CREATE OR REPLACE FUNCTION public.delete_terminal_user(p_user_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Only admins can delete terminal users';
  END IF;
  DELETE FROM public.app_users a WHERE lower(a.user_id) = lower(trim(p_user_id));
END $function$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.user_roles where user_id = _user_id and role = _role
  )
$function$;

CREATE OR REPLACE FUNCTION public.is_app_supervisor()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE ok boolean := false;
BEGIN
  SELECT exists (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role IN ('admin','manager')
  ) INTO ok;
  IF ok THEN RETURN true; END IF;
  BEGIN
    SELECT exists (
      SELECT 1 FROM public.app_users a
      WHERE a.auth_user_id = auth.uid()
        AND a.role::text IN ('admin','manager')
    ) INTO ok;
  EXCEPTION WHEN undefined_table OR undefined_column THEN ok := false;
  END;
  RETURN coalesce(ok, false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role in ('admin', 'manager', 'staff')
  )
$function$;

CREATE OR REPLACE FUNCTION public.list_app_users()
 RETURNS TABLE(id uuid, auth_user_id uuid, user_id text, full_name text, email text, role app_role, store_id text, is_active boolean, permissions jsonb, last_login_at timestamp with time zone, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT a.id, a.auth_user_id, a.user_id::text, a.full_name::text, a.email::text,
         a.role, a.store_id::text, a.is_active, a.permissions, a.last_login_at, a.created_at
  FROM public.app_users a
  WHERE public.is_app_supervisor()
  ORDER BY a.user_id
$function$;

CREATE OR REPLACE FUNCTION public.list_cashiers()
 RETURNS TABLE(id uuid, username text, full_name text, store_id text, permissions jsonb, is_active boolean, last_login_at timestamp with time zone, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT c.id, c.username, c.full_name, c.store_id, c.permissions,
         c.is_active, c.last_login_at, c.created_at
  FROM public.cashiers c
  WHERE public.is_app_supervisor()
  ORDER BY c.username
$function$;

CREATE OR REPLACE FUNCTION public.member_join(_phone text, _full_name text, _email text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _digits text := public.normalize_phone(_phone);
  _id uuid;
  _code text;
BEGIN
  IF length(_digits) < 6 THEN RAISE EXCEPTION 'A valid mobile number is required'; END IF;

  SELECT id INTO _id FROM public.members
   WHERE public.normalize_phone(phone) = _digits LIMIT 1;

  IF _id IS NOT NULL THEN
    IF coalesce(_email, '') <> '' THEN
      UPDATE public.members SET email = _email WHERE id = _id AND coalesce(email, '') = '';
    END IF;
    RETURN _id;
  END IF;

  IF coalesce(trim(_full_name), '') = '' THEN RAISE EXCEPTION 'NEW_MEMBER_NAME_REQUIRED'; END IF;

  _code := 'M' || to_char(now(), 'YYMMDD') || substr(replace(gen_random_uuid()::text, '-', ''), 1, 4);

  INSERT INTO public.members (member_code, full_name, phone, email, loyalty_points, total_spent)
  VALUES (_code, trim(_full_name), _phone, nullif(_email, ''), 0, 0)
  RETURNING id INTO _id;

  RETURN _id;
END $function$;

CREATE OR REPLACE FUNCTION public.member_welcome_claim(_phone text, _full_name text, _email text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _slug text;
  _auto boolean;
BEGIN
  PERFORM public.member_join(_phone, _full_name, _email);

  SELECT coalesce((integration_settings->>'autoIssueWelcome')::boolean, false)
    INTO _auto FROM public.pos_settings WHERE id = 1;

  IF coalesce(_auto, false) IS NOT TRUE THEN RETURN NULL; END IF;

  SELECT slug INTO _slug FROM public.coupon_campaigns c
   WHERE c.is_welcome AND public.campaign_is_live(c)
   ORDER BY c.created_at DESC LIMIT 1;

  IF _slug IS NULL THEN RETURN NULL; END IF;
  RETURN public.coupon_claim(_slug, _phone, _full_name, _email);
END $function$;

CREATE OR REPLACE FUNCTION public.normalize_phone(_phone text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT regexp_replace(coalesce(_phone, ''), '[^0-9]', '', 'g')
$function$;

CREATE OR REPLACE FUNCTION public.set_app_user_permissions(p_user_id text, p_permissions jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NOT public.is_app_supervisor() THEN
    RAISE EXCEPTION 'Only supervisors can change permissions';
  END IF;
  UPDATE public.app_users a
     SET permissions = coalesce(a.permissions, '{}'::jsonb) || p_permissions,
         updated_at = now()
   WHERE lower(a.user_id) = lower(trim(p_user_id));
END $function$;

CREATE OR REPLACE FUNCTION public.set_app_user_profile(p_user_id text, p_full_name text, p_role app_role, p_store_id text, p_is_active boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NOT public.is_app_supervisor() THEN
    RAISE EXCEPTION 'Only supervisors can edit staff profiles';
  END IF;
  UPDATE public.app_users a
     SET full_name  = coalesce(nullif(trim(p_full_name), ''), a.full_name),
         role       = coalesce(p_role, a.role),
         store_id   = nullif(trim(coalesce(p_store_id, '')), ''),
         is_active  = coalesce(p_is_active, a.is_active),
         updated_at = now()
   WHERE lower(a.user_id) = lower(trim(p_user_id));
END $function$;

CREATE OR REPLACE FUNCTION public.set_cashier_permissions(p_id uuid, p_permissions jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NOT public.is_app_supervisor() THEN
    RAISE EXCEPTION 'Only supervisors and admins can manage cashiers';
  END IF;
  UPDATE public.cashiers
     SET permissions = coalesce(permissions, '{}'::jsonb) || coalesce(p_permissions, '{}'::jsonb)
   WHERE id = p_id;
END $function$;

CREATE OR REPLACE FUNCTION public.set_terminal_active(p_user_id text, p_active boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NOT public.is_app_supervisor() THEN
    RAISE EXCEPTION 'Only supervisors can manage terminal users';
  END IF;
  UPDATE public.app_users a SET is_active = p_active, updated_at = now()
   WHERE lower(a.user_id) = lower(trim(p_user_id));
END $function$;

CREATE OR REPLACE FUNCTION public.shifts_sync_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.closed_at IS NOT NULL THEN
    NEW.status := 'CLOSED';
  ELSIF NEW.status = 'CLOSED' THEN
    NEW.closed_at := COALESCE(NEW.closed_at, now());
  ELSE
    NEW.status := 'OPEN';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.stock_transfer_receive(p_transfer_id uuid, p_received_by text DEFAULT NULL::text, p_deduct_source boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  t public.stock_transfers;
  it record;
  v_target uuid;
  v_qty integer;
  v_src public.products;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Only staff can receive a transfer';
  END IF;

  SELECT * INTO t FROM public.stock_transfers WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TRANSFER_NOT_FOUND'; END IF;
  IF t.status = 'received' THEN RAISE EXCEPTION 'TRANSFER_ALREADY_RECEIVED'; END IF;
  IF t.status IN ('rejected', 'cancelled') THEN RAISE EXCEPTION 'TRANSFER_CLOSED'; END IF;

  FOR it IN SELECT * FROM public.stock_transfer_items WHERE transfer_id = t.id LOOP
    v_qty := CASE WHEN it.quantity_received > 0 THEN it.quantity_received ELSE it.quantity END;
    CONTINUE WHEN v_qty <= 0;

    SELECT * INTO v_src FROM public.products WHERE id = it.product_id;
    IF NOT FOUND THEN CONTINUE; END IF;

    v_target := it.product_id;

    -- Across clusters the receiving group keeps its own catalogue entry.
    IF t.transfer_scope = 'INTER_GROUP' AND coalesce(v_src.barcode, '') <> '' THEN
      SELECT p.id INTO v_target
        FROM public.products p
       WHERE p.barcode = v_src.barcode
         AND coalesce(p.stock_by_store ? t.to_store_id, false)
       LIMIT 1;
      IF v_target IS NULL THEN v_target := it.product_id; END IF;
    END IF;

    IF p_deduct_source THEN
      UPDATE public.products
         SET stock_by_store = jsonb_set(
               coalesce(stock_by_store, '{}'::jsonb), ARRAY[t.from_store_id],
               to_jsonb(greatest(
                 coalesce((stock_by_store ->> t.from_store_id)::int, 0) - v_qty, 0)), true),
             stock_quantity = greatest(stock_quantity - v_qty, 0)
       WHERE id = it.product_id;
    END IF;

    UPDATE public.products
       SET stock_by_store = jsonb_set(
             coalesce(stock_by_store, '{}'::jsonb), ARRAY[t.to_store_id],
             to_jsonb(coalesce((stock_by_store ->> t.to_store_id)::int, 0) + v_qty), true),
           stock_quantity = stock_quantity + v_qty
     WHERE id = v_target;

    UPDATE public.stock_transfer_items SET quantity_received = v_qty WHERE id = it.id;
  END LOOP;

  UPDATE public.stock_transfers
     SET status = 'received', received_at = now(),
         received_by = coalesce(p_received_by, received_by)
   WHERE id = t.id;
END $function$;

CREATE OR REPLACE FUNCTION public.sync_auth_user_to_public()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_code text := coalesce(nullif(trim(new.raw_user_meta_data ->> 'user_id'), ''),
                          split_part(new.email, '@', 1));
  v_name text := coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), v_code);
  v_store text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'store_id', '')), '');
  v_existing public.app_users%rowtype;
BEGIN
  SELECT * INTO v_existing FROM public.app_users WHERE user_id = v_code;

  IF FOUND THEN
    -- Never let a new signup hijack a row already linked to another auth account,
    -- and never link a row whose email does not match the signup email.
    IF (v_existing.auth_user_id IS NOT NULL AND v_existing.auth_user_id <> new.id)
       OR lower(coalesce(v_existing.email, '')) <> lower(new.email) THEN
      RETURN new;
    END IF;

    UPDATE public.app_users
       SET full_name    = v_name,
           store_id     = coalesce(v_store, store_id),
           auth_user_id = new.id,
           updated_at   = now()
     WHERE id = v_existing.id;
    RETURN new;
  END IF;

  INSERT INTO public.app_users (user_id, full_name, role, store_id, email, auth_user_id)
  VALUES (v_code, v_name, 'staff'::app_role, v_store, lower(new.email), new.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN new;
END $function$;

CREATE OR REPLACE FUNCTION public.terminal_token_claim(p_token_id uuid, p_device text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  claimed boolean;
BEGIN
  UPDATE public.terminal_tokens
  SET status = 'used',
      claimed_by_device = coalesce(p_device, claimed_by_device),
      claimed_at = now(),
      activated_at = coalesce(activated_at, now()),
      last_seen_at = now()
  WHERE id = p_token_id AND status = 'active'
  RETURNING true INTO claimed;

  RETURN coalesce(claimed, false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.terminal_token_heartbeat(p_token_id uuid, p_activate boolean DEFAULT false)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  UPDATE public.terminal_tokens
  SET last_seen_at = now(),
      activated_at = CASE WHEN p_activate THEN coalesce(activated_at, now()) ELSE activated_at END
  WHERE id = p_token_id AND status IN ('active', 'used')
$function$;

CREATE OR REPLACE FUNCTION public.terminal_token_status(p_token_id uuid)
 RETURNS TABLE(status text, location_name text, location_id text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT t.status, coalesce(t.location_name, ''), coalesce(t.location_id, '')
  FROM public.terminal_tokens t
  WHERE t.id = p_token_id
$function$;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN NEW.updated_at := now(); RETURN NEW; END; $function$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.upsert_cashier(p_id uuid, p_username text, p_full_name text, p_pin text, p_store_id text, p_is_active boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE v_id uuid;
BEGIN
  IF NOT public.is_app_supervisor() THEN
    RAISE EXCEPTION 'Only supervisors and admins can manage cashiers';
  END IF;
  IF coalesce(trim(p_username), '') = '' THEN
    RAISE EXCEPTION 'Username is required';
  END IF;
  IF p_pin IS NOT NULL AND p_pin <> '' AND p_pin !~ '^\d{4,6}$' THEN
    RAISE EXCEPTION 'PIN must be 4 to 6 digits';
  END IF;

  IF p_id IS NULL THEN
    IF p_pin IS NULL OR p_pin = '' THEN
      RAISE EXCEPTION 'A PIN is required for a new cashier';
    END IF;
    INSERT INTO public.cashiers (username, full_name, pin_hash, store_id, is_active)
    VALUES (lower(trim(p_username)), coalesce(p_full_name, ''),
            extensions.crypt(p_pin::text, extensions.gen_salt('bf'::text, 10)),
            p_store_id, coalesce(p_is_active, true))
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.cashiers SET
      username = lower(trim(p_username)),
      full_name = coalesce(p_full_name, full_name),
      store_id = p_store_id,
      is_active = coalesce(p_is_active, is_active),
      pin_hash = CASE WHEN p_pin IS NULL OR p_pin = '' THEN pin_hash
                      ELSE extensions.crypt(p_pin::text, extensions.gen_salt('bf'::text, 10)) END
    WHERE id = p_id
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END $function$;

CREATE OR REPLACE FUNCTION public.upsert_terminal_user(p_user_id text, p_full_name text, p_role app_role, p_store_id text, p_email text, p_pin text, p_password text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NOT public.is_app_supervisor() THEN
    RAISE EXCEPTION 'Only supervisors can manage terminal users';
  END IF;
  IF p_pin !~ '^[0-9]{4,6}$' THEN
    RAISE EXCEPTION 'PIN must be 4 to 6 digits';
  END IF;
  INSERT INTO public.app_users (user_id, full_name, role, store_id, email, pin_hash)
  VALUES (trim(p_user_id), trim(p_full_name), p_role,
          nullif(trim(coalesce(p_store_id,'')),''), lower(trim(p_email)),
          extensions.crypt(p_pin::text, extensions.gen_salt('bf'::text, 10)))
  ON CONFLICT (user_id) DO UPDATE
    SET full_name = excluded.full_name, role = excluded.role,
        store_id = excluded.store_id, email = excluded.email,
        pin_hash = excluded.pin_hash, updated_at = now();
END $function$;

CREATE OR REPLACE FUNCTION public.verify_cashier_pin(p_username text, p_pin text)
 RETURNS TABLE(id uuid, username text, full_name text, store_id text, permissions jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE v_row public.cashiers;
BEGIN
  SELECT * INTO v_row FROM public.cashiers c
   WHERE lower(c.username) = lower(trim(p_username)) AND c.is_active
   LIMIT 1;
  IF v_row.id IS NULL THEN RETURN; END IF;
  IF v_row.pin_hash <> extensions.crypt(p_pin::text, v_row.pin_hash::text) THEN RETURN; END IF;
  UPDATE public.cashiers SET last_login_at = now() WHERE public.cashiers.id = v_row.id;
  id := v_row.id; username := v_row.username; full_name := v_row.full_name;
  store_id := v_row.store_id; permissions := coalesce(v_row.permissions, '{}'::jsonb);
  RETURN NEXT;
END $function$;

CREATE OR REPLACE FUNCTION public.verify_terminal_pin(p_user_id text, p_pin text)
 RETURNS TABLE(user_id text, full_name text, role app_role, store_id text, email text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE u public.app_users%rowtype;
BEGIN
  SELECT * INTO u FROM public.app_users a
   WHERE lower(a.user_id) = lower(trim(p_user_id)) AND a.is_active;
  IF NOT FOUND THEN RETURN; END IF;
  IF u.pin_hash = '' OR u.pin_hash <> extensions.crypt(p_pin::text, u.pin_hash::text) THEN RETURN; END IF;
  UPDATE public.app_users SET last_login_at = now() WHERE id = u.id;
  RETURN QUERY SELECT u.user_id::text, u.full_name::text, u.role, u.store_id::text, u.email::text;
END $function$;

CREATE OR REPLACE FUNCTION public.voucher_by_token(_token text)
 RETURNS TABLE(voucher jsonb, campaign jsonb, member_name text, member_code text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT to_jsonb(v) - 'issued_by' - 'redeemed_by' - 'disabled_by',
         to_jsonb(c),
         coalesce(m.full_name, ''),
         coalesce(m.member_code, '')
  FROM public.issued_vouchers v
  JOIN public.coupon_campaigns c ON c.id = v.campaign_id
  LEFT JOIN public.members m ON m.id = v.member_id
  WHERE v.token_slug = _token
  LIMIT 1
$function$;

CREATE OR REPLACE FUNCTION public.voucher_redeem(_token text, _sale_id text DEFAULT NULL::text, _store_id text DEFAULT NULL::text, _staff text DEFAULT NULL::text)
 RETURNS issued_vouchers
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _v public.issued_vouchers;
  _c public.coupon_campaigns;
  _deadline timestamptz;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Only staff can redeem a voucher';
  END IF;

  SELECT * INTO _v FROM public.issued_vouchers WHERE token_slug = _token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'VOUCHER_NOT_FOUND'; END IF;
  IF _v.status = 'REDEEMED' THEN RAISE EXCEPTION 'VOUCHER_ALREADY_REDEEMED'; END IF;

  SELECT * INTO _c FROM public.coupon_campaigns WHERE id = _v.campaign_id;

  IF _v.status = 'DISABLED' THEN
    PERFORM public.coupon_log('BLOCKED', _c, _token, _v.member_id, NULL, _store_id, NULL, _staff,
      NULL, _sale_id, 'Disabled voucher presented');
    RAISE EXCEPTION 'VOUCHER_DISABLED';
  END IF;

  _deadline := coalesce(_v.expires_at, _c.expires_at);
  IF _deadline IS NOT NULL AND now() > _deadline THEN
    UPDATE public.issued_vouchers SET status = 'EXPIRED' WHERE id = _v.id;
    PERFORM public.coupon_log('BLOCKED', _c, _token, _v.member_id, NULL, _store_id, NULL, _staff,
      NULL, _sale_id, 'Expired voucher presented');
    RAISE EXCEPTION 'VOUCHER_EXPIRED';
  END IF;

  UPDATE public.issued_vouchers
     SET status = 'REDEEMED', redeemed_at = now(), redeemed_by = _staff,
         redeemed_sale_id = _sale_id, store_id = _store_id
   WHERE id = _v.id
  RETURNING * INTO _v;

  PERFORM public.coupon_log('REDEEMED', _c, _token, _v.member_id, NULL, _store_id, NULL, _staff,
    NULL, _sale_id);
  RETURN _v;
END $function$;

CREATE OR REPLACE FUNCTION public.voucher_set_status(_token text, _status text, _reason text DEFAULT NULL::text, _staff text DEFAULT NULL::text, _role text DEFAULT NULL::text, _store text DEFAULT NULL::text)
 RETURNS issued_vouchers
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _v public.issued_vouchers;
  _c public.coupon_campaigns;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Only staff can change a voucher status';
  END IF;
  IF _status NOT IN ('ISSUED', 'DISABLED') THEN RAISE EXCEPTION 'VOUCHER_STATUS_INVALID'; END IF;

  SELECT * INTO _v FROM public.issued_vouchers WHERE token_slug = _token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'VOUCHER_NOT_FOUND'; END IF;
  IF _v.status = 'REDEEMED' THEN RAISE EXCEPTION 'VOUCHER_ALREADY_REDEEMED'; END IF;

  SELECT * INTO _c FROM public.coupon_campaigns WHERE id = _v.campaign_id;

  UPDATE public.issued_vouchers
     SET status = _status,
         disabled_at = CASE WHEN _status = 'DISABLED' THEN now() ELSE NULL END,
         disabled_by = CASE WHEN _status = 'DISABLED' THEN _staff ELSE NULL END,
         disable_reason = CASE WHEN _status = 'DISABLED' THEN _reason ELSE NULL END
   WHERE id = _v.id
  RETURNING * INTO _v;

  PERFORM public.coupon_log(
    CASE WHEN _status = 'DISABLED' THEN 'DISABLED' ELSE 'REENABLED' END,
    _c, _token, _v.member_id, NULL, _store, NULL, _staff, _role, NULL,
    coalesce(_reason, CASE WHEN _status = 'DISABLED' THEN 'Disabled from backoffice'
                           ELSE 'Re-enabled from backoffice' END));
  RETURN _v;
END $function$;

CREATE OR REPLACE FUNCTION public.voucher_token()
 RETURNS text
 LANGUAGE sql
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT 'vch_' || substr(encode(extensions.gen_random_bytes(8), 'hex'), 1, 10)
$function$;

-- ---------- triggers ----------
DROP TRIGGER IF EXISTS app_users_touch_updated_at ON public.app_users;
CREATE TRIGGER app_users_touch_updated_at BEFORE UPDATE ON public.app_users FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
DROP TRIGGER IF EXISTS bookings_set_updated_at ON public.bookings;
CREATE TRIGGER bookings_set_updated_at BEFORE UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS cashiers_touch_updated_at ON public.cashiers;
CREATE TRIGGER cashiers_touch_updated_at BEFORE UPDATE ON public.cashiers FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
DROP TRIGGER IF EXISTS coupon_campaigns_set_updated_at ON public.coupon_campaigns;
CREATE TRIGGER coupon_campaigns_set_updated_at BEFORE UPDATE ON public.coupon_campaigns FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS coupon_events_no_change ON public.coupon_events;
CREATE TRIGGER coupon_events_no_change BEFORE DELETE OR UPDATE ON public.coupon_events FOR EACH ROW EXECUTE FUNCTION coupon_events_readonly();
DROP TRIGGER IF EXISTS held_orders_touch_updated_at ON public.held_orders;
CREATE TRIGGER held_orders_touch_updated_at BEFORE UPDATE ON public.held_orders FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
DROP TRIGGER IF EXISTS product_categories_set_updated_at ON public.product_categories;
CREATE TRIGGER product_categories_set_updated_at BEFORE UPDATE ON public.product_categories FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS products_set_updated_at ON public.products;
CREATE TRIGGER products_set_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_secure_settings_updated_at ON public.secure_settings;
CREATE TRIGGER update_secure_settings_updated_at BEFORE UPDATE ON public.secure_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS shift_sessions_set_updated_at ON public.shift_sessions;
CREATE TRIGGER shift_sessions_set_updated_at BEFORE UPDATE ON public.shift_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS shifts_set_updated_at ON public.shifts;
CREATE TRIGGER shifts_set_updated_at BEFORE UPDATE ON public.shifts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS shifts_sync_status_trg ON public.shifts;
CREATE TRIGGER shifts_sync_status_trg BEFORE INSERT OR UPDATE ON public.shifts FOR EACH ROW EXECUTE FUNCTION shifts_sync_status();
DROP TRIGGER IF EXISTS stock_transfers_touch ON public.stock_transfers;
CREATE TRIGGER stock_transfers_touch BEFORE UPDATE ON public.stock_transfers FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
DROP TRIGGER IF EXISTS update_stores_updated_at ON public.stores;
CREATE TRIGGER update_stores_updated_at BEFORE UPDATE ON public.stores FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS suppliers_set_updated_at ON public.suppliers;
CREATE TRIGGER suppliers_set_updated_at BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS uom_units_set_updated_at ON public.uom_units;
CREATE TRIGGER uom_units_set_updated_at BEFORE UPDATE ON public.uom_units FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS whatsapp_queue_touch_updated_at ON public.whatsapp_queue;
CREATE TRIGGER whatsapp_queue_touch_updated_at BEFORE UPDATE ON public.whatsapp_queue FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ---------- grants ----------

-- ---------- row level security ----------
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can append audit logs" ON public.audit_logs;
CREATE POLICY "Staff can append audit logs" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (is_staff(auth.uid()));
DROP POLICY IF EXISTS "Staff can read audit logs" ON public.audit_logs;
CREATE POLICY "Staff can read audit logs" ON public.audit_logs FOR SELECT TO authenticated USING (is_staff(auth.uid()));
ALTER TABLE public.booking_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can add booking payments" ON public.booking_payments;
CREATE POLICY "Staff can add booking payments" ON public.booking_payments FOR INSERT TO authenticated WITH CHECK ((is_staff(auth.uid()) OR is_app_supervisor()));
DROP POLICY IF EXISTS "Staff can delete booking payments" ON public.booking_payments;
CREATE POLICY "Staff can delete booking payments" ON public.booking_payments FOR DELETE TO authenticated USING (is_staff(auth.uid()));
DROP POLICY IF EXISTS "Staff can read booking payments" ON public.booking_payments;
CREATE POLICY "Staff can read booking payments" ON public.booking_payments FOR SELECT TO authenticated USING ((is_staff(auth.uid()) OR is_app_supervisor()));
DROP POLICY IF EXISTS "Staff can update booking payments" ON public.booking_payments;
CREATE POLICY "Staff can update booking payments" ON public.booking_payments FOR UPDATE TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can create bookings" ON public.bookings;
CREATE POLICY "Staff can create bookings" ON public.bookings FOR INSERT TO authenticated WITH CHECK ((is_staff(auth.uid()) OR is_app_supervisor()));
DROP POLICY IF EXISTS "Staff can delete bookings" ON public.bookings;
CREATE POLICY "Staff can delete bookings" ON public.bookings FOR DELETE TO authenticated USING (is_staff(auth.uid()));
DROP POLICY IF EXISTS "Staff can read bookings" ON public.bookings;
CREATE POLICY "Staff can read bookings" ON public.bookings FOR SELECT TO authenticated USING ((is_staff(auth.uid()) OR is_app_supervisor()));
DROP POLICY IF EXISTS "Staff can update bookings" ON public.bookings;
CREATE POLICY "Staff can update bookings" ON public.bookings FOR UPDATE TO authenticated USING ((is_staff(auth.uid()) OR is_app_supervisor())) WITH CHECK ((is_staff(auth.uid()) OR is_app_supervisor()));
ALTER TABLE public.cashiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_campaigns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "campaigns managed by staff" ON public.coupon_campaigns;
CREATE POLICY "campaigns managed by staff" ON public.coupon_campaigns FOR ALL TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));
DROP POLICY IF EXISTS "campaigns readable" ON public.coupon_campaigns;
CREATE POLICY "campaigns readable" ON public.coupon_campaigns FOR SELECT TO anon,authenticated USING (true);
ALTER TABLE public.coupon_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "coupon events readable by staff" ON public.coupon_events;
CREATE POLICY "coupon events readable by staff" ON public.coupon_events FOR SELECT TO authenticated USING (is_staff(auth.uid()));
ALTER TABLE public.drawer_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can append drawer events" ON public.drawer_events;
CREATE POLICY "Staff can append drawer events" ON public.drawer_events FOR INSERT TO authenticated WITH CHECK (is_staff(auth.uid()));
DROP POLICY IF EXISTS "Staff can read drawer events" ON public.drawer_events;
CREATE POLICY "Staff can read drawer events" ON public.drawer_events FOR SELECT TO authenticated USING (is_staff(auth.uid()));
ALTER TABLE public.held_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff manage held orders" ON public.held_orders;
CREATE POLICY "Staff manage held orders" ON public.held_orders FOR ALL TO authenticated USING (true) WITH CHECK (true);
ALTER TABLE public.issued_vouchers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "vouchers managed by staff" ON public.issued_vouchers;
CREATE POLICY "vouchers managed by staff" ON public.issued_vouchers FOR ALL TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));
DROP POLICY IF EXISTS "vouchers readable by staff" ON public.issued_vouchers;
CREATE POLICY "vouchers readable by staff" ON public.issued_vouchers FOR SELECT TO authenticated USING (is_staff(auth.uid()));
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can delete" ON public.members;
CREATE POLICY "Staff can delete" ON public.members FOR DELETE TO authenticated USING (is_staff(auth.uid()));
DROP POLICY IF EXISTS "Staff can insert" ON public.members;
CREATE POLICY "Staff can insert" ON public.members FOR INSERT TO authenticated WITH CHECK (is_staff(auth.uid()));
DROP POLICY IF EXISTS "Staff can read members" ON public.members;
CREATE POLICY "Staff can read members" ON public.members FOR SELECT TO authenticated USING (is_staff(auth.uid()));
DROP POLICY IF EXISTS "Staff can update" ON public.members;
CREATE POLICY "Staff can update" ON public.members FOR UPDATE TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));
ALTER TABLE public.membership_tiers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can delete" ON public.membership_tiers;
CREATE POLICY "Staff can delete" ON public.membership_tiers FOR DELETE TO authenticated USING (is_staff(auth.uid()));
DROP POLICY IF EXISTS "Staff can insert" ON public.membership_tiers;
CREATE POLICY "Staff can insert" ON public.membership_tiers FOR INSERT TO authenticated WITH CHECK (is_staff(auth.uid()));
DROP POLICY IF EXISTS "Staff can read membership tiers" ON public.membership_tiers;
CREATE POLICY "Staff can read membership tiers" ON public.membership_tiers FOR SELECT TO authenticated USING (is_staff(auth.uid()));
DROP POLICY IF EXISTS "Staff can update" ON public.membership_tiers;
CREATE POLICY "Staff can update" ON public.membership_tiers FOR UPDATE TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));
ALTER TABLE public.pos_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can delete" ON public.pos_settings;
CREATE POLICY "Staff can delete" ON public.pos_settings FOR DELETE TO authenticated USING (is_staff(auth.uid()));
DROP POLICY IF EXISTS "Staff can insert" ON public.pos_settings;
CREATE POLICY "Staff can insert" ON public.pos_settings FOR INSERT TO authenticated WITH CHECK (is_staff(auth.uid()));
DROP POLICY IF EXISTS "Staff can read pos settings" ON public.pos_settings;
CREATE POLICY "Staff can read pos settings" ON public.pos_settings FOR SELECT TO authenticated USING (is_staff(auth.uid()));
DROP POLICY IF EXISTS "Staff can update" ON public.pos_settings;
CREATE POLICY "Staff can update" ON public.pos_settings FOR UPDATE TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));
ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can manage product categories" ON public.product_categories;
CREATE POLICY "Staff can manage product categories" ON public.product_categories FOR ALL TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));
DROP POLICY IF EXISTS "Staff can read product categories" ON public.product_categories;
CREATE POLICY "Staff can read product categories" ON public.product_categories FOR SELECT TO authenticated USING (is_staff(auth.uid()));
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can delete" ON public.products;
CREATE POLICY "Staff can delete" ON public.products FOR DELETE TO authenticated USING (is_staff(auth.uid()));
DROP POLICY IF EXISTS "Staff can insert" ON public.products;
CREATE POLICY "Staff can insert" ON public.products FOR INSERT TO authenticated WITH CHECK (is_staff(auth.uid()));
DROP POLICY IF EXISTS "Staff can read products" ON public.products;
CREATE POLICY "Staff can read products" ON public.products FOR SELECT TO authenticated USING (is_staff(auth.uid()));
DROP POLICY IF EXISTS "Staff can update" ON public.products;
CREATE POLICY "Staff can update" ON public.products FOR UPDATE TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));
ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can delete" ON public.promotions;
CREATE POLICY "Staff can delete" ON public.promotions FOR DELETE TO authenticated USING (is_staff(auth.uid()));
DROP POLICY IF EXISTS "Staff can insert" ON public.promotions;
CREATE POLICY "Staff can insert" ON public.promotions FOR INSERT TO authenticated WITH CHECK (is_staff(auth.uid()));
DROP POLICY IF EXISTS "Staff can read promotions" ON public.promotions;
CREATE POLICY "Staff can read promotions" ON public.promotions FOR SELECT TO authenticated USING (is_staff(auth.uid()));
DROP POLICY IF EXISTS "Staff can update" ON public.promotions;
CREATE POLICY "Staff can update" ON public.promotions FOR UPDATE TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can delete" ON public.purchase_order_items;
CREATE POLICY "Staff can delete" ON public.purchase_order_items FOR DELETE TO authenticated USING (is_staff(auth.uid()));
DROP POLICY IF EXISTS "Staff can insert" ON public.purchase_order_items;
CREATE POLICY "Staff can insert" ON public.purchase_order_items FOR INSERT TO authenticated WITH CHECK (is_staff(auth.uid()));
DROP POLICY IF EXISTS "Staff can read purchase order items" ON public.purchase_order_items;
CREATE POLICY "Staff can read purchase order items" ON public.purchase_order_items FOR SELECT TO authenticated USING (is_staff(auth.uid()));
DROP POLICY IF EXISTS "Staff can update" ON public.purchase_order_items;
CREATE POLICY "Staff can update" ON public.purchase_order_items FOR UPDATE TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can delete" ON public.purchase_orders;
CREATE POLICY "Staff can delete" ON public.purchase_orders FOR DELETE TO authenticated USING (is_staff(auth.uid()));
DROP POLICY IF EXISTS "Staff can insert" ON public.purchase_orders;
CREATE POLICY "Staff can insert" ON public.purchase_orders FOR INSERT TO authenticated WITH CHECK (is_staff(auth.uid()));
DROP POLICY IF EXISTS "Staff can read purchase orders" ON public.purchase_orders;
CREATE POLICY "Staff can read purchase orders" ON public.purchase_orders FOR SELECT TO authenticated USING (is_staff(auth.uid()));
DROP POLICY IF EXISTS "Staff can update" ON public.purchase_orders;
CREATE POLICY "Staff can update" ON public.purchase_orders FOR UPDATE TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can delete" ON public.sale_items;
CREATE POLICY "Staff can delete" ON public.sale_items FOR DELETE TO authenticated USING (is_staff(auth.uid()));
DROP POLICY IF EXISTS "Staff can insert" ON public.sale_items;
CREATE POLICY "Staff can insert" ON public.sale_items FOR INSERT TO authenticated WITH CHECK (is_staff(auth.uid()));
DROP POLICY IF EXISTS "Staff can read sale items" ON public.sale_items;
CREATE POLICY "Staff can read sale items" ON public.sale_items FOR SELECT TO authenticated USING (is_staff(auth.uid()));
DROP POLICY IF EXISTS "Staff can update" ON public.sale_items;
CREATE POLICY "Staff can update" ON public.sale_items FOR UPDATE TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can delete" ON public.sales;
CREATE POLICY "Staff can delete" ON public.sales FOR DELETE TO authenticated USING (is_staff(auth.uid()));
DROP POLICY IF EXISTS "Staff can insert" ON public.sales;
CREATE POLICY "Staff can insert" ON public.sales FOR INSERT TO authenticated WITH CHECK (is_staff(auth.uid()));
DROP POLICY IF EXISTS "Staff can read sales" ON public.sales;
CREATE POLICY "Staff can read sales" ON public.sales FOR SELECT TO authenticated USING (is_staff(auth.uid()));
DROP POLICY IF EXISTS "Staff can update" ON public.sales;
CREATE POLICY "Staff can update" ON public.sales FOR UPDATE TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));
ALTER TABLE public.secure_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role manages secure settings" ON public.secure_settings;
CREATE POLICY "Service role manages secure settings" ON public.secure_settings FOR ALL TO service_role USING (true) WITH CHECK (true);
ALTER TABLE public.shift_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can append shift sessions" ON public.shift_sessions;
CREATE POLICY "Staff can append shift sessions" ON public.shift_sessions FOR INSERT TO authenticated WITH CHECK (is_staff(auth.uid()));
DROP POLICY IF EXISTS "Staff can read shift sessions" ON public.shift_sessions;
CREATE POLICY "Staff can read shift sessions" ON public.shift_sessions FOR SELECT TO authenticated USING (is_staff(auth.uid()));
DROP POLICY IF EXISTS "Staff can update shift sessions" ON public.shift_sessions;
CREATE POLICY "Staff can update shift sessions" ON public.shift_sessions FOR UPDATE TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can open shifts" ON public.shifts;
CREATE POLICY "Staff can open shifts" ON public.shifts FOR INSERT TO authenticated WITH CHECK (is_staff(auth.uid()));
DROP POLICY IF EXISTS "Staff can read shifts" ON public.shifts;
CREATE POLICY "Staff can read shifts" ON public.shifts FOR SELECT TO authenticated USING (is_staff(auth.uid()));
DROP POLICY IF EXISTS "Staff can update shifts" ON public.shifts;
CREATE POLICY "Staff can update shifts" ON public.shifts FOR UPDATE TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));
ALTER TABLE public.sku_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can add sku audit" ON public.sku_audit;
CREATE POLICY "Staff can add sku audit" ON public.sku_audit FOR INSERT TO authenticated WITH CHECK (is_staff(auth.uid()));
DROP POLICY IF EXISTS "Staff can read sku audit" ON public.sku_audit;
CREATE POLICY "Staff can read sku audit" ON public.sku_audit FOR SELECT TO authenticated USING (is_staff(auth.uid()));
ALTER TABLE public.stock_adjustments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff add stock adjustments" ON public.stock_adjustments;
CREATE POLICY "Staff add stock adjustments" ON public.stock_adjustments FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Staff read stock adjustments" ON public.stock_adjustments;
CREATE POLICY "Staff read stock adjustments" ON public.stock_adjustments FOR SELECT TO authenticated USING (true);
ALTER TABLE public.stock_transfer_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff read transfer items" ON public.stock_transfer_items;
CREATE POLICY "Staff read transfer items" ON public.stock_transfer_items FOR SELECT TO authenticated USING (is_staff(auth.uid()));
DROP POLICY IF EXISTS "Staff write transfer items" ON public.stock_transfer_items;
CREATE POLICY "Staff write transfer items" ON public.stock_transfer_items FOR ALL TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));
ALTER TABLE public.stock_transfers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff raise transfers" ON public.stock_transfers;
CREATE POLICY "Staff raise transfers" ON public.stock_transfers FOR INSERT TO authenticated WITH CHECK (is_staff(auth.uid()));
DROP POLICY IF EXISTS "Staff read transfers" ON public.stock_transfers;
CREATE POLICY "Staff read transfers" ON public.stock_transfers FOR SELECT TO authenticated USING (is_staff(auth.uid()));
DROP POLICY IF EXISTS "Staff update transfers" ON public.stock_transfers;
CREATE POLICY "Staff update transfers" ON public.stock_transfers FOR UPDATE TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));
DROP POLICY IF EXISTS "Supervisors delete transfers" ON public.stock_transfers;
CREATE POLICY "Supervisors delete transfers" ON public.stock_transfers FOR DELETE TO authenticated USING (is_app_supervisor());
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can delete stores" ON public.stores;
CREATE POLICY "Staff can delete stores" ON public.stores FOR DELETE TO authenticated USING (is_staff(auth.uid()));
DROP POLICY IF EXISTS "Staff can insert stores" ON public.stores;
CREATE POLICY "Staff can insert stores" ON public.stores FOR INSERT TO authenticated WITH CHECK (is_staff(auth.uid()));
DROP POLICY IF EXISTS "Staff can read stores" ON public.stores;
CREATE POLICY "Staff can read stores" ON public.stores FOR SELECT TO authenticated USING (is_staff(auth.uid()));
DROP POLICY IF EXISTS "Staff can update stores" ON public.stores;
CREATE POLICY "Staff can update stores" ON public.stores FOR UPDATE TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can manage suppliers" ON public.suppliers;
CREATE POLICY "Staff can manage suppliers" ON public.suppliers FOR ALL TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));
DROP POLICY IF EXISTS "Staff can read suppliers" ON public.suppliers;
CREATE POLICY "Staff can read suppliers" ON public.suppliers FOR SELECT TO authenticated USING (is_staff(auth.uid()));
ALTER TABLE public.terminal_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can delete tokens" ON public.terminal_tokens;
CREATE POLICY "Staff can delete tokens" ON public.terminal_tokens FOR DELETE TO authenticated USING (is_staff(auth.uid()));
DROP POLICY IF EXISTS "Staff can issue tokens" ON public.terminal_tokens;
CREATE POLICY "Staff can issue tokens" ON public.terminal_tokens FOR INSERT TO authenticated WITH CHECK (is_staff(auth.uid()));
DROP POLICY IF EXISTS "Staff can manage tokens" ON public.terminal_tokens;
CREATE POLICY "Staff can manage tokens" ON public.terminal_tokens FOR UPDATE TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));
DROP POLICY IF EXISTS "Staff can read tokens" ON public.terminal_tokens;
CREATE POLICY "Staff can read tokens" ON public.terminal_tokens FOR SELECT TO authenticated USING (is_staff(auth.uid()));
ALTER TABLE public.uom_units ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can manage units" ON public.uom_units;
CREATE POLICY "Staff can manage units" ON public.uom_units FOR ALL TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));
DROP POLICY IF EXISTS "Staff can read units" ON public.uom_units;
CREATE POLICY "Staff can read units" ON public.uom_units FOR SELECT TO authenticated USING (is_staff(auth.uid()));
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage roles" ON public.user_roles;
CREATE POLICY "Admins manage roles" ON public.user_roles FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Users can read their own roles" ON public.user_roles;
CREATE POLICY "Users can read their own roles" ON public.user_roles FOR SELECT TO authenticated USING ((user_id = auth.uid()));
ALTER TABLE public.whatsapp_queue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff manage whatsapp queue" ON public.whatsapp_queue;
CREATE POLICY "Staff manage whatsapp queue" ON public.whatsapp_queue FOR ALL TO authenticated USING (true) WITH CHECK (true);
-- ---------- verification ----------
-- Run this after the script; every row should say OK.
SELECT t.name AS table_name,
       CASE WHEN to_regclass('public.' || t.name) IS NULL THEN 'MISSING' ELSE 'OK' END AS status
FROM (VALUES ('app_users'),('audit_logs'),('booking_payments'),('bookings'),('cashiers'),
             ('coupon_campaigns'),('coupon_events'),('drawer_events'),('held_orders'),
             ('issued_vouchers'),('members'),('membership_tiers'),('pos_settings'),
             ('product_categories'),('products'),('promotions'),('purchase_order_items'),
             ('purchase_orders'),('sale_items'),('sales'),('secure_settings'),
             ('shift_sessions'),('shifts'),('sku_audit'),('stock_adjustments'),
             ('stock_transfer_items'),('stock_transfers'),('stores'),('suppliers'),
             ('terminal_tokens'),('uom_units'),('user_roles'),('whatsapp_queue')) AS t(name)
ORDER BY 1;
