-- Quantities: how many were asked for, allowed, actually sent, actually arrived.
ALTER TABLE public.stock_transfer_items
  ADD COLUMN IF NOT EXISTS quantity_approved integer,
  ADD COLUMN IF NOT EXISTS quantity_dispatched integer;

ALTER TABLE public.stock_transfers
  ADD COLUMN IF NOT EXISTS dispatched_by text,
  ADD COLUMN IF NOT EXISTS dispatched_at timestamptz,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS fulfilment text,
  ADD COLUMN IF NOT EXISTS rejected_by text,
  ADD COLUMN IF NOT EXISTS cancelled_reason text;

-- Does this branch need a supervisor to release stock? Resolved the same way
-- the app resolves it: branch override, then cluster, then global, then on.
CREATE OR REPLACE FUNCTION public.stock_transfer_approval_required(_store_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    (SELECT (s.value #>> '{}')::boolean FROM public.settings_scoped s
      WHERE s.scope = 'BRANCH' AND s.scope_id = COALESCE(_store_id, '')
        AND s.key = 'require_transfer_approval' AND s.is_overridden),
    (SELECT (s.value #>> '{}')::boolean FROM public.settings_scoped s
      WHERE s.scope = 'CLUSTER'
        AND s.scope_id = public.settings_cluster_of('BRANCH', COALESCE(_store_id, ''))
        AND s.key = 'require_transfer_approval' AND s.is_overridden),
    (SELECT (s.value #>> '{}')::boolean FROM public.settings_scoped s
      WHERE s.scope = 'GLOBAL' AND s.scope_id = ''
        AND s.key = 'require_transfer_approval' AND s.is_overridden),
    true
  )
$$;

GRANT EXECUTE ON FUNCTION public.stock_transfer_approval_required(text) TO authenticated, service_role;

-- Old rows spoke a smaller vocabulary; bring them onto the new one before the
-- rule starts refusing anything it does not recognise.
UPDATE public.stock_transfers SET status = 'awaiting_approval' WHERE status IN ('pending', 'requested');
UPDATE public.stock_transfers SET status = 'dispatched' WHERE status = 'in_transit';

/*
  The lifecycle rule. It runs on the central database, so a terminal that sends
  an optimistic status — or one built by someone who edited the till — still
  lands in the right place.

    awaiting_approval → approved | rejected | cancelled
    approved          → dispatched | rejected | cancelled
    dispatched        → received | completed
    received          → completed
    rejected, cancelled, completed → nothing
*/
CREATE OR REPLACE FUNCTION public.stock_transfers_enforce_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_needs_approval boolean;
  v_may_approve boolean := public.is_supervisor_now()
    OR public.has_perm('can_approve_transfer')
    OR public.has_perm('can_receive_transfer');
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_needs_approval := public.stock_transfer_approval_required(NEW.from_store_id);

    -- A new note may only open in one of two places, and the setting picks which.
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

    -- Nothing has moved yet, whatever the terminal claims.
    NEW.dispatched_by := NULL;
    NEW.dispatched_at := NULL;
    NEW.received_by := NULL;
    NEW.received_at := NULL;
    NEW.closed_at := NULL;
    NEW.fulfilment := NULL;
    RETURN NEW;
  END IF;

  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  IF OLD.status IN ('rejected', 'cancelled', 'completed') THEN
    RAISE EXCEPTION 'Transfer % is closed (%) and cannot change', OLD.ref, OLD.status
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT (
    (OLD.status = 'awaiting_approval' AND NEW.status IN ('approved', 'rejected', 'cancelled'))
    OR (OLD.status = 'approved' AND NEW.status IN ('dispatched', 'rejected', 'cancelled'))
    OR (OLD.status = 'dispatched' AND NEW.status IN ('received', 'completed'))
    OR (OLD.status = 'received' AND NEW.status = 'completed')
  ) THEN
    RAISE EXCEPTION 'Transfer % cannot go from % to %', OLD.ref, OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status IN ('approved', 'rejected') AND NOT v_may_approve THEN
    RAISE EXCEPTION 'You are not allowed to approve or reject transfers'
      USING ERRCODE = 'insufficient_privilege';
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

  -- Dispatch is the point of no return: the request closes against what was
  -- actually sent, and any shortfall stays a shortfall.
  IF NEW.status = 'dispatched' THEN
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

  IF NEW.status IN ('received', 'completed') THEN
    NEW.received_at := COALESCE(NEW.received_at, now());
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stock_transfers_lifecycle ON public.stock_transfers;
CREATE TRIGGER stock_transfers_lifecycle
  BEFORE INSERT OR UPDATE ON public.stock_transfers
  FOR EACH ROW EXECUTE FUNCTION public.stock_transfers_enforce_lifecycle();

-- Quantities can only shrink as they travel: approved ≤ asked, sent ≤ approved,
-- arrived ≤ sent. Anything else is a counting error or an attempt to conjure stock.
CREATE OR REPLACE FUNCTION public.stock_transfer_items_enforce_quantities()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.quantity < 0
     OR COALESCE(NEW.quantity_approved, 0) < 0
     OR COALESCE(NEW.quantity_dispatched, 0) < 0
     OR COALESCE(NEW.quantity_received, 0) < 0 THEN
    RAISE EXCEPTION 'Transfer quantities cannot be negative' USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.quantity_approved IS NOT NULL AND NEW.quantity_approved > NEW.quantity THEN
    RAISE EXCEPTION 'Cannot approve % of % requested', NEW.quantity_approved, NEW.quantity
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.quantity_dispatched IS NOT NULL
     AND NEW.quantity_dispatched > COALESCE(NEW.quantity_approved, NEW.quantity) THEN
    RAISE EXCEPTION 'Cannot send % when only % were approved',
      NEW.quantity_dispatched, COALESCE(NEW.quantity_approved, NEW.quantity)
      USING ERRCODE = 'check_violation';
  END IF;

  IF COALESCE(NEW.quantity_received, 0) > COALESCE(NEW.quantity_dispatched, NEW.quantity) THEN
    RAISE EXCEPTION 'Cannot receive % when only % were sent',
      NEW.quantity_received, COALESCE(NEW.quantity_dispatched, NEW.quantity)
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stock_transfer_items_quantities ON public.stock_transfer_items;
CREATE TRIGGER stock_transfer_items_quantities
  BEFORE INSERT OR UPDATE ON public.stock_transfer_items
  FOR EACH ROW EXECUTE FUNCTION public.stock_transfer_items_enforce_quantities();