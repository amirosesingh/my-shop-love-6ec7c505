-- Defence in depth: even with a permissive access rule, a signed-in staff
-- member may never lift their own role, permissions, branch or active flag.
CREATE OR REPLACE FUNCTION public.app_users_block_self_privilege_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Server-side maintenance (service role) and administrators are unaffected.
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.auth_user_id IS NOT DISTINCT FROM auth.uid() THEN
    IF NEW.role IS DISTINCT FROM OLD.role
       OR NEW.permissions IS DISTINCT FROM OLD.permissions
       OR NEW.store_id IS DISTINCT FROM OLD.store_id
       OR NEW.is_active IS DISTINCT FROM OLD.is_active THEN
      RAISE EXCEPTION 'You cannot change your own role, permissions, branch or access.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS app_users_block_self_privilege_change ON public.app_users;
CREATE TRIGGER app_users_block_self_privilege_change
BEFORE UPDATE ON public.app_users
FOR EACH ROW EXECUTE FUNCTION public.app_users_block_self_privilege_change();

-- Nobody grants themselves a role, whatever the access rules say.
CREATE OR REPLACE FUNCTION public.user_roles_block_self_grant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  subject uuid := COALESCE(NEW.user_id, OLD.user_id);
BEGIN
  IF auth.uid() IS NOT NULL AND subject IS NOT DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'You cannot change your own role.' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS user_roles_block_self_grant ON public.user_roles;
CREATE TRIGGER user_roles_block_self_grant
BEFORE INSERT OR UPDATE OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.user_roles_block_self_grant();

-- These three tables carry protection with no access rules on purpose: they
-- are reachable only by the server. The note keeps that decision visible.
COMMENT ON TABLE public.cashiers IS
  'Server-only. Row protection is on with no access rules by design: reached solely through security-definer routines. Do not add a client-facing rule.';
COMMENT ON TABLE public.pin_attempts IS
  'Server-only. Row protection is on with no access rules by design: throttling state is written only by security-definer routines. Do not add a client-facing rule.';
COMMENT ON TABLE public.terminal_recovery_secrets IS
  'Server-only. Row protection is on with no access rules by design: device recovery material must never be readable by a signed-in client.';
