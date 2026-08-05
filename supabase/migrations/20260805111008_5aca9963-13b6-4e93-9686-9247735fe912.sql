-- ---------------------------------------------------- branch clustering ---
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS group_id text;
UPDATE public.stores SET group_id = coalesce(group_id, 'default');

-- --------------------------------------------------------- region & time ---
ALTER TABLE public.pos_settings
  ADD COLUMN IF NOT EXISTS region_country text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS time_zone text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS date_format text NOT NULL DEFAULT 'dd/MM/yyyy',
  ADD COLUMN IF NOT EXISTS time_format text NOT NULL DEFAULT '24h';

-- ------------------------------------------------------- stock transfers ---
CREATE TABLE IF NOT EXISTS public.stock_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref text NOT NULL UNIQUE,
  kind text NOT NULL DEFAULT 'transfer' CHECK (kind IN ('transfer', 'request')),
  transfer_scope text NOT NULL DEFAULT 'INTRA_GROUP'
    CHECK (transfer_scope IN ('INTRA_GROUP', 'INTER_GROUP')),
  from_store_id text NOT NULL,
  from_store_name text,
  from_group_id text,
  to_store_id text NOT NULL,
  to_store_name text,
  to_group_id text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('draft','pending','approved','in_transit','received','rejected','cancelled')),
  note text NOT NULL DEFAULT '',
  created_by text,
  approved_by text,
  approved_at timestamptz,
  received_by text,
  received_at timestamptz,
  rejected_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stock_transfers_from_idx ON public.stock_transfers (from_store_id);
CREATE INDEX IF NOT EXISTS stock_transfers_to_idx ON public.stock_transfers (to_store_id);
CREATE INDEX IF NOT EXISTS stock_transfers_status_idx ON public.stock_transfers (status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_transfers TO authenticated;
GRANT ALL ON public.stock_transfers TO service_role;
ALTER TABLE public.stock_transfers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff read transfers" ON public.stock_transfers;
CREATE POLICY "Staff read transfers" ON public.stock_transfers
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS "Staff raise transfers" ON public.stock_transfers;
CREATE POLICY "Staff raise transfers" ON public.stock_transfers
  FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS "Staff update transfers" ON public.stock_transfers;
CREATE POLICY "Staff update transfers" ON public.stock_transfers
  FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS "Supervisors delete transfers" ON public.stock_transfers;
CREATE POLICY "Supervisors delete transfers" ON public.stock_transfers
  FOR DELETE TO authenticated USING (public.is_app_supervisor());

DROP TRIGGER IF EXISTS stock_transfers_touch ON public.stock_transfers;
CREATE TRIGGER stock_transfers_touch BEFORE UPDATE ON public.stock_transfers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.stock_transfer_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id uuid NOT NULL REFERENCES public.stock_transfers(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  barcode text,
  sku text,
  product_name text,
  quantity integer NOT NULL DEFAULT 0,
  quantity_received integer NOT NULL DEFAULT 0,
  unit_cost numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stock_transfer_items_transfer_idx
  ON public.stock_transfer_items (transfer_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_transfer_items TO authenticated;
GRANT ALL ON public.stock_transfer_items TO service_role;
ALTER TABLE public.stock_transfer_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff read transfer items" ON public.stock_transfer_items;
CREATE POLICY "Staff read transfer items" ON public.stock_transfer_items
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS "Staff write transfer items" ON public.stock_transfer_items;
CREATE POLICY "Staff write transfer items" ON public.stock_transfer_items
  FOR ALL TO authenticated USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

-- ------------------------------------------------- atomic stock movement ---
CREATE OR REPLACE FUNCTION public.stock_transfer_receive(
  p_transfer_id uuid,
  p_received_by text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  t public.stock_transfers;
  it record;
  v_target uuid;
  v_qty integer;
  v_src public.products;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Only staff can receive a transfer';
  END IF;

  SELECT * INTO t FROM public.stock_transfers WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TRANSFER_NOT_FOUND'; END IF;
  IF t.status = 'received' THEN RAISE EXCEPTION 'TRANSFER_ALREADY_RECEIVED'; END IF;
  IF t.status IN ('rejected', 'cancelled') THEN RAISE EXCEPTION 'TRANSFER_CLOSED'; END IF;

  FOR it IN SELECT * FROM public.stock_transfer_items WHERE transfer_id = t.id LOOP
    v_qty := CASE WHEN it.quantity_received > 0 THEN it.quantity_received ELSE it.quantity END;
    CONTINUE WHEN v_qty <= 0;

    SELECT * INTO v_src FROM public.products WHERE id = it.product_id;
    IF NOT FOUND THEN CONTINUE; END IF;

    v_target := it.product_id;

    -- Across clusters the receiving group keeps its own catalogue entry.
    IF t.transfer_scope = 'INTER_GROUP' THEN
      SELECT id INTO v_target FROM public.products
       WHERE barcode = v_src.barcode
         AND coalesce(stock_by_store ? t.to_store_id, false)
       LIMIT 1;

      IF v_target IS NULL THEN
        v_target := it.product_id; -- same catalogue row, per-branch stock below
      END IF;
    END IF;

    -- Take stock out of the sending branch.
    UPDATE public.products
       SET stock_by_store = jsonb_set(
             coalesce(stock_by_store, '{}'::jsonb), ARRAY[t.from_store_id],
             to_jsonb(greatest(
               coalesce((stock_by_store ->> t.from_store_id)::int, 0) - v_qty, 0)), true),
           stock_quantity = greatest(stock_quantity - v_qty, 0)
     WHERE id = it.product_id;

    -- Put stock into the receiving branch.
    UPDATE public.products
       SET stock_by_store = jsonb_set(
             coalesce(stock_by_store, '{}'::jsonb), ARRAY[t.to_store_id],
             to_jsonb(coalesce((stock_by_store ->> t.to_store_id)::int, 0) + v_qty), true),
           stock_quantity = stock_quantity + v_qty
     WHERE id = v_target;

    UPDATE public.stock_transfer_items
       SET quantity_received = v_qty
     WHERE id = it.id;
  END LOOP;

  UPDATE public.stock_transfers
     SET status = 'received', received_at = now(),
         received_by = coalesce(p_received_by, received_by)
   WHERE id = t.id;
END $$;

REVOKE ALL ON FUNCTION public.stock_transfer_receive(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.stock_transfer_receive(uuid, text) TO authenticated, service_role;

-- ------------------------------------------------- public voucher lookup ---
CREATE OR REPLACE FUNCTION public.voucher_by_token(_token text)
RETURNS TABLE (
  voucher jsonb,
  campaign jsonb,
  member_name text,
  member_code text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT to_jsonb(v) - 'issued_by' - 'redeemed_by' - 'disabled_by',
         to_jsonb(c),
         coalesce(m.full_name, ''),
         coalesce(m.member_code, '')
  FROM public.issued_vouchers v
  JOIN public.coupon_campaigns c ON c.id = v.campaign_id
  LEFT JOIN public.members m ON m.id = v.member_id
  WHERE v.token_slug = _token
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.voucher_by_token(text) FROM public;
GRANT EXECUTE ON FUNCTION public.voucher_by_token(text) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';