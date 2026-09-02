ALTER TABLE public.stock_transfers
  ADD COLUMN IF NOT EXISTS source_request_id uuid NULL REFERENCES public.stock_transfers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS stock_transfers_source_request_idx
  ON public.stock_transfers(source_request_id) WHERE source_request_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.stock_transfers_enforce_lifecycle()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_needs_approval boolean;
  v_may_approve boolean := public.is_supervisor_now()
    OR public.has_perm('can_approve_transfer')
    OR public.has_perm('can_receive_transfer');
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_needs_approval := public.stock_transfer_approval_required(NEW.from_store_id);

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
    -- A request row is closed out by the transfer that fulfils it.
    OR (OLD.kind = 'request' AND OLD.status = 'approved'
        AND NEW.status IN ('completed', 'completed_with_discrepancy'))
    OR (OLD.status = 'dispatched' AND NEW.status = 'received')
    OR (OLD.status = 'received' AND NEW.status IN ('verified', 'completed', 'completed_with_discrepancy'))
    OR (OLD.status = 'verified' AND NEW.status IN ('completed', 'completed_with_discrepancy'))
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

  IF NEW.status = 'completed_with_discrepancy'
     AND COALESCE(btrim(NEW.discrepancy_reason), '') = '' THEN
    RAISE EXCEPTION 'A discrepancy needs a reason' USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status = 'dispatched' THEN
    NEW.dispatched_at := COALESCE(NEW.dispatched_at, now());
  END IF;

  IF NEW.status = 'received' THEN
    NEW.received_at := COALESCE(NEW.received_at, now());
  END IF;

  IF NEW.status IN ('completed', 'completed_with_discrepancy') THEN
    NEW.closed_at := COALESCE(NEW.closed_at, now());
  END IF;

  RETURN NEW;
END $function$;