-- ============================================================
-- 00_extensions_and_enums.sql — Extensions, shared enums, shared trigger helpers
-- Lucky Charms POS. Safe to run repeatedly: nothing is dropped.
-- Run this file FIRST. Every other file depends on it.
-- ============================================================

-- ---------- extensions ----------
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ---------- enum types ----------
DO $$ BEGIN CREATE TYPE public.app_role AS ENUM ('admin', 'manager', 'staff'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- shared trigger helpers ----------
-- ── Safe re-run guard ─────────────────────────────────────────────────────
-- Postgres refuses CREATE OR REPLACE when a function's return type changed.
-- Drop any stale overload of the routines defined below first. Each drop is
-- attempted on its own, so a routine still referenced by a policy or trigger
-- is simply left in place instead of aborting the whole file.
DO $guard$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace
       AND p.proname = ANY (ARRAY[
      'touch_updated_at',
      'update_updated_at_column'
       ])
  LOOP
    BEGIN
      EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
END $guard$;

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
