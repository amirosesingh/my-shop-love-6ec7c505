-- Branch isolation for stock transfers and their items.

DROP POLICY IF EXISTS "Staff read transfer items" ON public.stock_transfer_items;
DROP POLICY IF EXISTS "Staff write transfer items" ON public.stock_transfer_items;
DROP POLICY IF EXISTS "Branch staff write transfer items" ON public.stock_transfer_items;

DROP POLICY IF EXISTS "Staff read transfers" ON public.stock_transfers;
DROP POLICY IF EXISTS "Staff raise transfers" ON public.stock_transfers;
DROP POLICY IF EXISTS "Staff update transfers" ON public.stock_transfers;
DROP POLICY IF EXISTS "Supervisors delete transfers" ON public.stock_transfers;

CREATE OR REPLACE FUNCTION public.transfer_in_my_branch(_transfer_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.stock_transfers t
     WHERE t.id = _transfer_id
       AND (public.user_has_store_access(t.from_store_id)
            OR public.user_has_store_access(t.to_store_id))
  )
$$;

REVOKE ALL ON FUNCTION public.transfer_in_my_branch(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.transfer_in_my_branch(uuid) TO authenticated, service_role;

CREATE POLICY "Branch staff read transfers"
ON public.stock_transfers FOR SELECT TO authenticated
USING (
  public.is_staff_now()
  AND (public.user_has_store_access(from_store_id) OR public.user_has_store_access(to_store_id))
);

CREATE POLICY "Branch staff raise transfers"
ON public.stock_transfers FOR INSERT TO authenticated
WITH CHECK (public.is_staff_now() AND public.user_has_store_access(from_store_id));

CREATE POLICY "Branch staff update transfers"
ON public.stock_transfers FOR UPDATE TO authenticated
USING (
  public.is_staff_now()
  AND (public.user_has_store_access(from_store_id) OR public.user_has_store_access(to_store_id))
)
WITH CHECK (
  public.is_staff_now()
  AND (public.user_has_store_access(from_store_id) OR public.user_has_store_access(to_store_id))
);

CREATE POLICY "Branch supervisors delete transfers"
ON public.stock_transfers FOR DELETE TO authenticated
USING (
  public.is_supervisor_now()
  AND (public.user_has_store_access(from_store_id) OR public.user_has_store_access(to_store_id))
);

CREATE POLICY "Branch staff read transfer items"
ON public.stock_transfer_items FOR SELECT TO authenticated
USING (public.is_staff_now() AND public.transfer_in_my_branch(transfer_id));

CREATE POLICY "Branch staff add transfer items"
ON public.stock_transfer_items FOR INSERT TO authenticated
WITH CHECK (public.is_staff_now() AND public.transfer_in_my_branch(transfer_id));

CREATE POLICY "Branch staff update transfer items"
ON public.stock_transfer_items FOR UPDATE TO authenticated
USING (public.is_staff_now() AND public.transfer_in_my_branch(transfer_id))
WITH CHECK (public.is_staff_now() AND public.transfer_in_my_branch(transfer_id));

CREATE POLICY "Branch staff delete transfer items"
ON public.stock_transfer_items FOR DELETE TO authenticated
USING (public.is_staff_now() AND public.transfer_in_my_branch(transfer_id));

-- A row may never be re-pointed at a transfer the caller cannot reach.
CREATE OR REPLACE FUNCTION public.stock_transfer_items_guard_parent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW; -- server-side/service-role paths re-check the caller themselves
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.transfer_id IS DISTINCT FROM OLD.transfer_id THEN
    IF NOT public.transfer_in_my_branch(NEW.transfer_id) THEN
      RAISE EXCEPTION 'You cannot move this item onto another branch''s transfer';
    END IF;
  END IF;
  IF NOT public.transfer_in_my_branch(NEW.transfer_id) THEN
    RAISE EXCEPTION 'You can only change transfer items for your own branch';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stock_transfer_items_guard_parent ON public.stock_transfer_items;
CREATE TRIGGER stock_transfer_items_guard_parent
BEFORE INSERT OR UPDATE ON public.stock_transfer_items
FOR EACH ROW EXECUTE FUNCTION public.stock_transfer_items_guard_parent();