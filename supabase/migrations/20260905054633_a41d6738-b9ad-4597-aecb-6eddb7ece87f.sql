-- ---------------------------------------------------------------- groups ---
CREATE TABLE IF NOT EXISTS public.store_groups (
  id text NOT NULL PRIMARY KEY,
  code text NOT NULL,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.store_groups TO authenticated;
GRANT ALL ON public.store_groups TO service_role;

ALTER TABLE public.store_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can read store groups" ON public.store_groups;
CREATE POLICY "Staff can read store groups" ON public.store_groups
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Supervisors manage store groups" ON public.store_groups;
CREATE POLICY "Supervisors manage store groups" ON public.store_groups
  FOR INSERT TO authenticated WITH CHECK (public.is_app_supervisor());

DROP POLICY IF EXISTS "Supervisors update store groups" ON public.store_groups;
CREATE POLICY "Supervisors update store groups" ON public.store_groups
  FOR UPDATE TO authenticated USING (public.is_app_supervisor())
  WITH CHECK (public.is_app_supervisor());

DROP TRIGGER IF EXISTS store_groups_touch ON public.store_groups;
CREATE TRIGGER store_groups_touch BEFORE UPDATE ON public.store_groups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE UNIQUE INDEX IF NOT EXISTS store_groups_code_uidx
  ON public.store_groups (upper(code));

-- Keep the group ids the branches already carry, so nothing changes meaning.
INSERT INTO public.store_groups (id, code, name)
SELECT DISTINCT btrim(s.group_id),
       upper(left(regexp_replace(btrim(s.group_id), '[^a-zA-Z0-9]', '', 'g'), 12)),
       btrim(s.group_id)
  FROM public.stores s
 WHERE COALESCE(btrim(s.group_id), '') <> ''
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.store_groups (id, code, name)
VALUES ('default', 'DEFAULT', 'Default group')
ON CONFLICT (id) DO NOTHING;

UPDATE public.stores SET group_id = NULL WHERE COALESCE(btrim(group_id), '') = '';

ALTER TABLE public.stores DROP CONSTRAINT IF EXISTS stores_group_id_fkey;
ALTER TABLE public.stores
  ADD CONSTRAINT stores_group_id_fkey FOREIGN KEY (group_id)
  REFERENCES public.store_groups(id) ON UPDATE CASCADE ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS stores_group_id_idx ON public.stores (group_id);

-- --------------------------------------------------- cross-group approval ---
CREATE OR REPLACE FUNCTION public.store_group_of(_store_id text)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(NULLIF(btrim(s.group_id), ''), 'default')
    FROM public.stores s WHERE s.id = _store_id
$$;

REVOKE ALL ON FUNCTION public.store_group_of(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.store_group_of(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_cross_group_transfer(_from text, _to text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.store_group_of(_from) IS DISTINCT FROM public.store_group_of(_to)
$$;

REVOKE ALL ON FUNCTION public.is_cross_group_transfer(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_cross_group_transfer(text, text) TO authenticated, service_role;

-- Cross-group always wins; otherwise the branch/cluster/global setting decides.
CREATE OR REPLACE FUNCTION public.stock_transfer_approval_required(_store_id text, _to_store_id text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.is_cross_group_transfer(_store_id, _to_store_id)
      OR public.stock_transfer_approval_required(_store_id)
$$;

REVOKE ALL ON FUNCTION public.stock_transfer_approval_required(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stock_transfer_approval_required(text, text)
  TO authenticated, service_role;

-- Who may approve a cross-group transfer: roles plus named people.
INSERT INTO public.authorization_actions
  (action_key, scope_type, scope_id, mode, allowed_roles, allowed_user_ids, is_enabled)
VALUES
  ('cross_group_transfer_approval', 'global', '', 'required',
   ARRAY['admin','manager']::text[], ARRAY[]::text[], true)
ON CONFLICT (action_key, scope_type, scope_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.may_approve_cross_group_transfer()
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  u record;
  rule public.authorization_actions;
BEGIN
  IF public.is_app_supervisor() THEN RETURN true; END IF;
  SELECT * INTO u FROM public.current_app_user();
  IF u.id IS NULL OR NOT COALESCE(u.is_active, false) THEN RETURN false; END IF;

  SELECT * INTO rule FROM public.authorization_actions
   WHERE action_key = 'cross_group_transfer_approval'
     AND scope_type = 'global' AND scope_id = '' LIMIT 1;

  IF rule.id IS NULL OR NOT rule.is_enabled THEN
    RETURN public.has_perm('can_approve_transfer');
  END IF;

  RETURN (u.role::text = ANY (rule.allowed_roles))
      OR (COALESCE(u.user_id, '') <> '' AND u.user_id = ANY (rule.allowed_user_ids))
      OR (u.id::text = ANY (rule.allowed_user_ids));
END $$;

REVOKE ALL ON FUNCTION public.may_approve_cross_group_transfer() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.may_approve_cross_group_transfer() TO authenticated, service_role;

-- Lifecycle trigger: use the two-branch rule and guard cross-group approval.
CREATE OR REPLACE FUNCTION public.stock_transfers_enforce_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_needs_approval boolean;
  v_cross boolean;
  v_may_approve boolean := public.is_supervisor_now()
    OR public.has_perm('can_approve_transfer')
    OR public.has_perm('can_receive_transfer');
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_needs_approval := public.stock_transfer_approval_required(NEW.from_store_id, NEW.to_store_id);

    IF v_needs_approval THEN
      NEW.status := 'awaiting_approval';
    ELSIF NEW.status IS NULL OR NEW.status NOT IN ('awaiting_approval', 'approved') THEN
      NEW.status := 'approved';
    END IF;

    IF NEW.status = 'approved' AND NOT v_needs_approval THEN
      NEW.approved_by := COALESCE(NEW.approved_by, NEW.created_by);
      NEW.approved_at := COALESCE(NEW.approved_at, now());
    ELSE
      NEW.approved_by := NULL;
      NEW.approved_at := NULL;
    END IF;

    NEW.dispatched_by := NULL;
    NEW.dispatched_at := NULL;
    NEW.received_by := NULL;
    NEW.received_at := NULL;
    NEW.verified_by := NULL;
    NEW.verified_at := NULL;
    NEW.posted_at := NULL;
    NEW.closed_at := NULL;
    NEW.fulfilment := NULL;
    RETURN NEW;
  END IF;

  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  IF OLD.status IN ('rejected', 'cancelled', 'completed', 'completed_with_discrepancy') THEN
    RAISE EXCEPTION 'Transfer % is closed (%) and cannot change', OLD.ref, OLD.status
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT (
    (OLD.status = 'awaiting_approval' AND NEW.status IN ('approved', 'rejected', 'cancelled'))
    OR (OLD.status = 'approved' AND NEW.status IN ('dispatched', 'rejected', 'cancelled'))
    OR (OLD.status = 'dispatched' AND NEW.status = 'received')
    OR (OLD.status = 'received' AND NEW.status IN ('verified', 'completed', 'completed_with_discrepancy'))
    OR (OLD.status = 'verified' AND NEW.status IN ('completed', 'completed_with_discrepancy'))
  ) THEN
    RAISE EXCEPTION 'Transfer % cannot go from % to %', OLD.ref, OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;

  v_cross := public.is_cross_group_transfer(NEW.from_store_id, NEW.to_store_id);

  IF NEW.status IN ('approved', 'rejected') AND NOT v_may_approve THEN
    RAISE EXCEPTION 'You are not allowed to approve or reject transfers'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_cross AND NEW.status = 'approved' THEN
    IF NOT public.may_approve_cross_group_transfer() THEN
      RAISE EXCEPTION 'Only an authorised approver can approve a transfer between groups'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF COALESCE(btrim(NEW.approved_by), '') = ''
       OR btrim(lower(NEW.approved_by)) = btrim(lower(COALESCE(NEW.created_by, ''))) THEN
      RAISE EXCEPTION 'A transfer between groups must be approved by someone other than the requester'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF NEW.status = 'approved' THEN
    NEW.approved_at := COALESCE(NEW.approved_at, now());
  END IF;

  IF NEW.status = 'rejected' AND COALESCE(btrim(NEW.rejected_reason), '') = '' THEN
    RAISE EXCEPTION 'A rejection needs a reason' USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status = 'cancelled' AND COALESCE(btrim(NEW.cancelled_reason), '') = '' THEN
    RAISE EXCEPTION 'A cancellation needs a reason' USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status = 'completed_with_discrepancy'
     AND COALESCE(btrim(NEW.discrepancy_reason), '') = '' THEN
    RAISE EXCEPTION 'A discrepancy needs a reason' USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status = 'dispatched' THEN
    IF v_cross AND (
         COALESCE(btrim(NEW.approved_by), '') = ''
         OR NEW.approved_at IS NULL
         OR btrim(lower(NEW.approved_by)) = btrim(lower(COALESCE(NEW.created_by, '')))
       ) THEN
      RAISE EXCEPTION 'This transfer crosses groups and has no valid approval'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    NEW.dispatched_at := COALESCE(NEW.dispatched_at, now());
    NEW.closed_at := COALESCE(NEW.closed_at, now());
    NEW.fulfilment := (
      SELECT CASE
        WHEN COALESCE(SUM(COALESCE(i.quantity_dispatched, 0)), 0) = 0 THEN 'none'
        WHEN COALESCE(SUM(COALESCE(i.quantity_dispatched, 0)), 0)
             >= COALESCE(SUM(i.quantity), 0) THEN 'full'
        ELSE 'partial'
      END
      FROM public.stock_transfer_items i WHERE i.transfer_id = NEW.id
    );
  END IF;

  IF NEW.status = 'received' THEN
    NEW.received_at := COALESCE(NEW.received_at, now());
  END IF;

  IF NEW.status IN ('verified', 'completed', 'completed_with_discrepancy') THEN
    NEW.received_at := COALESCE(NEW.received_at, now());
    NEW.verified_at := COALESCE(NEW.verified_at, now());
  END IF;

  RETURN NEW;
END;
$function$;

-- Approve routine: enforce the same cross-group rules server-side.
CREATE OR REPLACE FUNCTION public.stock_transfer_approve(
  p_transfer_id uuid,
  p_approved_by text DEFAULT NULL,
  p_lines jsonb DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  t public.stock_transfers;
  v_cross boolean;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Only staff can approve a transfer';
  END IF;

  SELECT * INTO t FROM public.stock_transfers WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TRANSFER_NOT_FOUND'; END IF;
  IF t.status <> 'awaiting_approval' THEN
    RAISE EXCEPTION 'Transfer % is % and is not waiting for approval', t.ref, t.status;
  END IF;

  v_cross := public.is_cross_group_transfer(t.from_store_id, t.to_store_id);
  IF v_cross THEN
    IF NOT public.may_approve_cross_group_transfer() THEN
      RAISE EXCEPTION 'Only an authorised approver can approve a transfer between groups'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF COALESCE(btrim(p_approved_by), '') = ''
       OR btrim(lower(p_approved_by)) = btrim(lower(COALESCE(t.created_by, ''))) THEN
      RAISE EXCEPTION 'A transfer between groups must be approved by someone other than the requester'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- No list means "everything as asked for".
  UPDATE public.stock_transfer_items i
     SET quantity_approved = COALESCE(
           (SELECT (l ->> 'qty')::int FROM jsonb_array_elements(COALESCE(p_lines, '[]'::jsonb)) l
             WHERE l ->> 'product_id' = i.product_id::text LIMIT 1),
           i.quantity)
   WHERE i.transfer_id = t.id;

  UPDATE public.stock_transfers
     SET status = 'approved', approved_by = COALESCE(p_approved_by, approved_by), approved_at = now()
   WHERE id = t.id;
END $$;

REVOKE ALL ON FUNCTION public.stock_transfer_approve(uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stock_transfer_approve(uuid, text, jsonb) TO authenticated, service_role;
