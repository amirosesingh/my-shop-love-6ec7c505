-- ============================================================
-- 00_extensions_and_enums.sql — Extensions, shared enums and shared trigger helpers
-- Lucky Charms POS. Safe to run repeatedly: nothing is dropped.
-- Requires 00_extensions_and_enums.sql and 02_staff_and_access.sql first.
-- ============================================================

-- ---------- functions ----------
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

-- ---------- other ----------
-- ============================================================
-- Lucky Charms POS — complete backend schema
-- Safe to run repeatedly on an existing database: nothing is dropped.
-- Paste the whole file into the SQL editor and run once.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ---------- enum types ----------
DO $$ BEGIN CREATE TYPE public.app_role AS ENUM ('admin', 'manager', 'staff'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
