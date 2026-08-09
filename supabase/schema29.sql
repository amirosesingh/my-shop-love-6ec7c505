-- ============================================================
-- schema29.sql — cryptographic session records, idle timeouts and
-- instant revocation for every terminal (web, Windows, Android).
--
-- Additions and grants only. Nothing is dropped destructively and no
-- data is seeded. Safe to run repeatedly.
-- ============================================================

-- 1 · one row per signed-in device -------------------------------------------
-- Only the SHA-256 fingerprint of the token is stored; the raw token exists
-- solely inside the device's secure store.
CREATE TABLE IF NOT EXISTS public.user_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_token_hash text NOT NULL UNIQUE,
  /* who: a Supabase account id when there is one */
  user_id uuid,
  /* the staff/cashier username this session belongs to */
  staff_user_id text,
  kind text NOT NULL DEFAULT 'staff',
  label text,
  branch_id text,
  terminal_id text,
  platform text,
  idle_timeout_minutes integer NOT NULL DEFAULT 30,
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  is_revoked boolean NOT NULL DEFAULT false,
  revoked_at timestamptz,
  revoked_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_sessions_branch_idx ON public.user_sessions (branch_id);
CREATE INDEX IF NOT EXISTS user_sessions_terminal_idx ON public.user_sessions (terminal_id);
CREATE INDEX IF NOT EXISTS user_sessions_live_idx ON public.user_sessions (is_revoked, last_activity_at);

DROP TRIGGER IF EXISTS user_sessions_touch ON public.user_sessions;
CREATE TRIGGER user_sessions_touch BEFORE UPDATE ON public.user_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- The service key (server only) creates, touches and revokes sessions.
-- Signed-in staff may read the list so admins can see active terminals.
GRANT SELECT ON public.user_sessions TO authenticated;
GRANT ALL ON public.user_sessions TO service_role;
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Supervisors read sessions" ON public.user_sessions;
CREATE POLICY "Supervisors read sessions" ON public.user_sessions
  FOR SELECT TO authenticated USING (public.is_app_supervisor());

-- 2 · idle timeout settings ---------------------------------------------------
ALTER TABLE public.pos_store_settings
  ADD COLUMN IF NOT EXISTS idle_timeout_minutes integer NOT NULL DEFAULT 30;

ALTER TABLE public.app_users
  ADD COLUMN IF NOT EXISTS idle_timeout_minutes integer;

ALTER TABLE public.cashiers
  ADD COLUMN IF NOT EXISTS idle_timeout_minutes integer;

-- Save the global/branch default alongside the other rules.
CREATE OR REPLACE FUNCTION public.pos_rules_save_idle(_store_id text, _minutes integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_app_supervisor() THEN
    RAISE EXCEPTION 'Only supervisors can change POS rules';
  END IF;
  INSERT INTO public.pos_store_settings (store_id) VALUES (coalesce(_store_id, ''))
  ON CONFLICT (store_id) DO NOTHING;
  UPDATE public.pos_store_settings
     SET idle_timeout_minutes = greatest(1, least(1440, coalesce(_minutes, 30)))
   WHERE store_id = coalesce(_store_id, '');
END $$;

REVOKE ALL ON FUNCTION public.pos_rules_save_idle(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_rules_save_idle(text, integer) TO authenticated, service_role;

-- Per-person overrides.
CREATE OR REPLACE FUNCTION public.set_app_user_idle_timeout(p_user_id text, p_minutes integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_app_supervisor() THEN
    RAISE EXCEPTION 'Only supervisors can change idle timeouts';
  END IF;
  UPDATE public.app_users
     SET idle_timeout_minutes = CASE WHEN p_minutes IS NULL OR p_minutes <= 0 THEN NULL
                                     ELSE least(1440, p_minutes) END,
         updated_at = now()
   WHERE lower(user_id) = lower(trim(p_user_id));
END $$;

REVOKE ALL ON FUNCTION public.set_app_user_idle_timeout(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_app_user_idle_timeout(text, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_cashier_idle_timeout(p_id uuid, p_minutes integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_app_supervisor() THEN
    RAISE EXCEPTION 'Only supervisors can change idle timeouts';
  END IF;
  UPDATE public.cashiers
     SET idle_timeout_minutes = CASE WHEN p_minutes IS NULL OR p_minutes <= 0 THEN NULL
                                     ELSE least(1440, p_minutes) END
   WHERE id = p_id;
END $$;

REVOKE ALL ON FUNCTION public.set_cashier_idle_timeout(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_cashier_idle_timeout(uuid, integer) TO authenticated, service_role;

-- What the staff screen shows next to each person.
CREATE OR REPLACE FUNCTION public.staff_idle_timeouts()
RETURNS TABLE(kind text, key text, minutes integer)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 'account'::text, a.user_id::text, a.idle_timeout_minutes
    FROM public.app_users a WHERE public.is_app_supervisor()
  UNION ALL
  SELECT 'cashier'::text, c.id::text, c.idle_timeout_minutes
    FROM public.cashiers c WHERE public.is_app_supervisor()
$$;

REVOKE ALL ON FUNCTION public.staff_idle_timeouts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_idle_timeouts() TO authenticated, service_role;

-- 3 · revocation --------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sessions_revoke_for_branch(_branch_id text, _reason text DEFAULT 'branch')
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE affected integer;
BEGIN
  UPDATE public.user_sessions
     SET is_revoked = true, revoked_at = now(), revoked_reason = _reason
   WHERE branch_id = _branch_id AND is_revoked = false;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END $$;

CREATE OR REPLACE FUNCTION public.sessions_revoke_for_terminal(_terminal_id text, _reason text DEFAULT 'terminal reset')
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE affected integer;
BEGIN
  UPDATE public.user_sessions
     SET is_revoked = true, revoked_at = now(), revoked_reason = _reason
   WHERE terminal_id = _terminal_id AND is_revoked = false;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END $$;

GRANT EXECUTE ON FUNCTION public.sessions_revoke_for_branch(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sessions_revoke_for_terminal(text, text) TO authenticated, service_role;

-- Deleting a branch disconnects everything trading in it.
CREATE OR REPLACE FUNCTION public.sessions_revoke_on_branch_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.sessions_revoke_for_branch(old.id, 'branch removed');
  RETURN old;
END $$;

DROP TRIGGER IF EXISTS stores_revoke_sessions ON public.stores;
CREATE TRIGGER stores_revoke_sessions
  BEFORE DELETE ON public.stores
  FOR EACH ROW EXECUTE FUNCTION public.sessions_revoke_on_branch_delete();

-- Revoking or resetting a terminal token disconnects that till immediately.
CREATE OR REPLACE FUNCTION public.sessions_revoke_on_terminal_revoke()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF (new.revoked_at IS NOT NULL AND old.revoked_at IS NULL)
     OR (new.status = 'revoked' AND coalesce(old.status, '') <> 'revoked') THEN
    PERFORM public.sessions_revoke_for_terminal(new.id::text, 'terminal reset');
  END IF;
  RETURN new;
END $$;

DROP TRIGGER IF EXISTS terminal_tokens_revoke_sessions ON public.terminal_tokens;
CREATE TRIGGER terminal_tokens_revoke_sessions
  AFTER UPDATE ON public.terminal_tokens
  FOR EACH ROW EXECUTE FUNCTION public.sessions_revoke_on_terminal_revoke();