-- 22 — terminal pairing hardening (v1.2.30)
--
-- Knowing a terminal's token id used to be enough to be handed that till's
-- permanent machine credentials. From now on the till proves it is the machine
-- that won the claim, revocation is pushed in real time, and the database
-- itself refuses writes from a revoked till.
--
-- Idempotent: safe to run more than once.

ALTER TABLE public.terminal_tokens
  ADD COLUMN IF NOT EXISTS claim_secret_hash text,
  ADD COLUMN IF NOT EXISTS claim_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS credentials_issued_at timestamptz,
  ADD COLUMN IF NOT EXISTS device_platform text,
  ADD COLUMN IF NOT EXISTS device_os text;

-- ---------------------------------------------------------------- claim ----
-- Atomic one-time claim. Only the first caller flips the row from `active`
-- to `used`; the proof hash it supplies is the only key that will later
-- unlock this terminal's machine credentials.
CREATE OR REPLACE FUNCTION public.terminal_token_claim(
  p_token_id uuid,
  p_device text DEFAULT NULL,
  p_proof_hash text DEFAULT NULL,
  p_platform text DEFAULT NULL,
  p_os text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  claimed boolean;
  v_location text;
BEGIN
  SELECT coalesce(location_id, '') INTO v_location
    FROM public.terminal_tokens WHERE id = p_token_id;
  IF v_location IS NULL THEN RETURN false; END IF;
  IF btrim(v_location) = '' THEN
    RAISE EXCEPTION 'TERMINAL_BRANCH_REQUIRED';
  END IF;

  UPDATE public.terminal_tokens
     SET status = 'used',
         claimed_by_device = left(coalesce(p_device, claimed_by_device), 120),
         claimed_at = now(),
         activated_at = coalesce(activated_at, now()),
         last_seen_at = now(),
         claim_secret_hash = coalesce(nullif(p_proof_hash, ''), claim_secret_hash),
         device_platform = left(coalesce(p_platform, device_platform), 40),
         device_os = left(coalesce(p_os, device_os), 120)
   WHERE id = p_token_id
     AND status = 'active'
     AND (claim_expires_at IS NULL OR claim_expires_at > now())
  RETURNING true INTO claimed;

  RETURN coalesce(claimed, false);
END;
$$;

REVOKE ALL ON FUNCTION public.terminal_token_claim(uuid, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.terminal_token_claim(uuid, text, text, text, text)
  TO anon, authenticated, service_role;

-- ------------------------------------------------- realtime revocation ----
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.terminal_tokens;
EXCEPTION WHEN duplicate_object OR undefined_object THEN NULL;
END $$;

ALTER TABLE public.terminal_tokens REPLICA IDENTITY FULL;

-- ------------------------------------------------ database-side guard -----
-- A till signs in with its own machine account, whose metadata carries the
-- token id. If that token is revoked the account can no longer write.
CREATE OR REPLACE FUNCTION public.is_terminal_active()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT CASE
    WHEN coalesce((SELECT auth.jwt()) -> 'user_metadata' ->> 'terminal_token', '') = '' THEN true
    ELSE EXISTS (
      SELECT 1 FROM public.terminal_tokens t
       WHERE t.id::text = ((SELECT auth.jwt()) -> 'user_metadata' ->> 'terminal_token')
         AND t.status IN ('active', 'used')
    )
  END
$$;

REVOKE ALL ON FUNCTION public.is_terminal_active() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_terminal_active() TO authenticated, service_role;

-- Refuse every write from a revoked till on the tables terminals write to.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'sales', 'sale_items', 'shifts', 'shift_sessions', 'held_orders',
    'bookings', 'booking_payments', 'drawer_events', 'stock_adjustments',
    'sku_audit', 'stock_transfers', 'stock_transfer_items'
  ] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_revoked_terminal_block', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO authenticated
         USING (public.is_terminal_active()) WITH CHECK (public.is_terminal_active())',
      t || '_revoked_terminal_block', t);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
