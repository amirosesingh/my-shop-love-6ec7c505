/* --------------------------------------------------------------------------
   RETAIL POS — CURRENT PRODUCTION DATABASE UPGRADE
   Database: Supabase PostgreSQL
   Purpose: Upgrade an existing production database
   Safe for existing data: YES
   Destructive reset: NO
   Run location: Supabase SQL Editor
   Run manually: YES

   Includes the approval/attention schema changes represented by:
   - 20260904111958_84467a29-26bd-47b6-b5b0-412ec9798f34.sql
   - 20260909090000_approval_authority_limits.sql
   - 20260909130000_relative_approval_authority.sql

   This is the single manual upgrade entry point. Timestamped migrations remain
   authoritative history for Supabase CLI and automated deployments. Every
   operation below is additive or idempotent and preserves existing rows.
   -------------------------------------------------------------------------- */

BEGIN;

-- Authorization action configuration. Existing authority_limits values keep
-- their original meaning: an absolute approver maximum, never an extra amount.
ALTER TABLE public.authorization_actions
  ADD COLUMN IF NOT EXISTS allowed_roles text[] NOT NULL DEFAULT ARRAY['admin','manager']::text[],
  ADD COLUMN IF NOT EXISTS allowed_user_ids text[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS requester_roles text[] NOT NULL DEFAULT ARRAY['cashier','staff','manager','admin']::text[],
  ADD COLUMN IF NOT EXISTS requester_user_ids text[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS authority_limits jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS extra_authority jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS absolute_ceilings jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.authorization_actions
  DROP CONSTRAINT IF EXISTS authorization_actions_authority_limits_object;
ALTER TABLE public.authorization_actions
  ADD CONSTRAINT authorization_actions_authority_limits_object
  CHECK (jsonb_typeof(authority_limits) = 'object');
ALTER TABLE public.authorization_actions
  DROP CONSTRAINT IF EXISTS authorization_actions_extra_authority_object;
ALTER TABLE public.authorization_actions
  ADD CONSTRAINT authorization_actions_extra_authority_object
  CHECK (jsonb_typeof(extra_authority) = 'object');
ALTER TABLE public.authorization_actions
  DROP CONSTRAINT IF EXISTS authorization_actions_absolute_ceilings_object;
ALTER TABLE public.authorization_actions
  ADD CONSTRAINT authorization_actions_absolute_ceilings_object
  CHECK (jsonb_typeof(absolute_ceilings) = 'object');

-- Request value, decision value, immutable ticket context and delivery state.
ALTER TABLE public.authorization_requests
  ADD COLUMN IF NOT EXISTS requested_amount numeric,
  ADD COLUMN IF NOT EXISTS approved_amount numeric,
  ADD COLUMN IF NOT EXISTS requester_direct_limit numeric,
  ADD COLUMN IF NOT EXISTS value_unit text NOT NULL DEFAULT 'number',
  ADD COLUMN IF NOT EXISTS approved_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS bill_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS snapshot_hash text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS held_order_id text,
  ADD COLUMN IF NOT EXISTS notified_at timestamptz;

ALTER TABLE public.authorization_requests
  DROP CONSTRAINT IF EXISTS authorization_requests_value_unit_check;
ALTER TABLE public.authorization_requests
  ADD CONSTRAINT authorization_requests_value_unit_check
  CHECK (value_unit IN ('percent', 'currency', 'quantity', 'number'));

CREATE INDEX IF NOT EXISTS authorization_requests_requester_idx
  ON public.authorization_requests (requested_by, created_at DESC);

-- A parked ticket and the eventual sale retain their approval relationship.
ALTER TABLE public.held_orders
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'held',
  ADD COLUMN IF NOT EXISTS pending_request_id uuid;
CREATE INDEX IF NOT EXISTS held_orders_status_idx ON public.held_orders (status);

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS authorization_request_id uuid,
  ADD COLUMN IF NOT EXISTS authorized_by text,
  ADD COLUMN IF NOT EXISTS authorized_at timestamptz;

-- Notification clearing is a view marker only; it never updates source status.
ALTER TABLE public.activity_events
  ADD COLUMN IF NOT EXISTS cleared_by text[] NOT NULL DEFAULT '{}'::text[];

-- Realtime is only a delivery hint; server-side claim/consume remains authority.
DO $upgrade$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'authorization_requests'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.authorization_requests;
  END IF;
END
$upgrade$;

COMMIT;
