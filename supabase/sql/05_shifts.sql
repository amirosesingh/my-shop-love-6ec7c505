-- ============================================================
-- 05_shifts.sql — Shift open/close and staff sign-in sessions
-- Lucky Charms POS. Safe to run repeatedly: nothing is dropped.
-- Requires: 00_extensions_and_enums.sql, then 02_staff_and_access.sql
-- (row level security policies below call is_staff() / is_app_supervisor()).
-- ============================================================

-- ---------- tables, columns and indexes ----------
CREATE TABLE IF NOT EXISTS public.shift_sessions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  shift_id text,
  store_id text NOT NULL,
  terminal_id text,
  terminal_name text,
  staff_id text,
  staff_name text NOT NULL,
  role text,
  signed_in_at timestamp with time zone DEFAULT now() NOT NULL,
  signed_out_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
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
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  store_id text NOT NULL,
  terminal_id text,
  terminal_name text,
  opened_by_name text DEFAULT 'Cashier'::text NOT NULL,
  opened_by_staff_id text,
  opened_by_role text,
  closed_by_name text,
  closed_by_staff_id text,
  closed_by_role text,
  opened_at timestamp with time zone DEFAULT now() NOT NULL,
  closed_at timestamp with time zone,
  opening_float numeric DEFAULT 0 NOT NULL,
  counted_cash numeric,
  expected_cash numeric,
  note text DEFAULT ''::text NOT NULL,
  overdue boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  status text DEFAULT 'OPEN'::text NOT NULL,
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

-- ---------- functions ----------
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

-- ---------- triggers ----------
DROP TRIGGER IF EXISTS shift_sessions_set_updated_at ON public.shift_sessions;

CREATE TRIGGER shift_sessions_set_updated_at BEFORE UPDATE ON public.shift_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS shifts_set_updated_at ON public.shifts;

CREATE TRIGGER shifts_set_updated_at BEFORE UPDATE ON public.shifts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS shifts_sync_status_trg ON public.shifts;

CREATE TRIGGER shifts_sync_status_trg BEFORE INSERT OR UPDATE ON public.shifts FOR EACH ROW EXECUTE FUNCTION shifts_sync_status();

-- ---------- grants (Data API access) ----------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shifts TO authenticated;
GRANT ALL ON public.shifts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shift_sessions TO authenticated;
GRANT ALL ON public.shift_sessions TO service_role;

-- ---------- row level security ----------
ALTER TABLE public.shift_sessions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;

-- ---------- policies ----------
DROP POLICY IF EXISTS "Staff can append shift sessions" ON public.shift_sessions;

CREATE POLICY "Staff can append shift sessions" ON public.shift_sessions FOR INSERT TO authenticated WITH CHECK (is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff can read shift sessions" ON public.shift_sessions;

CREATE POLICY "Staff can read shift sessions" ON public.shift_sessions FOR SELECT TO authenticated USING (is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff can update shift sessions" ON public.shift_sessions;

CREATE POLICY "Staff can update shift sessions" ON public.shift_sessions FOR UPDATE TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff can open shifts" ON public.shifts;

CREATE POLICY "Staff can open shifts" ON public.shifts FOR INSERT TO authenticated WITH CHECK (is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff can read shifts" ON public.shifts;

CREATE POLICY "Staff can read shifts" ON public.shifts FOR SELECT TO authenticated USING (is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff can update shifts" ON public.shifts;

CREATE POLICY "Staff can update shifts" ON public.shifts FOR UPDATE TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));

-- ---------- verification ----------
SELECT t.name AS table_name,
       CASE WHEN to_regclass('public.' || t.name) IS NULL THEN 'MISSING' ELSE 'OK' END AS status
FROM (VALUES ('shifts'),('shift_sessions')) AS t(name);
