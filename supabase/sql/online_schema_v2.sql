-- ============================================================================
--  online_schema_v2.sql — authoritative PostgreSQL (Supabase) schema
--  Generated from the live database. Idempotent: safe to re-run.
--  Replaces every previous supabase/sql/NN_*.sql iteration.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'manager', 'staff');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ---------------------------------------------------------------- activity_events
CREATE TABLE IF NOT EXISTS public.activity_events (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "event_type" text NOT NULL,
  "severity" text DEFAULT 'info'::text NOT NULL,
  "title" text NOT NULL,
  "message" text DEFAULT ''::text NOT NULL,
  "actor_id" text,
  "actor_name" text,
  "actor_role" text,
  "terminal_id" text,
  "terminal_name" text,
  "store_id" text,
  "entity_type" text,
  "entity_id" text,
  "amount" numeric,
  "meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "whatsapp_status" text DEFAULT 'skipped'::text NOT NULL,
  "whatsapp_error" text,
  "client_event_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
ALTER TABLE public.activity_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Supervisors read activity events" ON public.activity_events;
CREATE POLICY "Supervisors read activity events" ON public.activity_events FOR SELECT TO authenticated
  USING (is_app_supervisor());
CREATE UNIQUE INDEX IF NOT EXISTS activity_events_client_event_id_key ON public.activity_events USING btree (client_event_id) WHERE (client_event_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS activity_events_created_idx ON public.activity_events USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS activity_events_store_idx ON public.activity_events USING btree (store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS activity_events_type_idx ON public.activity_events USING btree (event_type, created_at DESC);

-- ---------------------------------------------------------------- app_users
CREATE TABLE IF NOT EXISTS public.app_users (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" character varying(64) NOT NULL,
  "full_name" character varying(160) NOT NULL,
  "email" character varying(255) NOT NULL,
  "role" app_role DEFAULT 'staff'::app_role NOT NULL,
  "store_id" character varying(64),
  "is_active" boolean DEFAULT true NOT NULL,
  "permissions" jsonb DEFAULT jsonb_build_object('can_open_drawer', true, 'can_close_drawer', true, 'can_view_drawer_balance', false, 'can_process_sale', true, 'can_give_discount', false, 'can_void_item', false, 'can_hold_cart', true, 'can_process_refund', false, 'can_process_exchange', false, 'can_view_inventory', true, 'can_edit_product_price', false, 'can_add_new_product', false, 'can_receive_purchase_order', false, 'can_add_member', true, 'can_edit_member_points', false, 'can_apply_member_discount', true, 'can_view_sales_reports', false, 'can_access_pos_settings', false, 'can_manage_staff', false) NOT NULL,
  "pin_hash" text DEFAULT ''::text NOT NULL,
  "auth_user_id" uuid,
  "last_login_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "role_slug" text,
  "pin_length" smallint DEFAULT 6 NOT NULL,
  PRIMARY KEY (id)
);
DO $$ BEGIN
  ALTER TABLE public.app_users ADD CONSTRAINT app_users_user_id_key UNIQUE (user_id);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read their own staff record" ON public.app_users;
CREATE POLICY "Users can read their own staff record" ON public.app_users FOR SELECT TO authenticated
  USING ((auth_user_id = auth.uid()));
CREATE UNIQUE INDEX IF NOT EXISTS app_users_auth_user_id_key ON public.app_users USING btree (auth_user_id) WHERE (auth_user_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS app_users_email_lower_idx ON public.app_users USING btree (lower((email)::text));
CREATE INDEX IF NOT EXISTS app_users_store_idx ON public.app_users USING btree (store_id);
CREATE UNIQUE INDEX IF NOT EXISTS app_users_user_id_key ON public.app_users USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_app_users_is_active ON public.app_users USING btree (is_active);
CREATE INDEX IF NOT EXISTS idx_app_users_role_slug ON public.app_users USING btree (role_slug);

-- ---------------------------------------------------------------- audit_logs
CREATE TABLE IF NOT EXISTS public.audit_logs (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_name" text,
  "action_category" text NOT NULL,
  "action_name" text NOT NULL,
  "target_module" text,
  "details" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can append audit logs" ON public.audit_logs;
CREATE POLICY "Staff can append audit logs" ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (( SELECT is_staff_now() AS is_staff_now));
DROP POLICY IF EXISTS "Staff can read audit logs" ON public.audit_logs;
CREATE POLICY "Staff can read audit logs" ON public.audit_logs FOR SELECT TO authenticated
  USING (( SELECT is_staff_now() AS is_staff_now));
CREATE INDEX IF NOT EXISTS audit_logs_module_created_idx ON public.audit_logs USING btree (target_module, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs USING btree (created_at DESC);

-- ---------------------------------------------------------------- booking_payments
CREATE TABLE IF NOT EXISTS public.booking_payments (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "booking_id" uuid NOT NULL,
  "amount" numeric DEFAULT 0 NOT NULL,
  "method" text DEFAULT 'cash'::text NOT NULL,
  "cashier" text,
  "paid_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
DO $$ BEGIN
  ALTER TABLE public.booking_payments ADD CONSTRAINT booking_payments_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
ALTER TABLE public.booking_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Branch staff delete booking payments" ON public.booking_payments;
CREATE POLICY "Branch staff delete booking payments" ON public.booking_payments FOR DELETE TO authenticated
  USING ((( SELECT is_staff_now() AS is_staff_now) AND (EXISTS ( SELECT 1
   FROM bookings b
  WHERE ((b.id = booking_payments.booking_id) AND store_visible(b.store_id))))));
DROP POLICY IF EXISTS "Branch staff insert booking payments" ON public.booking_payments;
CREATE POLICY "Branch staff insert booking payments" ON public.booking_payments FOR INSERT TO authenticated
  WITH CHECK ((( SELECT is_staff_now() AS is_staff_now) AND (EXISTS ( SELECT 1
   FROM bookings b
  WHERE ((b.id = booking_payments.booking_id) AND user_has_store_access(b.store_id))))));
DROP POLICY IF EXISTS "Branch staff read booking payments" ON public.booking_payments;
CREATE POLICY "Branch staff read booking payments" ON public.booking_payments FOR SELECT TO authenticated
  USING ((( SELECT is_staff_now() AS is_staff_now) AND (EXISTS ( SELECT 1
   FROM bookings b
  WHERE ((b.id = booking_payments.booking_id) AND store_visible(b.store_id))))));
DROP POLICY IF EXISTS "Branch staff update booking payments" ON public.booking_payments;
CREATE POLICY "Branch staff update booking payments" ON public.booking_payments FOR UPDATE TO authenticated
  USING ((( SELECT is_staff_now() AS is_staff_now) AND (EXISTS ( SELECT 1
   FROM bookings b
  WHERE ((b.id = booking_payments.booking_id) AND store_visible(b.store_id))))))
  WITH CHECK ((( SELECT is_staff_now() AS is_staff_now) AND (EXISTS ( SELECT 1
   FROM bookings b
  WHERE ((b.id = booking_payments.booking_id) AND store_visible(b.store_id))))));
CREATE INDEX IF NOT EXISTS booking_payments_booking_idx ON public.booking_payments USING btree (booking_id);

-- ---------------------------------------------------------------- bookings
CREATE TABLE IF NOT EXISTS public.bookings (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "ref" text NOT NULL,
  "store_id" text,
  "shift_id" text,
  "customer_name" text DEFAULT ''::text NOT NULL,
  "customer_phone" text DEFAULT ''::text NOT NULL,
  "member_id" uuid,
  "service_type_id" text,
  "service_name" text,
  "service_fee" numeric DEFAULT 0 NOT NULL,
  "payment_timing" text,
  "lines" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "subtotal" numeric DEFAULT 0 NOT NULL,
  "discount" numeric DEFAULT 0 NOT NULL,
  "tax" numeric DEFAULT 0 NOT NULL,
  "total" numeric DEFAULT 0 NOT NULL,
  "paid" numeric DEFAULT 0 NOT NULL,
  "due_date" date,
  "note" text DEFAULT ''::text NOT NULL,
  "cashier" text,
  "status" text DEFAULT 'active'::text NOT NULL,
  "sale_receipt_no" text,
  "closed_at" timestamp with time zone,
  "racket_model" text,
  "string_type" text,
  "tension_main" numeric,
  "tension_cross" numeric,
  "tension_unit" text DEFAULT 'lb'::text NOT NULL,
  "grommet_notes" text,
  "job_notes" text,
  "dropped_off_at" timestamp with time zone,
  "promised_at" timestamp with time zone,
  "job_status" text DEFAULT 'received'::text NOT NULL,
  "job_status_by" text,
  "job_status_at" timestamp with time zone,
  "notify_whatsapp" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "tag_id" text,
  "intake_note" text,
  "string_origin" text,
  "string_source_product_id" uuid,
  "grip_product_id" uuid,
  "charges" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "technician" text,
  "liability_accepted" boolean DEFAULT false NOT NULL,
  "incident_note" text,
  PRIMARY KEY (id)
);
DO $$ BEGIN
  ALTER TABLE public.bookings ADD CONSTRAINT bookings_member_id_fkey FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Branch staff delete bookings" ON public.bookings;
CREATE POLICY "Branch staff delete bookings" ON public.bookings FOR DELETE TO authenticated
  USING ((( SELECT is_staff_now() AS is_staff_now) AND store_visible(store_id)));
DROP POLICY IF EXISTS "Branch staff insert bookings" ON public.bookings;
CREATE POLICY "Branch staff insert bookings" ON public.bookings FOR INSERT TO authenticated
  WITH CHECK ((( SELECT is_staff_now() AS is_staff_now) AND store_visible(store_id)));
DROP POLICY IF EXISTS "Branch staff read bookings" ON public.bookings;
CREATE POLICY "Branch staff read bookings" ON public.bookings FOR SELECT TO authenticated
  USING ((( SELECT is_staff_now() AS is_staff_now) AND store_visible(store_id)));
DROP POLICY IF EXISTS "Branch staff update bookings" ON public.bookings;
CREATE POLICY "Branch staff update bookings" ON public.bookings FOR UPDATE TO authenticated
  USING ((( SELECT is_staff_now() AS is_staff_now) AND store_visible(store_id)))
  WITH CHECK ((( SELECT is_staff_now() AS is_staff_now) AND store_visible(store_id)));
CREATE INDEX IF NOT EXISTS bookings_member_idx ON public.bookings USING btree (member_id);
CREATE INDEX IF NOT EXISTS bookings_phone_idx ON public.bookings USING btree (customer_phone);
CREATE INDEX IF NOT EXISTS bookings_ref_idx ON public.bookings USING btree (ref);
CREATE UNIQUE INDEX IF NOT EXISTS bookings_ref_key ON public.bookings USING btree (ref);
CREATE INDEX IF NOT EXISTS bookings_status_idx ON public.bookings USING btree (job_status, created_at DESC);
CREATE INDEX IF NOT EXISTS bookings_store_idx ON public.bookings USING btree (store_id);
CREATE INDEX IF NOT EXISTS bookings_store_status_created_idx ON public.bookings USING btree (store_id, job_status, created_at DESC);

-- ---------------------------------------------------------------- cashiers
CREATE TABLE IF NOT EXISTS public.cashiers (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "username" text NOT NULL,
  "full_name" text DEFAULT ''::text NOT NULL,
  "pin_hash" text NOT NULL,
  "store_id" text,
  "permissions" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "last_login_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "role_slug" text,
  PRIMARY KEY (id)
);
ALTER TABLE public.cashiers ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX IF NOT EXISTS cashiers_username_key ON public.cashiers USING btree (lower(username));

-- ---------------------------------------------------------------- coupon_campaigns
CREATE TABLE IF NOT EXISTS public.coupon_campaigns (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "discount_type" text DEFAULT 'PERCENTAGE'::text NOT NULL,
  "discount_value" numeric DEFAULT 0 NOT NULL,
  "scope" text DEFAULT 'BILL'::text NOT NULL,
  "scope_value" text,
  "max_claims" integer,
  "max_per_member" integer DEFAULT 1,
  "claims_count" integer DEFAULT 0 NOT NULL,
  "starts_at" timestamp with time zone,
  "expires_at" timestamp with time zone,
  "is_active" boolean DEFAULT true NOT NULL,
  "is_welcome" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
DO $$ BEGIN
  ALTER TABLE public.coupon_campaigns ADD CONSTRAINT coupon_campaigns_slug_key UNIQUE (slug);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.coupon_campaigns ADD CONSTRAINT coupon_campaigns_discount_type_check CHECK ((discount_type = ANY (ARRAY['PERCENTAGE'::text, 'FIXED_AMOUNT'::text])));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.coupon_campaigns ADD CONSTRAINT coupon_campaigns_scope_check CHECK ((scope = ANY (ARRAY['BILL'::text, 'CATEGORY'::text, 'PRODUCT'::text])));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
ALTER TABLE public.coupon_campaigns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "campaigns managed by staff" ON public.coupon_campaigns;
CREATE POLICY "campaigns managed by staff" ON public.coupon_campaigns FOR ALL TO authenticated
  USING (( SELECT is_staff_now() AS is_staff_now))
  WITH CHECK (( SELECT is_staff_now() AS is_staff_now));
DROP POLICY IF EXISTS "campaigns readable by staff" ON public.coupon_campaigns;
CREATE POLICY "campaigns readable by staff" ON public.coupon_campaigns FOR SELECT TO authenticated
  USING (( SELECT is_staff_now() AS is_staff_now));
DROP POLICY IF EXISTS "live campaigns readable by public" ON public.coupon_campaigns;
CREATE POLICY "live campaigns readable by public" ON public.coupon_campaigns FOR SELECT TO anon
  USING (campaign_is_live(coupon_campaigns.*));
CREATE INDEX IF NOT EXISTS coupon_campaigns_active_slug_idx ON public.coupon_campaigns USING btree (slug) WHERE is_active;
CREATE UNIQUE INDEX IF NOT EXISTS coupon_campaigns_slug_key ON public.coupon_campaigns USING btree (slug);

-- ---------------------------------------------------------------- coupon_events
CREATE TABLE IF NOT EXISTS public.coupon_events (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "event_type" text NOT NULL,
  "campaign_id" uuid,
  "campaign_name" text,
  "voucher_token" text,
  "member_id" uuid,
  "member_phone" text,
  "store_id" text,
  "terminal_id" text,
  "staff_name" text,
  "staff_role" text,
  "sale_id" text,
  "note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
DO $$ BEGIN
  ALTER TABLE public.coupon_events ADD CONSTRAINT coupon_events_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES coupon_campaigns(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.coupon_events ADD CONSTRAINT coupon_events_member_id_fkey FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.coupon_events ADD CONSTRAINT coupon_events_event_type_check CHECK ((event_type = ANY (ARRAY['CLAIMED'::text, 'ISSUED_MANUAL'::text, 'REDEEMED'::text, 'BLOCKED'::text, 'DISABLED'::text, 'REENABLED'::text])));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
ALTER TABLE public.coupon_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "coupon events readable by staff" ON public.coupon_events;
CREATE POLICY "coupon events readable by staff" ON public.coupon_events FOR SELECT TO authenticated
  USING (( SELECT is_staff_now() AS is_staff_now));
CREATE INDEX IF NOT EXISTS coupon_events_campaign_idx ON public.coupon_events USING btree (campaign_id);
CREATE INDEX IF NOT EXISTS coupon_events_created_idx ON public.coupon_events USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS coupon_events_type_created_idx ON public.coupon_events USING btree (event_type, created_at DESC);

-- ---------------------------------------------------------------- drawer_events
CREATE TABLE IF NOT EXISTS public.drawer_events (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "store_id" text,
  "terminal_id" text,
  "shift_id" text,
  "staff_id" text,
  "staff_name" text,
  "role" text,
  "reason" text NOT NULL,
  "note" text,
  "approved_by" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
ALTER TABLE public.drawer_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Branch staff append drawer events" ON public.drawer_events;
CREATE POLICY "Branch staff append drawer events" ON public.drawer_events FOR INSERT TO authenticated
  WITH CHECK ((( SELECT is_staff_now() AS is_staff_now) AND store_visible(store_id)));
DROP POLICY IF EXISTS "Branch staff read drawer events" ON public.drawer_events;
CREATE POLICY "Branch staff read drawer events" ON public.drawer_events FOR SELECT TO authenticated
  USING ((( SELECT is_staff_now() AS is_staff_now) AND store_visible(store_id)));
CREATE INDEX IF NOT EXISTS drawer_events_store_created_idx ON public.drawer_events USING btree (store_id, created_at DESC);

-- ---------------------------------------------------------------- held_orders
CREATE TABLE IF NOT EXISTS public.held_orders (
  "id" text DEFAULT (gen_random_uuid())::text NOT NULL,
  "label" text DEFAULT ''::text NOT NULL,
  "store_id" text,
  "shift_id" text,
  "held_by" text,
  "total" numeric DEFAULT 0 NOT NULL,
  "lines" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "cart_discount" numeric DEFAULT 0 NOT NULL,
  "cart_discount_type" text DEFAULT 'amount'::text NOT NULL,
  "exchange_ref" text,
  "member_id" text,
  "member_name" text,
  "coupon" jsonb,
  "note" text DEFAULT ''::text NOT NULL,
  "cancelled_from" text,
  "held_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
ALTER TABLE public.held_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Branch staff manage held orders" ON public.held_orders;
CREATE POLICY "Branch staff manage held orders" ON public.held_orders FOR ALL TO authenticated
  USING ((( SELECT is_staff_now() AS is_staff_now) AND store_visible(store_id)))
  WITH CHECK ((( SELECT is_staff_now() AS is_staff_now) AND store_visible(store_id)));
CREATE INDEX IF NOT EXISTS held_orders_store_idx ON public.held_orders USING btree (store_id);

-- ---------------------------------------------------------------- issued_vouchers
CREATE TABLE IF NOT EXISTS public.issued_vouchers (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "token_slug" text NOT NULL,
  "campaign_id" uuid NOT NULL,
  "member_id" uuid,
  "status" text DEFAULT 'ISSUED'::text NOT NULL,
  "issued_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone,
  "issued_by" text,
  "issued_source" text DEFAULT 'PUBLIC'::text NOT NULL,
  "redeemed_at" timestamp with time zone,
  "redeemed_by" text,
  "redeemed_sale_id" text,
  "disabled_at" timestamp with time zone,
  "disabled_by" text,
  "disable_reason" text,
  "store_id" text,
  PRIMARY KEY (id)
);
DO $$ BEGIN
  ALTER TABLE public.issued_vouchers ADD CONSTRAINT issued_vouchers_token_slug_key UNIQUE (token_slug);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.issued_vouchers ADD CONSTRAINT issued_vouchers_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES coupon_campaigns(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.issued_vouchers ADD CONSTRAINT issued_vouchers_member_id_fkey FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.issued_vouchers ADD CONSTRAINT issued_vouchers_status_check CHECK ((status = ANY (ARRAY['ISSUED'::text, 'REDEEMED'::text, 'EXPIRED'::text, 'DISABLED'::text])));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
ALTER TABLE public.issued_vouchers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "vouchers managed by staff" ON public.issued_vouchers;
CREATE POLICY "vouchers managed by staff" ON public.issued_vouchers FOR ALL TO authenticated
  USING (( SELECT is_staff_now() AS is_staff_now))
  WITH CHECK (( SELECT is_staff_now() AS is_staff_now));
DROP POLICY IF EXISTS "vouchers readable by staff" ON public.issued_vouchers;
CREATE POLICY "vouchers readable by staff" ON public.issued_vouchers FOR SELECT TO authenticated
  USING (( SELECT is_staff_now() AS is_staff_now));
CREATE INDEX IF NOT EXISTS issued_vouchers_active_member_idx ON public.issued_vouchers USING btree (member_id) WHERE (status = 'ISSUED'::text);
CREATE INDEX IF NOT EXISTS issued_vouchers_campaign_idx ON public.issued_vouchers USING btree (campaign_id);
CREATE INDEX IF NOT EXISTS issued_vouchers_campaign_member_idx ON public.issued_vouchers USING btree (campaign_id, member_id);
CREATE INDEX IF NOT EXISTS issued_vouchers_member_idx ON public.issued_vouchers USING btree (member_id);
CREATE UNIQUE INDEX IF NOT EXISTS issued_vouchers_token_slug_key ON public.issued_vouchers USING btree (token_slug);

-- ---------------------------------------------------------------- item_activity_logs
CREATE TABLE IF NOT EXISTS public.item_activity_logs (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "product_id" uuid,
  "product_name" text,
  "sku" text,
  "barcode" text,
  "store_id" text,
  "terminal_id" text,
  "activity_type" text NOT NULL,
  "reference" text,
  "quantity_delta" integer DEFAULT 0 NOT NULL,
  "stock_before" integer,
  "stock_after" integer,
  "unit_cost" numeric DEFAULT 0 NOT NULL,
  "staff_id" text,
  "staff_name" text,
  "role" text,
  "note" text DEFAULT ''::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
DO $$ BEGIN
  ALTER TABLE public.item_activity_logs ADD CONSTRAINT item_activity_logs_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.item_activity_logs ADD CONSTRAINT item_activity_logs_activity_type_check CHECK ((activity_type = ANY (ARRAY['sale'::text, 'return'::text, 'receive'::text, 'transfer_in'::text, 'transfer_out'::text, 'adjustment'::text, 'count'::text, 'archive'::text])));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
ALTER TABLE public.item_activity_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "item_activity_logs_insert" ON public.item_activity_logs;
CREATE POLICY "item_activity_logs_insert" ON public.item_activity_logs FOR INSERT TO authenticated
  WITH CHECK (((store_id IS NULL) OR store_visible(store_id)));
DROP POLICY IF EXISTS "item_activity_logs_read" ON public.item_activity_logs;
CREATE POLICY "item_activity_logs_read" ON public.item_activity_logs FOR SELECT TO authenticated
  USING (((store_id IS NULL) OR store_visible(store_id)));
CREATE INDEX IF NOT EXISTS item_activity_logs_created_idx ON public.item_activity_logs USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS item_activity_logs_product_idx ON public.item_activity_logs USING btree (product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS item_activity_logs_store_idx ON public.item_activity_logs USING btree (store_id, created_at DESC);

-- ---------------------------------------------------------------- members
CREATE TABLE IF NOT EXISTS public.members (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "member_code" text NOT NULL,
  "full_name" text NOT NULL,
  "phone" text NOT NULL,
  "email" text,
  "address" text,
  "date_of_birth" date,
  "tier_id" uuid,
  "loyalty_points" numeric DEFAULT 0 NOT NULL,
  "total_spent" numeric DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
DO $$ BEGIN
  ALTER TABLE public.members ADD CONSTRAINT members_member_code_key UNIQUE (member_code);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.members ADD CONSTRAINT members_phone_key UNIQUE (phone);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.members ADD CONSTRAINT members_tier_id_fkey FOREIGN KEY (tier_id) REFERENCES membership_tiers(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can delete" ON public.members;
CREATE POLICY "Staff can delete" ON public.members FOR DELETE TO authenticated
  USING (( SELECT is_staff_now() AS is_staff_now));
DROP POLICY IF EXISTS "Staff can insert" ON public.members;
CREATE POLICY "Staff can insert" ON public.members FOR INSERT TO authenticated
  WITH CHECK (( SELECT is_staff_now() AS is_staff_now));
DROP POLICY IF EXISTS "Staff can read members" ON public.members;
CREATE POLICY "Staff can read members" ON public.members FOR SELECT TO authenticated
  USING (( SELECT is_staff_now() AS is_staff_now));
DROP POLICY IF EXISTS "Staff can update" ON public.members;
CREATE POLICY "Staff can update" ON public.members FOR UPDATE TO authenticated
  USING (( SELECT is_staff_now() AS is_staff_now))
  WITH CHECK (( SELECT is_staff_now() AS is_staff_now));
CREATE INDEX IF NOT EXISTS members_code_idx ON public.members USING btree (member_code);
CREATE UNIQUE INDEX IF NOT EXISTS members_member_code_key ON public.members USING btree (member_code);
CREATE INDEX IF NOT EXISTS members_phone_idx ON public.members USING btree (phone);
CREATE UNIQUE INDEX IF NOT EXISTS members_phone_key ON public.members USING btree (phone);

-- ---------------------------------------------------------------- membership_tiers
CREATE TABLE IF NOT EXISTS public.membership_tiers (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "discount_percentage" numeric DEFAULT 0 NOT NULL,
  "points_multiplier" numeric DEFAULT 1.0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
DO $$ BEGIN
  ALTER TABLE public.membership_tiers ADD CONSTRAINT membership_tiers_name_key UNIQUE (name);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
ALTER TABLE public.membership_tiers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can delete" ON public.membership_tiers;
CREATE POLICY "Staff can delete" ON public.membership_tiers FOR DELETE TO authenticated
  USING (( SELECT is_staff_now() AS is_staff_now));
DROP POLICY IF EXISTS "Staff can insert" ON public.membership_tiers;
CREATE POLICY "Staff can insert" ON public.membership_tiers FOR INSERT TO authenticated
  WITH CHECK (( SELECT is_staff_now() AS is_staff_now));
DROP POLICY IF EXISTS "Staff can read membership tiers" ON public.membership_tiers;
CREATE POLICY "Staff can read membership tiers" ON public.membership_tiers FOR SELECT TO authenticated
  USING (( SELECT is_staff_now() AS is_staff_now));
DROP POLICY IF EXISTS "Staff can update" ON public.membership_tiers;
CREATE POLICY "Staff can update" ON public.membership_tiers FOR UPDATE TO authenticated
  USING (( SELECT is_staff_now() AS is_staff_now))
  WITH CHECK (( SELECT is_staff_now() AS is_staff_now));
CREATE UNIQUE INDEX IF NOT EXISTS membership_tiers_name_key ON public.membership_tiers USING btree (name);

-- ---------------------------------------------------------------- offline_sync_audit_log
CREATE TABLE IF NOT EXISTS public.offline_sync_audit_log (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "terminal_id" text,
  "store_id" text,
  "direction" text NOT NULL,
  "table_name" text NOT NULL,
  "record_id" text,
  "records" integer DEFAULT 0 NOT NULL,
  "status" text DEFAULT 'ok'::text NOT NULL,
  "error_message" text,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "finished_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
DO $$ BEGIN
  ALTER TABLE public.offline_sync_audit_log ADD CONSTRAINT offline_sync_audit_log_direction_check CHECK ((direction = ANY (ARRAY['push'::text, 'pull'::text])));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.offline_sync_audit_log ADD CONSTRAINT offline_sync_audit_log_status_check CHECK ((status = ANY (ARRAY['ok'::text, 'failed'::text, 'partial'::text, 'skipped'::text])));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
ALTER TABLE public.offline_sync_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "offline_sync_audit_insert" ON public.offline_sync_audit_log;
CREATE POLICY "offline_sync_audit_insert" ON public.offline_sync_audit_log FOR INSERT TO authenticated
  WITH CHECK (((store_id IS NULL) OR store_visible(store_id)));
DROP POLICY IF EXISTS "offline_sync_audit_read" ON public.offline_sync_audit_log;
CREATE POLICY "offline_sync_audit_read" ON public.offline_sync_audit_log FOR SELECT TO authenticated
  USING (((store_id IS NULL) OR store_visible(store_id)));
CREATE INDEX IF NOT EXISTS offline_sync_audit_created_idx ON public.offline_sync_audit_log USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS offline_sync_audit_terminal_idx ON public.offline_sync_audit_log USING btree (terminal_id, created_at DESC);

-- ---------------------------------------------------------------- payment_transactions
CREATE TABLE IF NOT EXISTS public.payment_transactions (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "source_type" text NOT NULL,
  "sale_id" uuid,
  "booking_id" uuid,
  "member_id" uuid,
  "store_id" text,
  "shift_id" text,
  "terminal_id" text,
  "amount" numeric DEFAULT 0 NOT NULL,
  "method" text DEFAULT 'cash'::text NOT NULL,
  "kind" text DEFAULT 'payment'::text NOT NULL,
  "reference" text,
  "cashier_id" text,
  "cashier_name" text,
  "note" text DEFAULT ''::text NOT NULL,
  "paid_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
DO $$ BEGIN
  ALTER TABLE public.payment_transactions ADD CONSTRAINT payment_transactions_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.payment_transactions ADD CONSTRAINT payment_transactions_member_id_fkey FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.payment_transactions ADD CONSTRAINT payment_transactions_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.payment_transactions ADD CONSTRAINT payment_transactions_kind_check CHECK ((kind = ANY (ARRAY['deposit'::text, 'payment'::text, 'settlement'::text, 'refund'::text, 'change'::text])));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.payment_transactions ADD CONSTRAINT payment_transactions_source_type_check CHECK ((source_type = ANY (ARRAY['sale'::text, 'booking'::text])));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "payment_transactions_read" ON public.payment_transactions;
CREATE POLICY "payment_transactions_read" ON public.payment_transactions FOR SELECT TO authenticated
  USING (((store_id IS NULL) OR store_visible(store_id)));
DROP POLICY IF EXISTS "payment_transactions_update" ON public.payment_transactions;
CREATE POLICY "payment_transactions_update" ON public.payment_transactions FOR UPDATE TO authenticated
  USING (((store_id IS NULL) OR store_visible(store_id)))
  WITH CHECK (((store_id IS NULL) OR store_visible(store_id)));
DROP POLICY IF EXISTS "payment_transactions_write" ON public.payment_transactions;
CREATE POLICY "payment_transactions_write" ON public.payment_transactions FOR INSERT TO authenticated
  WITH CHECK (((store_id IS NULL) OR store_visible(store_id)));
CREATE INDEX IF NOT EXISTS payment_transactions_booking_idx ON public.payment_transactions USING btree (booking_id);
CREATE INDEX IF NOT EXISTS payment_transactions_created_idx ON public.payment_transactions USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS payment_transactions_sale_idx ON public.payment_transactions USING btree (sale_id);
CREATE INDEX IF NOT EXISTS payment_transactions_store_idx ON public.payment_transactions USING btree (store_id, created_at DESC);

-- ---------------------------------------------------------------- pin_attempts
CREATE TABLE IF NOT EXISTS public.pin_attempts (
  "key" text NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "window_started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "locked_until" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (key)
);
ALTER TABLE public.pin_attempts ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------- pos_settings
CREATE TABLE IF NOT EXISTS public.pos_settings (
  "id" integer DEFAULT 1 NOT NULL,
  "tax_percentage" numeric DEFAULT 0 NOT NULL,
  "enable_tax" boolean DEFAULT true NOT NULL,
  "tax_mode" text DEFAULT 'exclusive'::text NOT NULL,
  "paper_size" text DEFAULT '80mm'::text NOT NULL,
  "header_text" text,
  "footer_text" text,
  "show_logo" boolean DEFAULT true NOT NULL,
  "show_points" boolean DEFAULT true NOT NULL,
  "show_barcode" boolean DEFAULT true NOT NULL,
  "show_tax_details" boolean DEFAULT true NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "company_name" text DEFAULT 'NORTHWIND & CO.'::text NOT NULL,
  "tax_number" text,
  "reg_number" text,
  "phone" text,
  "website" text,
  "fonts" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "custom_lines" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "qr" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "review_max_voids" integer DEFAULT 5 NOT NULL,
  "review_max_refunds" integer DEFAULT 3 NOT NULL,
  "review_max_refund_value" numeric DEFAULT 200 NOT NULL,
  "review_max_nosale" integer DEFAULT 5 NOT NULL,
  "review_max_discount_pct" numeric DEFAULT 15 NOT NULL,
  "day_start_time" text DEFAULT '09:00'::text NOT NULL,
  "day_end_time" text DEFAULT '22:00'::text NOT NULL,
  "max_shift_hours" numeric DEFAULT 12 NOT NULL,
  "shift_reminder_minutes" integer DEFAULT 30 NOT NULL,
  "ui_visibility" jsonb DEFAULT '{"hidden": {}}'::jsonb NOT NULL,
  "integration_settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "region_country" text DEFAULT ''::text NOT NULL,
  "time_zone" text DEFAULT ''::text NOT NULL,
  "date_format" text DEFAULT 'dd/MM/yyyy'::text NOT NULL,
  "time_format" text DEFAULT '24h'::text NOT NULL,
  "booking_slip" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "notification_settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
  PRIMARY KEY (id)
);
ALTER TABLE public.pos_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can delete" ON public.pos_settings;
CREATE POLICY "Staff can delete" ON public.pos_settings FOR DELETE TO authenticated
  USING (( SELECT is_staff_now() AS is_staff_now));
DROP POLICY IF EXISTS "Staff can insert" ON public.pos_settings;
CREATE POLICY "Staff can insert" ON public.pos_settings FOR INSERT TO authenticated
  WITH CHECK (( SELECT is_staff_now() AS is_staff_now));
DROP POLICY IF EXISTS "Staff can read pos settings" ON public.pos_settings;
CREATE POLICY "Staff can read pos settings" ON public.pos_settings FOR SELECT TO authenticated
  USING (( SELECT is_staff_now() AS is_staff_now));
DROP POLICY IF EXISTS "Staff can update" ON public.pos_settings;
CREATE POLICY "Staff can update" ON public.pos_settings FOR UPDATE TO authenticated
  USING (( SELECT is_staff_now() AS is_staff_now))
  WITH CHECK (( SELECT is_staff_now() AS is_staff_now));

-- ---------------------------------------------------------------- product_barcodes
CREATE TABLE IF NOT EXISTS public.product_barcodes (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "product_id" uuid NOT NULL,
  "barcode" text NOT NULL,
  "label" text,
  "pack_size" numeric DEFAULT 1 NOT NULL,
  "is_primary" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
DO $$ BEGIN
  ALTER TABLE public.product_barcodes ADD CONSTRAINT product_barcodes_barcode_key UNIQUE (barcode);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.product_barcodes ADD CONSTRAINT product_barcodes_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
ALTER TABLE public.product_barcodes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "product_barcodes_read" ON public.product_barcodes;
CREATE POLICY "product_barcodes_read" ON public.product_barcodes FOR SELECT TO anon,authenticated
  USING (true);
DROP POLICY IF EXISTS "product_barcodes_write" ON public.product_barcodes;
CREATE POLICY "product_barcodes_write" ON public.product_barcodes FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
CREATE UNIQUE INDEX IF NOT EXISTS product_barcodes_barcode_key ON public.product_barcodes USING btree (barcode);
CREATE INDEX IF NOT EXISTS product_barcodes_product_idx ON public.product_barcodes USING btree (product_id);

-- ---------------------------------------------------------------- product_categories
CREATE TABLE IF NOT EXISTS public.product_categories (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "parent_id" uuid,
  "sort" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "kind" text DEFAULT 'category'::text NOT NULL,
  PRIMARY KEY (id)
);
DO $$ BEGIN
  ALTER TABLE public.product_categories ADD CONSTRAINT product_categories_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES product_categories(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.product_categories ADD CONSTRAINT product_categories_kind_check CHECK ((kind = ANY (ARRAY['category'::text, 'group'::text, 'sub'::text])));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can manage product categories" ON public.product_categories;
CREATE POLICY "Staff can manage product categories" ON public.product_categories FOR ALL TO authenticated
  USING (( SELECT is_staff_now() AS is_staff_now))
  WITH CHECK (( SELECT is_staff_now() AS is_staff_now));
DROP POLICY IF EXISTS "Staff can read product categories" ON public.product_categories;
CREATE POLICY "Staff can read product categories" ON public.product_categories FOR SELECT TO authenticated
  USING (( SELECT is_staff_now() AS is_staff_now));

-- ---------------------------------------------------------------- products
CREATE TABLE IF NOT EXISTS public.products (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "barcode" text NOT NULL,
  "name" text NOT NULL,
  "category" text,
  "cost_price" numeric DEFAULT 0 NOT NULL,
  "selling_price" numeric DEFAULT 0 NOT NULL,
  "ecom_price" numeric,
  "stock_quantity" integer DEFAULT 0 NOT NULL,
  "custom_points" numeric,
  "point_multiplier" numeric DEFAULT 1.0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "sku" text,
  "reorder_level" integer DEFAULT 0 NOT NULL,
  "tax_rate" numeric DEFAULT 0 NOT NULL,
  "ecom_visible" boolean DEFAULT true NOT NULL,
  "stock_by_store" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "landing_pct" numeric,
  "sub_category" text,
  "unit" text,
  "packs" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "barcode_aliases" text[] DEFAULT '{}'::text[] NOT NULL,
  "is_archived" boolean DEFAULT false NOT NULL,
  "archived_at" timestamp with time zone,
  "brand" text,
  "product_group" text,
  "barcode_variants" jsonb DEFAULT '[]'::jsonb NOT NULL,
  PRIMARY KEY (id)
);
DO $$ BEGIN
  ALTER TABLE public.products ADD CONSTRAINT products_barcode_key UNIQUE (barcode);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can delete" ON public.products;
CREATE POLICY "Staff can delete" ON public.products FOR DELETE TO authenticated
  USING (( SELECT is_staff_now() AS is_staff_now));
DROP POLICY IF EXISTS "Staff can insert" ON public.products;
CREATE POLICY "Staff can insert" ON public.products FOR INSERT TO authenticated
  WITH CHECK (( SELECT is_staff_now() AS is_staff_now));
DROP POLICY IF EXISTS "Staff can read products" ON public.products;
CREATE POLICY "Staff can read products" ON public.products FOR SELECT TO authenticated
  USING (( SELECT is_staff_now() AS is_staff_now));
DROP POLICY IF EXISTS "Staff can update" ON public.products;
CREATE POLICY "Staff can update" ON public.products FOR UPDATE TO authenticated
  USING (( SELECT is_staff_now() AS is_staff_now))
  WITH CHECK (( SELECT is_staff_now() AS is_staff_now));
CREATE INDEX IF NOT EXISTS products_barcode_idx ON public.products USING btree (barcode);
CREATE UNIQUE INDEX IF NOT EXISTS products_barcode_key ON public.products USING btree (barcode);
CREATE INDEX IF NOT EXISTS products_category_idx ON public.products USING btree (category);
CREATE INDEX IF NOT EXISTS products_is_archived_idx ON public.products USING btree (is_archived);
CREATE INDEX IF NOT EXISTS products_name_idx ON public.products USING btree (lower(name));
CREATE INDEX IF NOT EXISTS products_sku_idx ON public.products USING btree (sku);
CREATE UNIQUE INDEX IF NOT EXISTS products_sku_unique_idx ON public.products USING btree (lower(sku)) WHERE ((sku IS NOT NULL) AND (sku <> ''::text));

-- ---------------------------------------------------------------- promotions
CREATE TABLE IF NOT EXISTS public.promotions (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "title" text NOT NULL,
  "promo_type" text NOT NULL,
  "min_spend" numeric DEFAULT 0 NOT NULL,
  "discount_percent" numeric DEFAULT 0 NOT NULL,
  "discount_amount" numeric DEFAULT 0 NOT NULL,
  "foc_product_id" uuid,
  "points_per_dollar" numeric DEFAULT 1 NOT NULL,
  "tier_rates" jsonb,
  "is_active" boolean DEFAULT true NOT NULL,
  "start_date" date,
  "end_date" date,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
DO $$ BEGIN
  ALTER TABLE public.promotions ADD CONSTRAINT promotions_foc_product_id_fkey FOREIGN KEY (foc_product_id) REFERENCES products(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can delete" ON public.promotions;
CREATE POLICY "Staff can delete" ON public.promotions FOR DELETE TO authenticated
  USING (( SELECT is_staff_now() AS is_staff_now));
DROP POLICY IF EXISTS "Staff can insert" ON public.promotions;
CREATE POLICY "Staff can insert" ON public.promotions FOR INSERT TO authenticated
  WITH CHECK (( SELECT is_staff_now() AS is_staff_now));
DROP POLICY IF EXISTS "Staff can read promotions" ON public.promotions;
CREATE POLICY "Staff can read promotions" ON public.promotions FOR SELECT TO authenticated
  USING (( SELECT is_staff_now() AS is_staff_now));
DROP POLICY IF EXISTS "Staff can update" ON public.promotions;
CREATE POLICY "Staff can update" ON public.promotions FOR UPDATE TO authenticated
  USING (( SELECT is_staff_now() AS is_staff_now))
  WITH CHECK (( SELECT is_staff_now() AS is_staff_now));

-- ---------------------------------------------------------------- public_flags
CREATE TABLE IF NOT EXISTS public.public_flags (
  "key" text NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (key)
);
ALTER TABLE public.public_flags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can read public flags" ON public.public_flags;
CREATE POLICY "Anyone can read public flags" ON public.public_flags FOR SELECT TO anon,authenticated
  USING (true);
DROP POLICY IF EXISTS "Staff can add public flags" ON public.public_flags;
CREATE POLICY "Staff can add public flags" ON public.public_flags FOR INSERT TO authenticated
  WITH CHECK (( SELECT is_staff_now() AS is_staff_now));
DROP POLICY IF EXISTS "Staff can change public flags" ON public.public_flags;
CREATE POLICY "Staff can change public flags" ON public.public_flags FOR UPDATE TO authenticated
  USING (( SELECT is_staff_now() AS is_staff_now))
  WITH CHECK (( SELECT is_staff_now() AS is_staff_now));

-- ---------------------------------------------------------------- purchase_order_items
CREATE TABLE IF NOT EXISTS public.purchase_order_items (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "po_id" uuid NOT NULL,
  "product_id" uuid,
  "barcode" text,
  "product_name" text,
  "cost_price" numeric DEFAULT 0 NOT NULL,
  "selling_price" numeric DEFAULT 0 NOT NULL,
  "quantity_received" integer DEFAULT 0 NOT NULL,
  "subtotal_cost" numeric DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "sku" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
DO $$ BEGIN
  ALTER TABLE public.purchase_order_items ADD CONSTRAINT purchase_order_items_po_id_fkey FOREIGN KEY (po_id) REFERENCES purchase_orders(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.purchase_order_items ADD CONSTRAINT purchase_order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can delete" ON public.purchase_order_items;
CREATE POLICY "Staff can delete" ON public.purchase_order_items FOR DELETE TO authenticated
  USING ((( SELECT is_staff_now() AS is_staff_now) AND (EXISTS ( SELECT 1
   FROM purchase_orders po
  WHERE ((po.id = purchase_order_items.po_id) AND ((po.store_id IS NULL) OR is_app_supervisor() OR store_visible(po.store_id)))))));
DROP POLICY IF EXISTS "Staff can insert" ON public.purchase_order_items;
CREATE POLICY "Staff can insert" ON public.purchase_order_items FOR INSERT TO authenticated
  WITH CHECK ((is_staff(auth.uid()) AND (EXISTS ( SELECT 1
   FROM purchase_orders po
  WHERE ((po.id = purchase_order_items.po_id) AND ((po.store_id IS NULL) OR is_app_supervisor() OR store_visible(po.store_id)))))));
DROP POLICY IF EXISTS "Staff can read purchase order items" ON public.purchase_order_items;
CREATE POLICY "Staff can read purchase order items" ON public.purchase_order_items FOR SELECT TO authenticated
  USING ((is_staff(auth.uid()) AND (EXISTS ( SELECT 1
   FROM purchase_orders po
  WHERE ((po.id = purchase_order_items.po_id) AND ((po.store_id IS NULL) OR is_app_supervisor() OR store_visible(po.store_id)))))));
DROP POLICY IF EXISTS "Staff can update" ON public.purchase_order_items;
CREATE POLICY "Staff can update" ON public.purchase_order_items FOR UPDATE TO authenticated
  USING ((( SELECT is_staff_now() AS is_staff_now) AND (EXISTS ( SELECT 1
   FROM purchase_orders po
  WHERE ((po.id = purchase_order_items.po_id) AND ((po.store_id IS NULL) OR is_app_supervisor() OR store_visible(po.store_id)))))))
  WITH CHECK ((( SELECT is_staff_now() AS is_staff_now) AND (EXISTS ( SELECT 1
   FROM purchase_orders po
  WHERE ((po.id = purchase_order_items.po_id) AND ((po.store_id IS NULL) OR is_app_supervisor() OR store_visible(po.store_id)))))));
CREATE INDEX IF NOT EXISTS idx_po_items_po_id ON public.purchase_order_items USING btree (po_id);
CREATE INDEX IF NOT EXISTS purchase_order_items_product_idx ON public.purchase_order_items USING btree (product_id);

-- ---------------------------------------------------------------- purchase_orders
CREATE TABLE IF NOT EXISTS public.purchase_orders (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "po_number" text NOT NULL,
  "supplier_name" text,
  "operator_name" text,
  "total_cost" numeric DEFAULT 0 NOT NULL,
  "total_items_count" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "supplier_id" uuid,
  "store_id" text,
  "store_code" text,
  "invoice_date" date,
  "invoice_entry_date" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
DO $$ BEGIN
  ALTER TABLE public.purchase_orders ADD CONSTRAINT purchase_orders_po_number_key UNIQUE (po_number);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.purchase_orders ADD CONSTRAINT purchase_orders_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES suppliers(id);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can delete" ON public.purchase_orders;
CREATE POLICY "Staff can delete" ON public.purchase_orders FOR DELETE TO authenticated
  USING ((( SELECT is_staff_now() AS is_staff_now) AND ((store_id IS NULL) OR is_app_supervisor() OR store_visible(store_id))));
DROP POLICY IF EXISTS "Staff can insert" ON public.purchase_orders;
CREATE POLICY "Staff can insert" ON public.purchase_orders FOR INSERT TO authenticated
  WITH CHECK ((is_staff(auth.uid()) AND ((store_id IS NULL) OR is_app_supervisor() OR store_visible(store_id))));
DROP POLICY IF EXISTS "Staff can read purchase orders" ON public.purchase_orders;
CREATE POLICY "Staff can read purchase orders" ON public.purchase_orders FOR SELECT TO authenticated
  USING ((is_staff(auth.uid()) AND ((store_id IS NULL) OR is_app_supervisor() OR store_visible(store_id))));
DROP POLICY IF EXISTS "Staff can update" ON public.purchase_orders;
CREATE POLICY "Staff can update" ON public.purchase_orders FOR UPDATE TO authenticated
  USING ((is_staff(auth.uid()) AND ((store_id IS NULL) OR is_app_supervisor() OR store_visible(store_id))))
  WITH CHECK ((is_staff(auth.uid()) AND ((store_id IS NULL) OR is_app_supervisor() OR store_visible(store_id))));
CREATE INDEX IF NOT EXISTS idx_purchase_orders_store_entry ON public.purchase_orders USING btree (store_id, invoice_entry_date DESC);
CREATE INDEX IF NOT EXISTS purchase_orders_entry_idx ON public.purchase_orders USING btree (invoice_entry_date DESC);
CREATE UNIQUE INDEX IF NOT EXISTS purchase_orders_po_number_key ON public.purchase_orders USING btree (po_number);
CREATE INDEX IF NOT EXISTS purchase_orders_store_idx ON public.purchase_orders USING btree (store_id);
CREATE INDEX IF NOT EXISTS purchase_orders_supplier_idx ON public.purchase_orders USING btree (supplier_id);

-- ---------------------------------------------------------------- sale_items
CREATE TABLE IF NOT EXISTS public.sale_items (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "sale_id" uuid NOT NULL,
  "product_id" uuid,
  "product_name" text NOT NULL,
  "unit_price" numeric DEFAULT 0 NOT NULL,
  "quantity" integer DEFAULT 1 NOT NULL,
  "discount_percent" numeric DEFAULT 0 NOT NULL,
  "discount_amount" numeric DEFAULT 0 NOT NULL,
  "is_return" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "tax_rate" numeric DEFAULT 0 NOT NULL,
  "is_foc" boolean DEFAULT false NOT NULL,
  "promo_id" text,
  "coupon_code" text,
  "coupon_discount" numeric DEFAULT 0 NOT NULL,
  "unit_cost" numeric DEFAULT 0 NOT NULL,
  PRIMARY KEY (id)
);
DO $$ BEGIN
  ALTER TABLE public.sale_items ADD CONSTRAINT sale_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.sale_items ADD CONSTRAINT sale_items_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Branch staff insert sale items" ON public.sale_items;
CREATE POLICY "Branch staff insert sale items" ON public.sale_items FOR INSERT TO authenticated
  WITH CHECK ((( SELECT is_staff_now() AS is_staff_now) AND (EXISTS ( SELECT 1
   FROM sales s
  WHERE ((s.id = sale_items.sale_id) AND user_has_store_access(s.store_id))))));
DROP POLICY IF EXISTS "Branch staff read sale items" ON public.sale_items;
CREATE POLICY "Branch staff read sale items" ON public.sale_items FOR SELECT TO authenticated
  USING ((( SELECT is_staff_now() AS is_staff_now) AND (EXISTS ( SELECT 1
   FROM sales s
  WHERE ((s.id = sale_items.sale_id) AND store_visible(s.store_id))))));
DROP POLICY IF EXISTS "Branch staff update sale items" ON public.sale_items;
CREATE POLICY "Branch staff update sale items" ON public.sale_items FOR UPDATE TO authenticated
  USING ((( SELECT is_staff_now() AS is_staff_now) AND (EXISTS ( SELECT 1
   FROM sales s
  WHERE ((s.id = sale_items.sale_id) AND store_visible(s.store_id))))))
  WITH CHECK ((( SELECT is_staff_now() AS is_staff_now) AND (EXISTS ( SELECT 1
   FROM sales s
  WHERE ((s.id = sale_items.sale_id) AND store_visible(s.store_id))))));
DROP POLICY IF EXISTS "Supervisors delete sale items" ON public.sale_items;
CREATE POLICY "Supervisors delete sale items" ON public.sale_items FOR DELETE TO authenticated
  USING (( SELECT is_supervisor_now() AS is_supervisor_now));
CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON public.sale_items USING btree (sale_id);
CREATE INDEX IF NOT EXISTS sale_items_created_idx ON public.sale_items USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS sale_items_product_idx ON public.sale_items USING btree (product_id);
CREATE INDEX IF NOT EXISTS sale_items_sale_idx ON public.sale_items USING btree (sale_id);

-- ---------------------------------------------------------------- sales
CREATE TABLE IF NOT EXISTS public.sales (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "bill_number" text NOT NULL,
  "member_id" uuid,
  "store_id" text,
  "cashier_name" text,
  "subtotal_amount" numeric DEFAULT 0 NOT NULL,
  "total_amount" numeric DEFAULT 0 NOT NULL,
  "discount_amount" numeric DEFAULT 0 NOT NULL,
  "tax_amount" numeric DEFAULT 0 NOT NULL,
  "payment_type" text DEFAULT 'cash'::text NOT NULL,
  "points_earned" numeric DEFAULT 0 NOT NULL,
  "points_redeemed" numeric DEFAULT 0 NOT NULL,
  "is_exchange" boolean DEFAULT false NOT NULL,
  "original_bill_number" text,
  "is_refunded" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "shift_id" text,
  "paid_amount" numeric DEFAULT 0 NOT NULL,
  "change_amount" numeric DEFAULT 0 NOT NULL,
  "exchange_credit" numeric DEFAULT 0 NOT NULL,
  "exchanged_to_bill_number" text,
  "coupon_code" text,
  "coupon_promo_id" text,
  "coupon_scope" text,
  "coupon_discount" numeric DEFAULT 0 NOT NULL,
  "payments" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "client_transaction_id" text,
  "cashier_id" text,
  "created_by" text,
  "updated_by" text,
  PRIMARY KEY (id)
);
DO $$ BEGIN
  ALTER TABLE public.sales ADD CONSTRAINT sales_bill_number_key UNIQUE (bill_number);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.sales ADD CONSTRAINT sales_member_id_fkey FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Branch staff insert sales" ON public.sales;
CREATE POLICY "Branch staff insert sales" ON public.sales FOR INSERT TO authenticated
  WITH CHECK ((( SELECT is_staff_now() AS is_staff_now) AND store_visible(store_id)));
DROP POLICY IF EXISTS "Branch staff read sales" ON public.sales;
CREATE POLICY "Branch staff read sales" ON public.sales FOR SELECT TO authenticated
  USING ((( SELECT is_staff_now() AS is_staff_now) AND store_visible(store_id)));
DROP POLICY IF EXISTS "Branch staff update sales" ON public.sales;
CREATE POLICY "Branch staff update sales" ON public.sales FOR UPDATE TO authenticated
  USING ((( SELECT is_staff_now() AS is_staff_now) AND store_visible(store_id)))
  WITH CHECK ((( SELECT is_staff_now() AS is_staff_now) AND store_visible(store_id)));
DROP POLICY IF EXISTS "Supervisors delete sales" ON public.sales;
CREATE POLICY "Supervisors delete sales" ON public.sales FOR DELETE TO authenticated
  USING (( SELECT is_supervisor_now() AS is_supervisor_now));
CREATE INDEX IF NOT EXISTS idx_sales_created_at ON public.sales USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_member_id ON public.sales USING btree (member_id);
CREATE INDEX IF NOT EXISTS sales_bill_number_idx ON public.sales USING btree (bill_number);
CREATE UNIQUE INDEX IF NOT EXISTS sales_bill_number_key ON public.sales USING btree (bill_number);
CREATE INDEX IF NOT EXISTS sales_cashier_id_idx ON public.sales USING btree (cashier_id);
CREATE UNIQUE INDEX IF NOT EXISTS sales_client_transaction_id_key ON public.sales USING btree (client_transaction_id) WHERE (client_transaction_id IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS sales_client_transaction_id_uidx ON public.sales USING btree (client_transaction_id) WHERE (client_transaction_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS sales_created_idx ON public.sales USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS sales_shift_created_idx ON public.sales USING btree (shift_id, created_at);
CREATE INDEX IF NOT EXISTS sales_shift_idx ON public.sales USING btree (shift_id);
CREATE UNIQUE INDEX IF NOT EXISTS sales_store_bill_number_key ON public.sales USING btree (COALESCE(store_id, ''::text), bill_number);
CREATE INDEX IF NOT EXISTS sales_store_created_idx ON public.sales USING btree (store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS sales_store_idx ON public.sales USING btree (store_id);

-- ---------------------------------------------------------------- secure_settings
CREATE TABLE IF NOT EXISTS public.secure_settings (
  "key" text NOT NULL,
  "ciphertext" text NOT NULL,
  "hint" text,
  "updated_by" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (key)
);
ALTER TABLE public.secure_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role manages secure settings" ON public.secure_settings;
CREATE POLICY "Service role manages secure settings" ON public.secure_settings FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- ---------------------------------------------------------------- security_findings
CREATE TABLE IF NOT EXISTS public.security_findings (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "fingerprint" text NOT NULL,
  "source" text NOT NULL,
  "severity" text DEFAULT 'medium'::text NOT NULL,
  "title" text NOT NULL,
  "detail" text DEFAULT ''::text NOT NULL,
  "deployment_ref" text,
  "status" text DEFAULT 'open'::text NOT NULL,
  "first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "acknowledged_by" text,
  "acknowledged_at" timestamp with time zone,
  "resolved_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
DO $$ BEGIN
  ALTER TABLE public.security_findings ADD CONSTRAINT security_findings_fingerprint_key UNIQUE (fingerprint);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.security_findings ADD CONSTRAINT security_findings_severity_check CHECK ((severity = ANY (ARRAY['critical'::text, 'high'::text, 'medium'::text, 'low'::text, 'info'::text])));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.security_findings ADD CONSTRAINT security_findings_source_check CHECK ((source = ANY (ARRAY['ci'::text, 'selfcheck'::text, 'manual'::text])));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.security_findings ADD CONSTRAINT security_findings_status_check CHECK ((status = ANY (ARRAY['open'::text, 'acknowledged'::text, 'resolved'::text])));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
ALTER TABLE public.security_findings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins read security findings" ON public.security_findings;
CREATE POLICY "admins read security findings" ON public.security_findings FOR SELECT TO authenticated
  USING (has_role(( SELECT auth.uid() AS uid), 'admin'::app_role));
DROP POLICY IF EXISTS "admins update security findings" ON public.security_findings;
CREATE POLICY "admins update security findings" ON public.security_findings FOR UPDATE TO authenticated
  USING (has_role(( SELECT auth.uid() AS uid), 'admin'::app_role))
  WITH CHECK (has_role(( SELECT auth.uid() AS uid), 'admin'::app_role));
CREATE UNIQUE INDEX IF NOT EXISTS security_findings_fingerprint_key ON public.security_findings USING btree (fingerprint);
CREATE INDEX IF NOT EXISTS security_findings_open_idx ON public.security_findings USING btree (severity, last_seen_at DESC) WHERE (status <> 'resolved'::text);
CREATE INDEX IF NOT EXISTS security_findings_seen_idx ON public.security_findings USING btree (last_seen_at DESC);
CREATE INDEX IF NOT EXISTS security_findings_source_idx ON public.security_findings USING btree (source, status);

-- ---------------------------------------------------------------- settings_locks
CREATE TABLE IF NOT EXISTS public.settings_locks (
  "section" text NOT NULL,
  "locked" boolean DEFAULT false NOT NULL,
  "updated_by" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (section)
);
ALTER TABLE public.settings_locks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "settings_locks_read" ON public.settings_locks;
CREATE POLICY "settings_locks_read" ON public.settings_locks FOR SELECT TO public
  USING (true);
DROP POLICY IF EXISTS "settings_locks_write" ON public.settings_locks;
CREATE POLICY "settings_locks_write" ON public.settings_locks FOR ALL TO authenticated
  USING (is_supervisor_now())
  WITH CHECK (is_supervisor_now());

-- ---------------------------------------------------------------- settings_overrides
CREATE TABLE IF NOT EXISTS public.settings_overrides (
  "scope" text DEFAULT 'BRANCH'::text NOT NULL,
  "scope_id" text DEFAULT ''::text NOT NULL,
  "section" text NOT NULL,
  "patch" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "updated_by" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (scope, scope_id, section)
);
ALTER TABLE public.settings_overrides ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "settings_overrides_private" ON public.settings_overrides;
CREATE POLICY "settings_overrides_private" ON public.settings_overrides FOR ALL TO authenticated
  USING (((scope = 'PRIVATE'::text) AND (scope_id = settings_private_key())))
  WITH CHECK (((scope = 'PRIVATE'::text) AND (scope_id = settings_private_key())));
DROP POLICY IF EXISTS "settings_overrides_read" ON public.settings_overrides;
CREATE POLICY "settings_overrides_read" ON public.settings_overrides FOR SELECT TO public
  USING (true);
DROP POLICY IF EXISTS "settings_overrides_write" ON public.settings_overrides;
CREATE POLICY "settings_overrides_write" ON public.settings_overrides FOR ALL TO authenticated
  USING (is_supervisor_now())
  WITH CHECK (is_supervisor_now());

-- ---------------------------------------------------------------- shift_sessions
CREATE TABLE IF NOT EXISTS public.shift_sessions (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "shift_id" text,
  "store_id" text NOT NULL,
  "terminal_id" text,
  "terminal_name" text,
  "staff_id" text,
  "staff_name" text NOT NULL,
  "role" text,
  "signed_in_at" timestamp with time zone DEFAULT now() NOT NULL,
  "signed_out_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
ALTER TABLE public.shift_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Branch staff insert shift sessions" ON public.shift_sessions;
CREATE POLICY "Branch staff insert shift sessions" ON public.shift_sessions FOR INSERT TO authenticated
  WITH CHECK ((( SELECT is_staff_now() AS is_staff_now) AND store_visible(store_id)));
DROP POLICY IF EXISTS "Branch staff read shift sessions" ON public.shift_sessions;
CREATE POLICY "Branch staff read shift sessions" ON public.shift_sessions FOR SELECT TO authenticated
  USING ((( SELECT is_staff_now() AS is_staff_now) AND store_visible(store_id)));
DROP POLICY IF EXISTS "Branch staff update shift sessions" ON public.shift_sessions;
CREATE POLICY "Branch staff update shift sessions" ON public.shift_sessions FOR UPDATE TO authenticated
  USING ((( SELECT is_staff_now() AS is_staff_now) AND store_visible(store_id)))
  WITH CHECK ((( SELECT is_staff_now() AS is_staff_now) AND store_visible(store_id)));
CREATE INDEX IF NOT EXISTS shift_sessions_shift_idx ON public.shift_sessions USING btree (shift_id);
CREATE INDEX IF NOT EXISTS shift_sessions_staff_idx ON public.shift_sessions USING btree (staff_id);
CREATE INDEX IF NOT EXISTS shift_sessions_store_idx ON public.shift_sessions USING btree (store_id, signed_in_at DESC);

-- ---------------------------------------------------------------- shifts
CREATE TABLE IF NOT EXISTS public.shifts (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "store_id" text NOT NULL,
  "terminal_id" text,
  "terminal_name" text,
  "opened_by_name" text DEFAULT 'Cashier'::text NOT NULL,
  "opened_by_staff_id" text,
  "opened_by_role" text,
  "closed_by_name" text,
  "closed_by_staff_id" text,
  "closed_by_role" text,
  "opened_at" timestamp with time zone DEFAULT now() NOT NULL,
  "closed_at" timestamp with time zone,
  "opening_float" numeric DEFAULT 0 NOT NULL,
  "counted_cash" numeric,
  "expected_cash" numeric,
  "note" text DEFAULT ''::text NOT NULL,
  "overdue" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "status" text DEFAULT 'OPEN'::text NOT NULL,
  "closing_float" numeric,
  "user_id" uuid,
  PRIMARY KEY (id)
);
DO $$ BEGIN
  ALTER TABLE public.shifts ADD CONSTRAINT shifts_status_check CHECK ((status = ANY (ARRAY['OPEN'::text, 'CLOSED'::text])));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Branch staff open shifts" ON public.shifts;
CREATE POLICY "Branch staff open shifts" ON public.shifts FOR INSERT TO authenticated
  WITH CHECK ((( SELECT is_staff_now() AS is_staff_now) AND store_visible(store_id)));
DROP POLICY IF EXISTS "Branch staff read shifts" ON public.shifts;
CREATE POLICY "Branch staff read shifts" ON public.shifts FOR SELECT TO authenticated
  USING ((( SELECT is_staff_now() AS is_staff_now) AND store_visible(store_id)));
DROP POLICY IF EXISTS "Branch staff update shifts" ON public.shifts;
CREATE POLICY "Branch staff update shifts" ON public.shifts FOR UPDATE TO authenticated
  USING ((( SELECT is_staff_now() AS is_staff_now) AND store_visible(store_id)))
  WITH CHECK ((( SELECT is_staff_now() AS is_staff_now) AND store_visible(store_id)));
CREATE INDEX IF NOT EXISTS shifts_open_by_store ON public.shifts USING btree (store_id) WHERE (closed_at IS NULL);
CREATE INDEX IF NOT EXISTS shifts_open_by_store_idx ON public.shifts USING btree (store_id, opened_at DESC) WHERE (status = 'OPEN'::text);
CREATE INDEX IF NOT EXISTS shifts_open_store_idx ON public.shifts USING btree (store_id) WHERE (closed_at IS NULL);

-- ---------------------------------------------------------------- sku_audit
CREATE TABLE IF NOT EXISTS public.sku_audit (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "sku" text NOT NULL,
  "product_id" uuid,
  "product_name" text,
  "source" text DEFAULT 'auto'::text NOT NULL,
  "previous_sku" text,
  "store_id" text,
  "store_name" text,
  "terminal_id" text,
  "staff_id" text,
  "staff_name" text,
  "role" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
ALTER TABLE public.sku_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can add sku audit" ON public.sku_audit;
CREATE POLICY "Staff can add sku audit" ON public.sku_audit FOR INSERT TO authenticated
  WITH CHECK (( SELECT is_staff_now() AS is_staff_now));
DROP POLICY IF EXISTS "Staff can read sku audit" ON public.sku_audit;
CREATE POLICY "Staff can read sku audit" ON public.sku_audit FOR SELECT TO authenticated
  USING (( SELECT is_staff_now() AS is_staff_now));
CREATE INDEX IF NOT EXISTS sku_audit_created_idx ON public.sku_audit USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS sku_audit_product_idx ON public.sku_audit USING btree (product_id);

-- ---------------------------------------------------------------- staff_roles
CREATE TABLE IF NOT EXISTS public.staff_roles (
  "slug" text NOT NULL,
  "name" text NOT NULL,
  "base_level" text DEFAULT 'cashier'::text NOT NULL,
  "permissions" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "is_core" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (slug)
);
DO $$ BEGIN
  ALTER TABLE public.staff_roles ADD CONSTRAINT staff_roles_base_level_valid CHECK ((base_level = ANY (ARRAY['cashier'::text, 'warehouse'::text, 'supervisor'::text, 'admin'::text])));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
ALTER TABLE public.staff_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff read roles" ON public.staff_roles;
CREATE POLICY "Staff read roles" ON public.staff_roles FOR SELECT TO authenticated
  USING (is_staff(( SELECT auth.uid() AS uid)));

-- ---------------------------------------------------------------- stock_adjustments
CREATE TABLE IF NOT EXISTS public.stock_adjustments (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "product_id" uuid,
  "product_name" text,
  "sku" text,
  "barcode" text,
  "store_id" text,
  "terminal_id" text,
  "reason" text DEFAULT 'manual'::text NOT NULL,
  "note" text DEFAULT ''::text NOT NULL,
  "previous_stock" integer DEFAULT 0 NOT NULL,
  "updated_stock" integer DEFAULT 0 NOT NULL,
  "delta" integer DEFAULT 0 NOT NULL,
  "cost_impact" numeric DEFAULT 0 NOT NULL,
  "staff_id" text,
  "staff_name" text,
  "role" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
DO $$ BEGIN
  ALTER TABLE public.stock_adjustments ADD CONSTRAINT stock_adjustments_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
ALTER TABLE public.stock_adjustments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Branch staff append stock adjustments" ON public.stock_adjustments;
CREATE POLICY "Branch staff append stock adjustments" ON public.stock_adjustments FOR INSERT TO authenticated
  WITH CHECK ((( SELECT is_staff_now() AS is_staff_now) AND store_visible(store_id)));
DROP POLICY IF EXISTS "Branch staff read stock adjustments" ON public.stock_adjustments;
CREATE POLICY "Branch staff read stock adjustments" ON public.stock_adjustments FOR SELECT TO authenticated
  USING ((( SELECT is_staff_now() AS is_staff_now) AND store_visible(store_id)));
CREATE INDEX IF NOT EXISTS stock_adjustments_created_idx ON public.stock_adjustments USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS stock_adjustments_product_idx ON public.stock_adjustments USING btree (product_id);
CREATE INDEX IF NOT EXISTS stock_adjustments_store_idx ON public.stock_adjustments USING btree (store_id, created_at DESC);

-- ---------------------------------------------------------------- stock_transfer_items
CREATE TABLE IF NOT EXISTS public.stock_transfer_items (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "transfer_id" uuid NOT NULL,
  "product_id" uuid,
  "barcode" text,
  "sku" text,
  "product_name" text,
  "quantity" integer DEFAULT 0 NOT NULL,
  "quantity_received" integer DEFAULT 0 NOT NULL,
  "unit_cost" numeric DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
DO $$ BEGIN
  ALTER TABLE public.stock_transfer_items ADD CONSTRAINT stock_transfer_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.stock_transfer_items ADD CONSTRAINT stock_transfer_items_transfer_id_fkey FOREIGN KEY (transfer_id) REFERENCES stock_transfers(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
ALTER TABLE public.stock_transfer_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Branch staff write transfer items" ON public.stock_transfer_items;
CREATE POLICY "Branch staff write transfer items" ON public.stock_transfer_items FOR ALL TO authenticated
  USING ((( SELECT is_staff_now() AS is_staff_now) AND (EXISTS ( SELECT 1
   FROM stock_transfers t
  WHERE ((t.id = stock_transfer_items.transfer_id) AND (user_has_store_access(t.from_store_id) OR user_has_store_access(t.to_store_id)))))))
  WITH CHECK ((( SELECT is_staff_now() AS is_staff_now) AND (EXISTS ( SELECT 1
   FROM stock_transfers t
  WHERE ((t.id = stock_transfer_items.transfer_id) AND (user_has_store_access(t.from_store_id) OR user_has_store_access(t.to_store_id)))))));
DROP POLICY IF EXISTS "Staff read transfer items" ON public.stock_transfer_items;
CREATE POLICY "Staff read transfer items" ON public.stock_transfer_items FOR SELECT TO authenticated
  USING (( SELECT is_staff_now() AS is_staff_now));
DROP POLICY IF EXISTS "Staff write transfer items" ON public.stock_transfer_items;
CREATE POLICY "Staff write transfer items" ON public.stock_transfer_items FOR ALL TO authenticated
  USING (( SELECT is_staff_now() AS is_staff_now))
  WITH CHECK (( SELECT is_staff_now() AS is_staff_now));
CREATE INDEX IF NOT EXISTS stock_transfer_items_transfer_idx ON public.stock_transfer_items USING btree (transfer_id);

-- ---------------------------------------------------------------- stock_transfers
CREATE TABLE IF NOT EXISTS public.stock_transfers (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "ref" text NOT NULL,
  "kind" text DEFAULT 'transfer'::text NOT NULL,
  "transfer_scope" text DEFAULT 'INTRA_GROUP'::text NOT NULL,
  "from_store_id" text NOT NULL,
  "from_store_name" text,
  "from_group_id" text,
  "to_store_id" text NOT NULL,
  "to_store_name" text,
  "to_group_id" text,
  "status" text DEFAULT 'pending'::text NOT NULL,
  "note" text DEFAULT ''::text NOT NULL,
  "created_by" text,
  "approved_by" text,
  "approved_at" timestamp with time zone,
  "received_by" text,
  "received_at" timestamp with time zone,
  "rejected_reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
DO $$ BEGIN
  ALTER TABLE public.stock_transfers ADD CONSTRAINT stock_transfers_ref_key UNIQUE (ref);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.stock_transfers ADD CONSTRAINT stock_transfers_kind_check CHECK ((kind = ANY (ARRAY['transfer'::text, 'request'::text])));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.stock_transfers ADD CONSTRAINT stock_transfers_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'pending'::text, 'approved'::text, 'in_transit'::text, 'received'::text, 'rejected'::text, 'cancelled'::text])));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.stock_transfers ADD CONSTRAINT stock_transfers_transfer_scope_check CHECK ((transfer_scope = ANY (ARRAY['INTRA_GROUP'::text, 'INTER_GROUP'::text])));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
ALTER TABLE public.stock_transfers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff raise transfers" ON public.stock_transfers;
CREATE POLICY "Staff raise transfers" ON public.stock_transfers FOR INSERT TO authenticated
  WITH CHECK (( SELECT is_staff_now() AS is_staff_now));
DROP POLICY IF EXISTS "Staff read transfers" ON public.stock_transfers;
CREATE POLICY "Staff read transfers" ON public.stock_transfers FOR SELECT TO authenticated
  USING (( SELECT is_staff_now() AS is_staff_now));
DROP POLICY IF EXISTS "Staff update transfers" ON public.stock_transfers;
CREATE POLICY "Staff update transfers" ON public.stock_transfers FOR UPDATE TO authenticated
  USING (( SELECT is_staff_now() AS is_staff_now))
  WITH CHECK (( SELECT is_staff_now() AS is_staff_now));
DROP POLICY IF EXISTS "Supervisors delete transfers" ON public.stock_transfers;
CREATE POLICY "Supervisors delete transfers" ON public.stock_transfers FOR DELETE TO authenticated
  USING (( SELECT is_supervisor_now() AS is_supervisor_now));
CREATE INDEX IF NOT EXISTS stock_transfers_from_idx ON public.stock_transfers USING btree (from_store_id);
CREATE UNIQUE INDEX IF NOT EXISTS stock_transfers_ref_key ON public.stock_transfers USING btree (ref);
CREATE INDEX IF NOT EXISTS stock_transfers_status_idx ON public.stock_transfers USING btree (status);
CREATE INDEX IF NOT EXISTS stock_transfers_to_idx ON public.stock_transfers USING btree (to_store_id);
CREATE INDEX IF NOT EXISTS stock_transfers_to_status_idx ON public.stock_transfers USING btree (to_store_id, status);

-- ---------------------------------------------------------------- stores
CREATE TABLE IF NOT EXISTS public.stores (
  "id" text NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "address" text,
  "phone" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "group_id" text,
  PRIMARY KEY (id)
);
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can delete stores" ON public.stores;
CREATE POLICY "Staff can delete stores" ON public.stores FOR DELETE TO authenticated
  USING (( SELECT is_staff_now() AS is_staff_now));
DROP POLICY IF EXISTS "Staff can insert stores" ON public.stores;
CREATE POLICY "Staff can insert stores" ON public.stores FOR INSERT TO authenticated
  WITH CHECK (( SELECT is_staff_now() AS is_staff_now));
DROP POLICY IF EXISTS "Staff can read stores" ON public.stores;
CREATE POLICY "Staff can read stores" ON public.stores FOR SELECT TO authenticated
  USING (( SELECT is_staff_now() AS is_staff_now));
DROP POLICY IF EXISTS "Staff can update stores" ON public.stores;
CREATE POLICY "Staff can update stores" ON public.stores FOR UPDATE TO authenticated
  USING (( SELECT is_staff_now() AS is_staff_now))
  WITH CHECK (( SELECT is_staff_now() AS is_staff_now));
CREATE INDEX IF NOT EXISTS stores_group_idx ON public.stores USING btree (group_id);

-- ---------------------------------------------------------------- suppliers
CREATE TABLE IF NOT EXISTS public.suppliers (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "contact_name" text,
  "phone" text,
  "email" text,
  "address" text,
  "tax_number" text,
  "notes" text,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can manage suppliers" ON public.suppliers;
CREATE POLICY "Staff can manage suppliers" ON public.suppliers FOR ALL TO authenticated
  USING (( SELECT is_staff_now() AS is_staff_now))
  WITH CHECK (( SELECT is_staff_now() AS is_staff_now));
DROP POLICY IF EXISTS "Staff can read suppliers" ON public.suppliers;
CREATE POLICY "Staff can read suppliers" ON public.suppliers FOR SELECT TO authenticated
  USING (( SELECT is_staff_now() AS is_staff_now));

-- ---------------------------------------------------------------- system_audit_logs
CREATE TABLE IF NOT EXISTS public.system_audit_logs (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "actor_id" text,
  "actor_name" text,
  "actor_role" text,
  "action_type" text NOT NULL,
  "entity_affected" text,
  "entity_id" text,
  "old_value" jsonb,
  "new_value" jsonb,
  "terminal_id" text,
  "ip_address" text,
  "store_id" text,
  "note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
ALTER TABLE public.system_audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Supervisors read the audit trail" ON public.system_audit_logs;
CREATE POLICY "Supervisors read the audit trail" ON public.system_audit_logs FOR SELECT TO authenticated
  USING (is_supervisor_now());
CREATE INDEX IF NOT EXISTS system_audit_logs_action_idx ON public.system_audit_logs USING btree (action_type);
CREATE INDEX IF NOT EXISTS system_audit_logs_actor_idx ON public.system_audit_logs USING btree (actor_id);
CREATE INDEX IF NOT EXISTS system_audit_logs_created_idx ON public.system_audit_logs USING btree (created_at DESC);

-- ---------------------------------------------------------------- terminal_tokens
CREATE TABLE IF NOT EXISTS public.terminal_tokens (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "location_id" text,
  "location_name" text,
  "device_name" text NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "activated_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "last_seen_at" timestamp with time zone,
  "reissued_at" timestamp with time zone,
  "replaced_by" uuid,
  "claimed_by_device" text,
  "claimed_at" timestamp with time zone,
  "platform" text DEFAULT 'unknown'::text NOT NULL,
  PRIMARY KEY (id)
);
DO $$ BEGIN
  ALTER TABLE public.terminal_tokens ADD CONSTRAINT terminal_tokens_location_id_fkey FOREIGN KEY (location_id) REFERENCES stores(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.terminal_tokens ADD CONSTRAINT terminal_tokens_status_check CHECK ((status = ANY (ARRAY['active'::text, 'used'::text, 'revoked'::text])));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
ALTER TABLE public.terminal_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can delete tokens" ON public.terminal_tokens;
CREATE POLICY "Staff can delete tokens" ON public.terminal_tokens FOR DELETE TO authenticated
  USING (( SELECT is_staff_now() AS is_staff_now));
DROP POLICY IF EXISTS "Staff can issue tokens" ON public.terminal_tokens;
CREATE POLICY "Staff can issue tokens" ON public.terminal_tokens FOR INSERT TO authenticated
  WITH CHECK (( SELECT is_staff_now() AS is_staff_now));
DROP POLICY IF EXISTS "Staff can manage tokens" ON public.terminal_tokens;
CREATE POLICY "Staff can manage tokens" ON public.terminal_tokens FOR UPDATE TO authenticated
  USING (( SELECT is_staff_now() AS is_staff_now))
  WITH CHECK (( SELECT is_staff_now() AS is_staff_now));
DROP POLICY IF EXISTS "Staff can read tokens" ON public.terminal_tokens;
CREATE POLICY "Staff can read tokens" ON public.terminal_tokens FOR SELECT TO authenticated
  USING (( SELECT is_staff_now() AS is_staff_now));
CREATE INDEX IF NOT EXISTS terminal_tokens_active_idx ON public.terminal_tokens USING btree (location_id) WHERE (status = 'active'::text);
CREATE INDEX IF NOT EXISTS terminal_tokens_location_idx ON public.terminal_tokens USING btree (location_id);

-- ---------------------------------------------------------------- uom_units
CREATE TABLE IF NOT EXISTS public.uom_units (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "allow_decimal" boolean DEFAULT false NOT NULL,
  "sort" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
DO $$ BEGIN
  ALTER TABLE public.uom_units ADD CONSTRAINT uom_units_code_key UNIQUE (code);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
ALTER TABLE public.uom_units ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can manage units" ON public.uom_units;
CREATE POLICY "Staff can manage units" ON public.uom_units FOR ALL TO authenticated
  USING (( SELECT is_staff_now() AS is_staff_now))
  WITH CHECK (( SELECT is_staff_now() AS is_staff_now));
DROP POLICY IF EXISTS "Staff can read units" ON public.uom_units;
CREATE POLICY "Staff can read units" ON public.uom_units FOR SELECT TO authenticated
  USING (( SELECT is_staff_now() AS is_staff_now));
CREATE UNIQUE INDEX IF NOT EXISTS uom_units_code_key ON public.uom_units USING btree (code);

-- ---------------------------------------------------------------- user_roles
CREATE TABLE IF NOT EXISTS public.user_roles (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "role" app_role NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
DO $$ BEGIN
  ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage roles" ON public.user_roles;
CREATE POLICY "Admins manage roles" ON public.user_roles FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Users can read their own roles" ON public.user_roles;
CREATE POLICY "Users can read their own roles" ON public.user_roles FOR SELECT TO authenticated
  USING ((user_id = auth.uid()));
CREATE UNIQUE INDEX IF NOT EXISTS user_roles_user_id_role_key ON public.user_roles USING btree (user_id, role);
CREATE INDEX IF NOT EXISTS user_roles_user_idx ON public.user_roles USING btree (user_id);

-- ---------------------------------------------------------------- whatsapp_queue
CREATE TABLE IF NOT EXISTS public.whatsapp_queue (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "phone_number_id" text DEFAULT ''::text NOT NULL,
  "recipient" text NOT NULL,
  "body" text DEFAULT ''::text NOT NULL,
  "reference" text,
  "store_id" text,
  "status" text DEFAULT 'QUEUED'::text NOT NULL,
  "error" text,
  "queued_at" timestamp with time zone DEFAULT now() NOT NULL,
  "sent_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);
ALTER TABLE public.whatsapp_queue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Branch staff manage whatsapp queue" ON public.whatsapp_queue;
CREATE POLICY "Branch staff manage whatsapp queue" ON public.whatsapp_queue FOR ALL TO authenticated
  USING ((( SELECT is_staff_now() AS is_staff_now) AND store_visible(store_id)))
  WITH CHECK ((( SELECT is_staff_now() AS is_staff_now) AND store_visible(store_id)));
CREATE INDEX IF NOT EXISTS whatsapp_queue_pending_idx ON public.whatsapp_queue USING btree (queued_at) WHERE (status = 'QUEUED'::text);

-- ============================================================================
--  Notes
--  1. Security-definer functions, triggers and RPCs are NOT regenerated here.
--     They remain in supabase/sql/01..39_*.sql and are unchanged by v2.
--  2. Foreign keys carry explicit actions: child rows (sale_items,
--     booking_payments, purchase_order_items, stock_transfer_items,
--     product_barcodes, payment_transactions, item_activity_logs) CASCADE with
--     their parent; referenced masters (products, members, suppliers, stores)
--     either RESTRICT or SET NULL so history is never silently destroyed.
--  3. New in v2: product_barcodes, payment_transactions, item_activity_logs,
--     offline_sync_audit_log, plus indexes on barcode, sku, phone, ref,
--     job_status, bill_number and created_at.
-- ============================================================================
