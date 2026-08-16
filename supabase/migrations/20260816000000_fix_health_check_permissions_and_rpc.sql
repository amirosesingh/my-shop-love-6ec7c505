-- ============================================================================
-- Health check permissions & relationship RPC
--
-- Purpose: make the Database Health and Logic Health screens work for every
-- signed-in staff account, on any database this POS is pointed at.
--
--   1. (Re)creates public.operational_relational_health() as SECURITY DEFINER.
--   2. Grants EXECUTE on it to authenticated and service_role.
--   3. Makes sure the operational tables the POS reads exist with the columns
--      the till sends, have RLS enabled, and are reachable by the Data API.
--
-- Idempotent: safe to run as many times as you like.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Relationship & orphan check
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.operational_relational_health()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _tables text[] := ARRAY[
    'sales','sale_items','bookings','booking_payments','payment_transactions',
    'products','product_barcodes','product_categories','members','membership_tiers',
    'purchase_orders','purchase_order_items','stock_transfers','stock_transfer_items',
    'promotions','coupon_campaigns','issued_vouchers','stock_adjustments','item_activity_logs'
  ];
  _t text;
  _fk record;
  _orphans bigint;
  _rows bigint;
  _links jsonb;
  _out jsonb := '[]'::jsonb;
BEGIN
  FOREACH _t IN ARRAY _tables LOOP
    IF to_regclass('public.' || _t) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('SELECT count(*) FROM public.%I', _t) INTO _rows;
    _links := '[]'::jsonb;

    FOR _fk IN
      SELECT c.conname,
             a.attname   AS child_column,
             pt.relname  AS parent_table,
             pa.attname  AS parent_column
      FROM pg_constraint c
      JOIN pg_class ct ON ct.oid = c.conrelid
      JOIN pg_class pt ON pt.oid = c.confrelid
      JOIN unnest(c.conkey)  WITH ORDINALITY AS ck(attnum, ord) ON true
      JOIN unnest(c.confkey) WITH ORDINALITY AS pk(attnum, ord) ON pk.ord = ck.ord
      JOIN pg_attribute a  ON a.attrelid  = c.conrelid  AND a.attnum  = ck.attnum
      JOIN pg_attribute pa ON pa.attrelid = c.confrelid AND pa.attnum = pk.attnum
      WHERE c.contype = 'f'
        AND ct.relnamespace = 'public'::regnamespace
        AND ct.relname = _t
    LOOP
      EXECUTE format(
        'SELECT count(*) FROM public.%I ch WHERE ch.%I IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM public.%I pr WHERE pr.%I = ch.%I)',
        _t, _fk.child_column, _fk.parent_table, _fk.parent_column, _fk.child_column
      ) INTO _orphans;

      _links := _links || jsonb_build_object(
        'constraint', _fk.conname,
        'column', _fk.child_column,
        'parent_table', _fk.parent_table,
        'parent_column', _fk.parent_column,
        'orphans', _orphans
      );
    END LOOP;

    _out := _out || jsonb_build_object('table', _t, 'rows', _rows, 'links', _links);
  END LOOP;

  RETURN jsonb_build_object('at', now(), 'tables', _out);
END;
$function$;

REVOKE ALL ON FUNCTION public.operational_relational_health() FROM public;
GRANT EXECUTE ON FUNCTION public.operational_relational_health() TO authenticated;
GRANT EXECUTE ON FUNCTION public.operational_relational_health() TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Columns the till sends that older databases may not have
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.sales') IS NOT NULL THEN
    ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS payments jsonb NOT NULL DEFAULT '[]'::jsonb;
    ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS client_transaction_id text;
    ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS coupon_code text;
    ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS coupon_promo_id text;
    ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS coupon_scope text;
    ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS coupon_discount numeric NOT NULL DEFAULT 0;
    ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS row_version integer NOT NULL DEFAULT 1;
  END IF;

  IF to_regclass('public.sale_items') IS NOT NULL THEN
    ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS unit_cost numeric NOT NULL DEFAULT 0;
    ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS coupon_code text;
    ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS coupon_discount numeric NOT NULL DEFAULT 0;
    ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS row_version integer NOT NULL DEFAULT 1;
  END IF;

  IF to_regclass('public.bookings') IS NOT NULL THEN
    ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS charges jsonb NOT NULL DEFAULT '[]'::jsonb;
    ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS tag_id text;
    ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS row_version integer NOT NULL DEFAULT 1;
  END IF;

  IF to_regclass('public.payment_transactions') IS NOT NULL THEN
    ALTER TABLE public.payment_transactions ADD COLUMN IF NOT EXISTS row_version integer NOT NULL DEFAULT 1;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Row Level Security + Data API access on the operational tables
--    RLS is enabled everywhere. Where a table has no policy at all, a
--    signed-in-staff policy is added so the app is not locked out.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  _t text;
  _tables text[] := ARRAY[
    'sales','sale_items','bookings','booking_payments','payment_transactions',
    'products','product_barcodes','product_categories','members','membership_tiers',
    'purchase_orders','purchase_order_items','stock_transfers','stock_transfer_items',
    'promotions','coupon_campaigns','issued_vouchers','stock_adjustments','item_activity_logs'
  ];
BEGIN
  FOREACH _t IN ARRAY _tables LOOP
    IF to_regclass('public.' || _t) IS NULL THEN CONTINUE; END IF;

    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', _t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', _t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', _t);

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = _t) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
        _t || '_staff_access', _t
      );
    END IF;
  END LOOP;
END $$;
