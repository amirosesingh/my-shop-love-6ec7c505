-- 1) Branches carry the private-catalogue switch centrally.
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS private_catalogue boolean NOT NULL DEFAULT false;

-- 2) Products carry the branch that owns them (null = shared with everyone).
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS owner_store_id text REFERENCES public.stores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS products_owner_store_id_idx
  ON public.products (owner_store_id) WHERE owner_store_id IS NOT NULL;

-- Is this product on offer to the caller's branch?
CREATE OR REPLACE FUNCTION public.product_visible_to_me(_owner_store_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT CASE
    WHEN _owner_store_id IS NULL THEN true
    WHEN public.user_has_store_access(_owner_store_id) THEN true
    ELSE NOT EXISTS (
      SELECT 1 FROM public.stores s
       WHERE s.id = _owner_store_id AND s.private_catalogue
    )
  END
$$;

DROP POLICY IF EXISTS "Staff can read products" ON public.products;
CREATE POLICY "Staff can read products"
  ON public.products FOR SELECT TO authenticated
  USING (public.is_staff_now() AND public.product_visible_to_me(owner_store_id));

DROP POLICY IF EXISTS "Staff can update" ON public.products;
CREATE POLICY "Staff can update"
  ON public.products FOR UPDATE TO authenticated
  USING (public.is_staff_now() AND public.product_visible_to_me(owner_store_id))
  WITH CHECK (public.is_staff_now() AND public.product_visible_to_me(owner_store_id));

-- 3) Activation tokens belong to a branch, and only supervisors may issue them.
DROP POLICY IF EXISTS "Staff can read tokens" ON public.terminal_tokens;
CREATE POLICY "Staff can read tokens"
  ON public.terminal_tokens FOR SELECT TO authenticated
  USING (public.is_staff_now() AND public.user_has_store_access(location_id));

DROP POLICY IF EXISTS "Staff can issue tokens" ON public.terminal_tokens;
CREATE POLICY "Supervisors can issue tokens"
  ON public.terminal_tokens FOR INSERT TO authenticated
  WITH CHECK (public.is_supervisor_now() AND public.user_has_store_access(location_id));

DROP POLICY IF EXISTS "Staff can manage tokens" ON public.terminal_tokens;
CREATE POLICY "Supervisors can manage tokens"
  ON public.terminal_tokens FOR UPDATE TO authenticated
  USING (public.is_supervisor_now() AND public.user_has_store_access(location_id))
  WITH CHECK (public.is_supervisor_now() AND public.user_has_store_access(location_id));

DROP POLICY IF EXISTS "Staff can delete tokens" ON public.terminal_tokens;
CREATE POLICY "Supervisors can delete tokens"
  ON public.terminal_tokens FOR DELETE TO authenticated
  USING (public.is_supervisor_now() AND public.user_has_store_access(location_id));