-- ============================================================
-- 11_audit_and_logs.sql — Activity audit trail and SKU history
-- Lucky Charms POS. Safe to run repeatedly: nothing is dropped.
-- Requires: 00_extensions_and_enums.sql, then 02_staff_and_access.sql
-- (row level security policies below call is_staff() / is_app_supervisor()).
-- ============================================================

-- ---------- tables, columns and indexes ----------
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_name text,
  action_category text NOT NULL,
  action_name text NOT NULL,
  target_module text,
  details jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
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

CREATE TABLE IF NOT EXISTS public.sku_audit (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  sku text NOT NULL,
  product_id uuid,
  product_name text,
  source text DEFAULT 'auto'::text NOT NULL,
  previous_sku text,
  store_id text,
  store_name text,
  terminal_id text,
  staff_id text,
  staff_name text,
  role text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
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

-- ---------- grants (Data API access) ----------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sku_audit TO authenticated;
GRANT ALL ON public.sku_audit TO service_role;

-- ---------- row level security ----------
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.sku_audit ENABLE ROW LEVEL SECURITY;

-- ---------- policies ----------
DROP POLICY IF EXISTS "Staff can append audit logs" ON public.audit_logs;

CREATE POLICY "Staff can append audit logs" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff can read audit logs" ON public.audit_logs;

CREATE POLICY "Staff can read audit logs" ON public.audit_logs FOR SELECT TO authenticated USING (is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff can add sku audit" ON public.sku_audit;

CREATE POLICY "Staff can add sku audit" ON public.sku_audit FOR INSERT TO authenticated WITH CHECK (is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff can read sku audit" ON public.sku_audit;

CREATE POLICY "Staff can read sku audit" ON public.sku_audit FOR SELECT TO authenticated USING (is_staff(auth.uid()));

-- ---------- verification ----------
SELECT t.name AS table_name,
       CASE WHEN to_regclass('public.' || t.name) IS NULL THEN 'MISSING' ELSE 'OK' END AS status
FROM (VALUES ('audit_logs'),('sku_audit')) AS t(name);
