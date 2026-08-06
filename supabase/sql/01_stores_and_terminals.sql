-- ============================================================
-- 01_stores_and_terminals.sql — Stores, branch groups and POS terminal activation tokens
-- Lucky Charms POS. Safe to run repeatedly: nothing is dropped.
-- Requires: 00_extensions_and_enums.sql, then 02_staff_and_access.sql
-- (row level security policies below call is_staff() / is_app_supervisor()).
-- ============================================================

-- ---------- tables, columns and indexes ----------
CREATE TABLE IF NOT EXISTS public.stores (
  id text NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  address text,
  phone text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
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

CREATE TABLE IF NOT EXISTS public.terminal_tokens (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  location_id text,
  location_name text,
  device_name text NOT NULL,
  status text DEFAULT 'active'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  activated_at timestamp with time zone,
  revoked_at timestamp with time zone,
  last_seen_at timestamp with time zone,
  reissued_at timestamp with time zone,
  replaced_by uuid,
  claimed_by_device text,
  claimed_at timestamp with time zone,
  platform text DEFAULT 'unknown'::text NOT NULL,
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

-- ---------- functions ----------
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

DROP FUNCTION IF EXISTS public.terminal_token_status(uuid);

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

-- ---------- triggers ----------
DROP TRIGGER IF EXISTS update_stores_updated_at ON public.stores;

CREATE TRIGGER update_stores_updated_at BEFORE UPDATE ON public.stores FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------- grants (Data API access) ----------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stores TO authenticated;
GRANT ALL ON public.stores TO service_role;
GRANT SELECT ON public.stores TO anon;  -- public claim / storefront pages
GRANT SELECT, INSERT, UPDATE, DELETE ON public.terminal_tokens TO authenticated;
GRANT ALL ON public.terminal_tokens TO service_role;

-- ---------- row level security ----------
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.terminal_tokens ENABLE ROW LEVEL SECURITY;

-- ---------- policies ----------
DROP POLICY IF EXISTS "Staff can delete stores" ON public.stores;

CREATE POLICY "Staff can delete stores" ON public.stores FOR DELETE TO authenticated USING (is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff can insert stores" ON public.stores;

CREATE POLICY "Staff can insert stores" ON public.stores FOR INSERT TO authenticated WITH CHECK (is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff can read stores" ON public.stores;

CREATE POLICY "Staff can read stores" ON public.stores FOR SELECT TO authenticated USING (is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff can update stores" ON public.stores;

CREATE POLICY "Staff can update stores" ON public.stores FOR UPDATE TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff can delete tokens" ON public.terminal_tokens;

CREATE POLICY "Staff can delete tokens" ON public.terminal_tokens FOR DELETE TO authenticated USING (is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff can issue tokens" ON public.terminal_tokens;

CREATE POLICY "Staff can issue tokens" ON public.terminal_tokens FOR INSERT TO authenticated WITH CHECK (is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff can manage tokens" ON public.terminal_tokens;

CREATE POLICY "Staff can manage tokens" ON public.terminal_tokens FOR UPDATE TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff can read tokens" ON public.terminal_tokens;

CREATE POLICY "Staff can read tokens" ON public.terminal_tokens FOR SELECT TO authenticated USING (is_staff(auth.uid()));

-- ---------- verification ----------
SELECT t.name AS table_name,
       CASE WHEN to_regclass('public.' || t.name) IS NULL THEN 'MISSING' ELSE 'OK' END AS status
FROM (VALUES ('stores'),('terminal_tokens')) AS t(name);
