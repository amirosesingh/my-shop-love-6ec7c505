-- ============================================================
-- 06_inventory_ops.sql — Purchase orders, stock adjustments and store-to-store transfers
-- Lucky Charms POS. Safe to run repeatedly: nothing is dropped.
-- Requires: 00_extensions_and_enums.sql, then 02_staff_and_access.sql
-- (row level security policies below call is_staff() / is_app_supervisor()).
-- ============================================================

-- ---------- tables, columns and indexes ----------
CREATE TABLE IF NOT EXISTS public.purchase_order_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  po_id uuid NOT NULL,
  product_id uuid,
  barcode text,
  product_name text,
  cost_price numeric DEFAULT 0 NOT NULL,
  selling_price numeric DEFAULT 0 NOT NULL,
  quantity_received integer DEFAULT 0 NOT NULL,
  subtotal_cost numeric DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

ALTER TABLE public.purchase_order_items ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();

ALTER TABLE public.purchase_order_items ADD COLUMN IF NOT EXISTS po_id uuid;

ALTER TABLE public.purchase_order_items ADD COLUMN IF NOT EXISTS product_id uuid;

ALTER TABLE public.purchase_order_items ADD COLUMN IF NOT EXISTS barcode text;

ALTER TABLE public.purchase_order_items ADD COLUMN IF NOT EXISTS product_name text;

ALTER TABLE public.purchase_order_items ADD COLUMN IF NOT EXISTS cost_price numeric DEFAULT 0;

ALTER TABLE public.purchase_order_items ADD COLUMN IF NOT EXISTS selling_price numeric DEFAULT 0;

ALTER TABLE public.purchase_order_items ADD COLUMN IF NOT EXISTS quantity_received integer DEFAULT 0;

ALTER TABLE public.purchase_order_items ADD COLUMN IF NOT EXISTS subtotal_cost numeric DEFAULT 0;

ALTER TABLE public.purchase_order_items ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();

DO $$ BEGIN ALTER TABLE public.purchase_order_items ADD CONSTRAINT purchase_order_items_po_id_fkey FOREIGN KEY (po_id) REFERENCES purchase_orders(id) ON DELETE CASCADE; EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.purchase_order_items ADD CONSTRAINT purchase_order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL; EXCEPTION WHEN others THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_po_items_po_id ON public.purchase_order_items USING btree (po_id);

CREATE UNIQUE INDEX IF NOT EXISTS purchase_order_items_pkey ON public.purchase_order_items USING btree (id);

CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  po_number text NOT NULL,
  supplier_name text,
  operator_name text,
  total_cost numeric DEFAULT 0 NOT NULL,
  total_items_count integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  supplier_id uuid,
  PRIMARY KEY (id)
);

ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();

ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS po_number text;

ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS supplier_name text;

ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS operator_name text;

ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS total_cost numeric DEFAULT 0;

ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS total_items_count integer DEFAULT 0;

ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();

ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS supplier_id uuid;

DO $$ BEGIN ALTER TABLE public.purchase_orders ADD CONSTRAINT purchase_orders_po_number_key UNIQUE (po_number); EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.purchase_orders ADD CONSTRAINT purchase_orders_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES suppliers(id); EXCEPTION WHEN others THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS purchase_orders_pkey ON public.purchase_orders USING btree (id);

CREATE UNIQUE INDEX IF NOT EXISTS purchase_orders_po_number_key ON public.purchase_orders USING btree (po_number);

CREATE TABLE IF NOT EXISTS public.stock_adjustments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  product_id uuid,
  product_name text,
  sku text,
  barcode text,
  store_id text,
  terminal_id text,
  reason text DEFAULT 'manual'::text NOT NULL,
  note text DEFAULT ''::text NOT NULL,
  previous_stock integer DEFAULT 0 NOT NULL,
  updated_stock integer DEFAULT 0 NOT NULL,
  delta integer DEFAULT 0 NOT NULL,
  cost_impact numeric DEFAULT 0 NOT NULL,
  staff_id text,
  staff_name text,
  role text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

ALTER TABLE public.stock_adjustments ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();

ALTER TABLE public.stock_adjustments ADD COLUMN IF NOT EXISTS product_id uuid;

ALTER TABLE public.stock_adjustments ADD COLUMN IF NOT EXISTS product_name text;

ALTER TABLE public.stock_adjustments ADD COLUMN IF NOT EXISTS sku text;

ALTER TABLE public.stock_adjustments ADD COLUMN IF NOT EXISTS barcode text;

ALTER TABLE public.stock_adjustments ADD COLUMN IF NOT EXISTS store_id text;

ALTER TABLE public.stock_adjustments ADD COLUMN IF NOT EXISTS terminal_id text;

ALTER TABLE public.stock_adjustments ADD COLUMN IF NOT EXISTS reason text DEFAULT 'manual'::text;

ALTER TABLE public.stock_adjustments ADD COLUMN IF NOT EXISTS note text DEFAULT ''::text;

ALTER TABLE public.stock_adjustments ADD COLUMN IF NOT EXISTS previous_stock integer DEFAULT 0;

ALTER TABLE public.stock_adjustments ADD COLUMN IF NOT EXISTS updated_stock integer DEFAULT 0;

ALTER TABLE public.stock_adjustments ADD COLUMN IF NOT EXISTS delta integer DEFAULT 0;

ALTER TABLE public.stock_adjustments ADD COLUMN IF NOT EXISTS cost_impact numeric DEFAULT 0;

ALTER TABLE public.stock_adjustments ADD COLUMN IF NOT EXISTS staff_id text;

ALTER TABLE public.stock_adjustments ADD COLUMN IF NOT EXISTS staff_name text;

ALTER TABLE public.stock_adjustments ADD COLUMN IF NOT EXISTS role text;

ALTER TABLE public.stock_adjustments ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();

DO $$ BEGIN ALTER TABLE public.stock_adjustments ADD CONSTRAINT stock_adjustments_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL; EXCEPTION WHEN others THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS stock_adjustments_created_idx ON public.stock_adjustments USING btree (created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS stock_adjustments_pkey ON public.stock_adjustments USING btree (id);

CREATE TABLE IF NOT EXISTS public.stock_transfer_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  transfer_id uuid NOT NULL,
  product_id uuid,
  barcode text,
  sku text,
  product_name text,
  quantity integer DEFAULT 0 NOT NULL,
  quantity_received integer DEFAULT 0 NOT NULL,
  unit_cost numeric DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

ALTER TABLE public.stock_transfer_items ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();

ALTER TABLE public.stock_transfer_items ADD COLUMN IF NOT EXISTS transfer_id uuid;

ALTER TABLE public.stock_transfer_items ADD COLUMN IF NOT EXISTS product_id uuid;

ALTER TABLE public.stock_transfer_items ADD COLUMN IF NOT EXISTS barcode text;

ALTER TABLE public.stock_transfer_items ADD COLUMN IF NOT EXISTS sku text;

ALTER TABLE public.stock_transfer_items ADD COLUMN IF NOT EXISTS product_name text;

ALTER TABLE public.stock_transfer_items ADD COLUMN IF NOT EXISTS quantity integer DEFAULT 0;

ALTER TABLE public.stock_transfer_items ADD COLUMN IF NOT EXISTS quantity_received integer DEFAULT 0;

ALTER TABLE public.stock_transfer_items ADD COLUMN IF NOT EXISTS unit_cost numeric DEFAULT 0;

ALTER TABLE public.stock_transfer_items ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();

DO $$ BEGIN ALTER TABLE public.stock_transfer_items ADD CONSTRAINT stock_transfer_items_transfer_id_fkey FOREIGN KEY (transfer_id) REFERENCES stock_transfers(id) ON DELETE CASCADE; EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.stock_transfer_items ADD CONSTRAINT stock_transfer_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL; EXCEPTION WHEN others THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS stock_transfer_items_pkey ON public.stock_transfer_items USING btree (id);

CREATE INDEX IF NOT EXISTS stock_transfer_items_transfer_idx ON public.stock_transfer_items USING btree (transfer_id);

CREATE TABLE IF NOT EXISTS public.stock_transfers (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ref text NOT NULL,
  kind text DEFAULT 'transfer'::text NOT NULL,
  transfer_scope text DEFAULT 'INTRA_GROUP'::text NOT NULL,
  from_store_id text NOT NULL,
  from_store_name text,
  from_group_id text,
  to_store_id text NOT NULL,
  to_store_name text,
  to_group_id text,
  status text DEFAULT 'pending'::text NOT NULL,
  note text DEFAULT ''::text NOT NULL,
  created_by text,
  approved_by text,
  approved_at timestamp with time zone,
  received_by text,
  received_at timestamp with time zone,
  rejected_reason text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

ALTER TABLE public.stock_transfers ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();

ALTER TABLE public.stock_transfers ADD COLUMN IF NOT EXISTS ref text;

ALTER TABLE public.stock_transfers ADD COLUMN IF NOT EXISTS kind text DEFAULT 'transfer'::text;

ALTER TABLE public.stock_transfers ADD COLUMN IF NOT EXISTS transfer_scope text DEFAULT 'INTRA_GROUP'::text;

ALTER TABLE public.stock_transfers ADD COLUMN IF NOT EXISTS from_store_id text;

ALTER TABLE public.stock_transfers ADD COLUMN IF NOT EXISTS from_store_name text;

ALTER TABLE public.stock_transfers ADD COLUMN IF NOT EXISTS from_group_id text;

ALTER TABLE public.stock_transfers ADD COLUMN IF NOT EXISTS to_store_id text;

ALTER TABLE public.stock_transfers ADD COLUMN IF NOT EXISTS to_store_name text;

ALTER TABLE public.stock_transfers ADD COLUMN IF NOT EXISTS to_group_id text;

ALTER TABLE public.stock_transfers ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending'::text;

ALTER TABLE public.stock_transfers ADD COLUMN IF NOT EXISTS note text DEFAULT ''::text;

ALTER TABLE public.stock_transfers ADD COLUMN IF NOT EXISTS created_by text;

ALTER TABLE public.stock_transfers ADD COLUMN IF NOT EXISTS approved_by text;

ALTER TABLE public.stock_transfers ADD COLUMN IF NOT EXISTS approved_at timestamp with time zone;

ALTER TABLE public.stock_transfers ADD COLUMN IF NOT EXISTS received_by text;

ALTER TABLE public.stock_transfers ADD COLUMN IF NOT EXISTS received_at timestamp with time zone;

ALTER TABLE public.stock_transfers ADD COLUMN IF NOT EXISTS rejected_reason text;

ALTER TABLE public.stock_transfers ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();

ALTER TABLE public.stock_transfers ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();

DO $$ BEGIN ALTER TABLE public.stock_transfers ADD CONSTRAINT stock_transfers_ref_key UNIQUE (ref); EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.stock_transfers ADD CONSTRAINT stock_transfers_transfer_scope_check CHECK ((transfer_scope = ANY (ARRAY['INTRA_GROUP'::text, 'INTER_GROUP'::text]))); EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.stock_transfers ADD CONSTRAINT stock_transfers_kind_check CHECK ((kind = ANY (ARRAY['transfer'::text, 'request'::text]))); EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.stock_transfers ADD CONSTRAINT stock_transfers_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'pending'::text, 'approved'::text, 'in_transit'::text, 'received'::text, 'rejected'::text, 'cancelled'::text]))); EXCEPTION WHEN others THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS stock_transfers_status_idx ON public.stock_transfers USING btree (status);

CREATE UNIQUE INDEX IF NOT EXISTS stock_transfers_pkey ON public.stock_transfers USING btree (id);

CREATE UNIQUE INDEX IF NOT EXISTS stock_transfers_ref_key ON public.stock_transfers USING btree (ref);

CREATE INDEX IF NOT EXISTS stock_transfers_from_idx ON public.stock_transfers USING btree (from_store_id);

CREATE INDEX IF NOT EXISTS stock_transfers_to_idx ON public.stock_transfers USING btree (to_store_id);

-- ---------- functions ----------
CREATE OR REPLACE FUNCTION public.stock_transfer_receive(p_transfer_id uuid, p_received_by text DEFAULT NULL::text, p_deduct_source boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    IF t.transfer_scope = 'INTER_GROUP' AND coalesce(v_src.barcode, '') <> '' THEN
      SELECT p.id INTO v_target
        FROM public.products p
       WHERE p.barcode = v_src.barcode
         AND coalesce(p.stock_by_store ? t.to_store_id, false)
       LIMIT 1;
      IF v_target IS NULL THEN v_target := it.product_id; END IF;
    END IF;

    IF p_deduct_source THEN
      UPDATE public.products
         SET stock_by_store = jsonb_set(
               coalesce(stock_by_store, '{}'::jsonb), ARRAY[t.from_store_id],
               to_jsonb(greatest(
                 coalesce((stock_by_store ->> t.from_store_id)::int, 0) - v_qty, 0)), true),
             stock_quantity = greatest(stock_quantity - v_qty, 0)
       WHERE id = it.product_id;
    END IF;

    UPDATE public.products
       SET stock_by_store = jsonb_set(
             coalesce(stock_by_store, '{}'::jsonb), ARRAY[t.to_store_id],
             to_jsonb(coalesce((stock_by_store ->> t.to_store_id)::int, 0) + v_qty), true),
           stock_quantity = stock_quantity + v_qty
     WHERE id = v_target;

    UPDATE public.stock_transfer_items SET quantity_received = v_qty WHERE id = it.id;
  END LOOP;

  UPDATE public.stock_transfers
     SET status = 'received', received_at = now(),
         received_by = coalesce(p_received_by, received_by)
   WHERE id = t.id;
END $function$;

-- ---------- triggers ----------
DROP TRIGGER IF EXISTS stock_transfers_touch ON public.stock_transfers;

CREATE TRIGGER stock_transfers_touch BEFORE UPDATE ON public.stock_transfers FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ---------- grants (Data API access) ----------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_orders TO authenticated;
GRANT ALL ON public.purchase_orders TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_order_items TO authenticated;
GRANT ALL ON public.purchase_order_items TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_adjustments TO authenticated;
GRANT ALL ON public.stock_adjustments TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_transfers TO authenticated;
GRANT ALL ON public.stock_transfers TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_transfer_items TO authenticated;
GRANT ALL ON public.stock_transfer_items TO service_role;

-- ---------- row level security ----------
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.stock_adjustments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.stock_transfer_items ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.stock_transfers ENABLE ROW LEVEL SECURITY;

-- ---------- policies ----------
DROP POLICY IF EXISTS "Staff can delete" ON public.purchase_order_items;

CREATE POLICY "Staff can delete" ON public.purchase_order_items FOR DELETE TO authenticated USING (is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff can insert" ON public.purchase_order_items;

CREATE POLICY "Staff can insert" ON public.purchase_order_items FOR INSERT TO authenticated WITH CHECK (is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff can read purchase order items" ON public.purchase_order_items;

CREATE POLICY "Staff can read purchase order items" ON public.purchase_order_items FOR SELECT TO authenticated USING (is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff can update" ON public.purchase_order_items;

CREATE POLICY "Staff can update" ON public.purchase_order_items FOR UPDATE TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff can delete" ON public.purchase_orders;

CREATE POLICY "Staff can delete" ON public.purchase_orders FOR DELETE TO authenticated USING (is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff can insert" ON public.purchase_orders;

CREATE POLICY "Staff can insert" ON public.purchase_orders FOR INSERT TO authenticated WITH CHECK (is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff can read purchase orders" ON public.purchase_orders;

CREATE POLICY "Staff can read purchase orders" ON public.purchase_orders FOR SELECT TO authenticated USING (is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff can update" ON public.purchase_orders;

CREATE POLICY "Staff can update" ON public.purchase_orders FOR UPDATE TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff add stock adjustments" ON public.stock_adjustments;

CREATE POLICY "Staff add stock adjustments" ON public.stock_adjustments FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Staff read stock adjustments" ON public.stock_adjustments;

CREATE POLICY "Staff read stock adjustments" ON public.stock_adjustments FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Staff read transfer items" ON public.stock_transfer_items;

CREATE POLICY "Staff read transfer items" ON public.stock_transfer_items FOR SELECT TO authenticated USING (is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff write transfer items" ON public.stock_transfer_items;

CREATE POLICY "Staff write transfer items" ON public.stock_transfer_items FOR ALL TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff raise transfers" ON public.stock_transfers;

CREATE POLICY "Staff raise transfers" ON public.stock_transfers FOR INSERT TO authenticated WITH CHECK (is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff read transfers" ON public.stock_transfers;

CREATE POLICY "Staff read transfers" ON public.stock_transfers FOR SELECT TO authenticated USING (is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff update transfers" ON public.stock_transfers;

CREATE POLICY "Staff update transfers" ON public.stock_transfers FOR UPDATE TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));

DROP POLICY IF EXISTS "Supervisors delete transfers" ON public.stock_transfers;

CREATE POLICY "Supervisors delete transfers" ON public.stock_transfers FOR DELETE TO authenticated USING (is_app_supervisor());

-- ---------- verification ----------
SELECT t.name AS table_name,
       CASE WHEN to_regclass('public.' || t.name) IS NULL THEN 'MISSING' ELSE 'OK' END AS status
FROM (VALUES ('purchase_orders'),('purchase_order_items'),('stock_adjustments'),('stock_transfers'),('stock_transfer_items')) AS t(name);
