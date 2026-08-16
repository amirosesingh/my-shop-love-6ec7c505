-- see supabase/online_schema_fix_latest.sql (appended section)
-- 20260816180000 — telemetry, audit, payment types, integrations & member OTP
CREATE TABLE IF NOT EXISTS public.branch_telemetry (
  terminal_id text PRIMARY KEY,
  store_id text,
  terminal_name text,
  staff_name text,
  staff_role text,
  db_mode text NOT NULL DEFAULT 'cloud',
  connection_status text NOT NULL DEFAULT 'online',
  storage_engine text NOT NULL DEFAULT 'cloud',
  pending_count integer NOT NULL DEFAULT 0,
  conflict_count integer NOT NULL DEFAULT 0,
  last_synced_at timestamptz,
  app_version text,
  platform text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.branch_telemetry ADD COLUMN IF NOT EXISTS branch_id text;
ALTER TABLE public.branch_telemetry ADD COLUMN IF NOT EXISTS pending_queue_count integer;
ALTER TABLE public.branch_telemetry ADD COLUMN IF NOT EXISTS last_ping timestamptz;
ALTER TABLE public.branch_telemetry ADD COLUMN IF NOT EXISTS status text;
GRANT SELECT, INSERT, UPDATE ON public.branch_telemetry TO authenticated;
GRANT ALL ON public.branch_telemetry TO service_role;
ALTER TABLE public.branch_telemetry ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.payment_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type_code text NOT NULL,
  requires_reference boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  icon text NOT NULL DEFAULT 'wallet',
  sort_order integer NOT NULL DEFAULT 0,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  row_version integer NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX IF NOT EXISTS payment_types_code_idx ON public.payment_types (type_code);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_types TO authenticated;
GRANT ALL ON public.payment_types TO service_role;
ALTER TABLE public.payment_types ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_name text,
  action_category text NOT NULL DEFAULT 'general',
  action_name text NOT NULL DEFAULT 'change',
  target_module text,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS user_id text;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS action text;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS entity text;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS before_state jsonb;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS after_state jsonb;
CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON public.audit_logs (created_at DESC);
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.integration_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_name text NOT NULL,
  api_keys_encrypted jsonb NOT NULL DEFAULT '{}'::jsonb,
  verification_channel text NOT NULL DEFAULT 'whatsapp',
  strict_verification boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  updated_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS integration_settings_provider_idx ON public.integration_settings (provider_name);
GRANT SELECT, INSERT, UPDATE ON public.integration_settings TO authenticated;
GRANT ALL ON public.integration_settings TO service_role;
ALTER TABLE public.integration_settings ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.member_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid,
  phone text,
  email text,
  channel text NOT NULL DEFAULT 'whatsapp',
  otp_code text,
  attempts integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  sent_by text,
  store_id text,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '10 minutes',
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS member_verifications_member_idx ON public.member_verifications (member_id);
CREATE INDEX IF NOT EXISTS member_verifications_created_idx ON public.member_verifications (created_at DESC);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_member_verifications_member') THEN
    DELETE FROM public.member_verifications v
     WHERE v.member_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.members m WHERE m.id = v.member_id);
    ALTER TABLE public.member_verifications
      ADD CONSTRAINT fk_member_verifications_member
      FOREIGN KEY (member_id) REFERENCES public.members(id) ON DELETE CASCADE;
  END IF;
END $$;
GRANT SELECT, INSERT, UPDATE ON public.member_verifications TO authenticated;
GRANT ALL ON public.member_verifications TO service_role;
ALTER TABLE public.member_verifications ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='branch_telemetry' AND policyname='branch_telemetry_staff_read') THEN
    CREATE POLICY branch_telemetry_staff_read ON public.branch_telemetry FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='branch_telemetry' AND policyname='branch_telemetry_staff_write') THEN
    CREATE POLICY branch_telemetry_staff_write ON public.branch_telemetry FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='branch_telemetry' AND policyname='branch_telemetry_staff_update') THEN
    CREATE POLICY branch_telemetry_staff_update ON public.branch_telemetry FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='payment_types' AND policyname='payment_types_staff_read') THEN
    CREATE POLICY payment_types_staff_read ON public.payment_types FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='payment_types' AND policyname='payment_types_staff_write') THEN
    CREATE POLICY payment_types_staff_write ON public.payment_types FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='audit_logs' AND policyname='audit_logs_staff_read') THEN
    CREATE POLICY audit_logs_staff_read ON public.audit_logs FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='audit_logs' AND policyname='audit_logs_staff_insert') THEN
    CREATE POLICY audit_logs_staff_insert ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='integration_settings' AND policyname='integration_settings_supervisor') THEN
    CREATE POLICY integration_settings_supervisor ON public.integration_settings FOR ALL TO authenticated
      USING (public.is_app_supervisor()) WITH CHECK (public.is_app_supervisor());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='member_verifications' AND policyname='member_verifications_staff_read') THEN
    CREATE POLICY member_verifications_staff_read ON public.member_verifications FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='member_verifications' AND policyname='member_verifications_staff_write') THEN
    CREATE POLICY member_verifications_staff_write ON public.member_verifications FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='member_verifications' AND policyname='member_verifications_staff_update') THEN
    CREATE POLICY member_verifications_staff_update ON public.member_verifications FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

ALTER TABLE public.members ADD COLUMN IF NOT EXISTS is_verified boolean NOT NULL DEFAULT false;
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS verified_at timestamptz;
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS verified_channel text;

ALTER TABLE public.pos_settings ADD COLUMN IF NOT EXISTS logo_data_url text;
ALTER TABLE public.pos_settings ADD COLUMN IF NOT EXISTS receipt_design jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.schema_inventory()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT jsonb_build_object(
    'at', now(),
    'tables', COALESCE((
      SELECT jsonb_agg(t ORDER BY t->>'table')
      FROM (
        SELECT jsonb_build_object(
          'table', c.relname,
          'rls', c.relrowsecurity,
          'policies', (SELECT count(*) FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=c.relname),
          'columns', (
            SELECT jsonb_agg(jsonb_build_object(
              'name', a.attname,
              'type', format_type(a.atttypid, a.atttypmod),
              'notnull', a.attnotnull,
              'has_default', a.atthasdef
            ) ORDER BY a.attnum)
            FROM pg_attribute a
            WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
          ),
          'indexes', (SELECT count(*) FROM pg_index i WHERE i.indrelid = c.oid),
          'foreign_keys', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('name', con.conname, 'definition', pg_get_constraintdef(con.oid)))
            FROM pg_constraint con WHERE con.conrelid = c.oid AND con.contype = 'f'
          ), '[]'::jsonb)
        ) AS t
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'
      ) s
    ), '[]'::jsonb),
    'functions', COALESCE((
      SELECT jsonb_agg(p.proname ORDER BY p.proname)
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
    ), '[]'::jsonb)
  );
$fn$;
REVOKE ALL ON FUNCTION public.schema_inventory() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.schema_inventory() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';