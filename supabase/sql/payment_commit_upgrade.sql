-- Retail POS payment commit repair for an existing Supabase database.
-- Use this file only for a manual SQL Editor deployment. Supabase CLI users
-- should deploy the matching migration instead.
BEGIN;

ALTER TABLE public.payment_transactions
  ADD COLUMN IF NOT EXISTS client_transaction_id text;

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS authorization_request_id uuid,
  ADD COLUMN IF NOT EXISTS authorized_by text,
  ADD COLUMN IF NOT EXISTS authorized_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS rounding_adjustment numeric(18,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rounding_label text;

UPDATE public.sales
SET rounding_adjustment = 0
WHERE rounding_adjustment IS NULL;

ALTER TABLE public.sales
  ALTER COLUMN rounding_adjustment SET DEFAULT 0,
  ALTER COLUMN rounding_adjustment SET NOT NULL;

DROP INDEX IF EXISTS public.payment_transactions_client_txn_idx;

CREATE UNIQUE INDEX payment_transactions_client_txn_idx
  ON public.payment_transactions (client_transaction_id)
  WHERE client_transaction_id IS NOT NULL;

COMMIT;

BEGIN;

-- Keep terminal activation heartbeats compatible with the current routine.
ALTER TABLE public.terminal_tokens
  ADD COLUMN IF NOT EXISTS app_version text,
  ADD COLUMN IF NOT EXISTS last_sync_at timestamp with time zone;

-- Fix checkout failure SQLSTATE 42702: the PL/pgSQL row variable and the
-- stock-delta query both used the identifier "r", making every sale with
-- inventory movements fail and roll back its payment.

CREATE OR REPLACE FUNCTION public.pos_sale_commit(
  _sale jsonb,
  _items jsonb DEFAULT '[]'::jsonb,
  _payments jsonb DEFAULT '[]'::jsonb,
  _movements jsonb DEFAULT '[]'::jsonb,
  _member jsonb DEFAULT NULL,
  _exchange_bill text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  s jsonb := COALESCE(_sale, '{}'::jsonb);
  entry jsonb;
  existing_id uuid;
  movement_result record;
BEGIN
  IF NULLIF(s->>'id', '') IS NULL OR NULLIF(s->>'bill_number', '') IS NULL THEN
    RAISE EXCEPTION 'INVALID_SALE: id and bill number are required' USING ERRCODE = '22023';
  END IF;

  SELECT id INTO existing_id FROM public.sales
   WHERE id = (s->>'id')::uuid
      OR (NULLIF(s->>'client_transaction_id','') IS NOT NULL
          AND client_transaction_id = s->>'client_transaction_id')
   LIMIT 1;
  IF existing_id IS NOT NULL AND existing_id <> (s->>'id')::uuid THEN
    RAISE EXCEPTION 'DUPLICATE_TRANSACTION: attempt already belongs to sale %', existing_id
      USING ERRCODE = '23505';
  END IF;

  IF existing_id IS NULL THEN
    INSERT INTO public.sales (
    id, bill_number, member_id, store_id, shift_id, cashier_name,
    subtotal_amount, total_amount, discount_amount, tax_amount, payment_type,
    payments, points_earned, points_redeemed, is_exchange, original_bill_number,
    exchange_credit, paid_amount, change_amount, is_refunded, coupon_code,
    coupon_promo_id, coupon_scope, coupon_discount, client_transaction_id,
    store_name_snapshot, store_address_snapshot, rounding_adjustment,
    rounding_label, authorization_request_id, authorized_by, authorized_at,
    created_at
  ) VALUES (
    (s->>'id')::uuid, s->>'bill_number', NULLIF(s->>'member_id','')::uuid,
    NULLIF(s->>'store_id',''), NULLIF(s->>'shift_id',''), NULLIF(s->>'cashier_name',''),
    COALESCE((s->>'subtotal_amount')::numeric,0), COALESCE((s->>'total_amount')::numeric,0),
    COALESCE((s->>'discount_amount')::numeric,0), COALESCE((s->>'tax_amount')::numeric,0),
    COALESCE(NULLIF(s->>'payment_type',''),'cash'), COALESCE(s->'payments','[]'::jsonb),
    COALESCE((s->>'points_earned')::numeric,0), COALESCE((s->>'points_redeemed')::numeric,0),
    COALESCE((s->>'is_exchange')::boolean,false), NULLIF(s->>'original_bill_number',''),
    COALESCE((s->>'exchange_credit')::numeric,0), COALESCE((s->>'paid_amount')::numeric,0),
    COALESCE((s->>'change_amount')::numeric,0), COALESCE((s->>'is_refunded')::boolean,false),
    NULLIF(s->>'coupon_code',''), NULLIF(s->>'coupon_promo_id',''), NULLIF(s->>'coupon_scope',''),
    COALESCE((s->>'coupon_discount')::numeric,0), NULLIF(s->>'client_transaction_id',''),
    NULLIF(s->>'store_name_snapshot',''), NULLIF(s->>'store_address_snapshot',''),
    COALESCE((s->>'rounding_adjustment')::numeric,0), NULLIF(s->>'rounding_label',''),
    NULLIF(s->>'authorization_request_id','')::uuid, NULLIF(s->>'authorized_by',''),
    NULLIF(s->>'authorized_at','')::timestamptz, COALESCE(NULLIF(s->>'created_at','')::timestamptz,now())
    ) ON CONFLICT (id) DO NOTHING;
  END IF;

  FOR entry IN SELECT value FROM jsonb_array_elements(COALESCE(_items,'[]'::jsonb)) LOOP
    INSERT INTO public.sale_items (
      id, sale_id, product_id, product_name, unit_price, unit_cost, quantity,
      discount_percent, discount_amount, tax_rate, is_return, is_foc,
      promo_id, coupon_code, coupon_discount, created_at
    ) VALUES (
      (entry->>'id')::uuid, (s->>'id')::uuid, NULLIF(entry->>'product_id','')::uuid,
      entry->>'product_name', COALESCE((entry->>'unit_price')::numeric,0),
      COALESCE((entry->>'unit_cost')::numeric,0), COALESCE((entry->>'quantity')::integer,1),
      COALESCE((entry->>'discount_percent')::numeric,0), COALESCE((entry->>'discount_amount')::numeric,0),
      COALESCE((entry->>'tax_rate')::numeric,0), COALESCE((entry->>'is_return')::boolean,false),
      COALESCE((entry->>'is_foc')::boolean,false), NULLIF(entry->>'promo_id',''),
      NULLIF(entry->>'coupon_code',''), COALESCE((entry->>'coupon_discount')::numeric,0), now()
    ) ON CONFLICT (id) DO NOTHING;
  END LOOP;

  IF _member IS NOT NULL AND NULLIF(_member->>'id','') IS NOT NULL THEN
    INSERT INTO public.members (
      id, member_code, full_name, phone, email, address, date_of_birth,
      tier_id, loyalty_points, total_spent, updated_at
    ) VALUES (
      (_member->>'id')::uuid, _member->>'member_code', _member->>'full_name',
      COALESCE(_member->>'phone',''), NULLIF(_member->>'email',''),
      NULLIF(_member->>'address',''), NULLIF(_member->>'date_of_birth','')::date,
      NULLIF(_member->>'tier_id','')::uuid, COALESCE((_member->>'loyalty_points')::numeric,0),
      COALESCE((_member->>'total_spent')::numeric,0), now()
    ) ON CONFLICT (id) DO UPDATE SET
      member_code = EXCLUDED.member_code, full_name = EXCLUDED.full_name,
      phone = EXCLUDED.phone, email = EXCLUDED.email, address = EXCLUDED.address,
      date_of_birth = EXCLUDED.date_of_birth, tier_id = EXCLUDED.tier_id,
      loyalty_points = EXCLUDED.loyalty_points, total_spent = EXCLUDED.total_spent,
      row_version = members.row_version,
      updated_at = now();
  END IF;

  FOR entry IN SELECT value FROM jsonb_array_elements(COALESCE(_payments,'[]'::jsonb)) LOOP
    INSERT INTO public.payment_transactions (
      id, client_transaction_id, source_type, sale_id, booking_id, member_id, store_id, shift_id,
      terminal_id, amount, method, kind, reference, cashier_id, cashier_name,
      note, paid_at, created_at, status, metadata
    ) VALUES (
      (entry->>'id')::uuid, NULLIF(entry->>'client_transaction_id',''),
      COALESCE(NULLIF(entry->>'source_type',''),'sale'),
      (s->>'id')::uuid, NULL, NULLIF(entry->>'member_id','')::uuid,
      NULLIF(s->>'store_id',''), NULLIF(entry->>'shift_id',''),
      NULLIF(entry->>'terminal_id',''), COALESCE((entry->>'amount')::numeric,0),
      COALESCE(NULLIF(entry->>'method',''),'cash'), COALESCE(NULLIF(entry->>'kind',''),'payment'),
      NULLIF(entry->>'reference',''), NULLIF(entry->>'cashier_id',''), NULLIF(entry->>'cashier_name',''),
      COALESCE(entry->>'note',''), COALESCE(NULLIF(entry->>'paid_at','')::timestamptz,now()),
      COALESCE(NULLIF(entry->>'created_at','')::timestamptz,now()),
      COALESCE(NULLIF(entry->>'status',''),'completed'), COALESCE(entry->'metadata','{}'::jsonb)
    ) ON CONFLICT (id) DO NOTHING;
  END LOOP;

  FOR entry IN SELECT value FROM jsonb_array_elements(COALESCE(_movements,'[]'::jsonb)) LOOP
    INSERT INTO public.item_activity_logs (
      id, product_id, product_name, sku, barcode, store_id, terminal_id,
      activity_type, reference, quantity_delta, stock_before, stock_after,
      unit_cost, staff_id, staff_name, role, note, created_at
    ) VALUES (
      (entry->>'id')::uuid, NULLIF(entry->>'product_id','')::uuid, NULLIF(entry->>'product_name',''),
      NULLIF(entry->>'sku',''), NULLIF(entry->>'barcode',''), NULLIF(s->>'store_id',''),
      NULLIF(entry->>'terminal_id',''), entry->>'activity_type', NULLIF(entry->>'reference',''),
      COALESCE((entry->>'quantity_delta')::integer,0), NULLIF(entry->>'stock_before','')::integer,
      NULLIF(entry->>'stock_after','')::integer, COALESCE((entry->>'unit_cost')::numeric,0),
      NULLIF(entry->>'staff_id',''), NULLIF(entry->>'staff_name',''), NULLIF(entry->>'role',''),
      COALESCE(entry->>'note',''), COALESCE(NULLIF(entry->>'created_at','')::timestamptz,now())
    ) ON CONFLICT (id) DO NOTHING;
  END LOOP;

  FOR movement_result IN
    SELECT * FROM public.stock_apply_deltas(
      (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'movement_id', movement_entry.value->>'id',
        'product_id', movement_entry.value->>'product_id',
        'store_id', s->>'store_id',
        'delta', movement_entry.value->>'quantity_delta'
      )), '[]'::jsonb)
       FROM jsonb_array_elements(COALESCE(_movements,'[]'::jsonb)) AS movement_entry(value))
    )
  LOOP
    IF movement_result.status = 'refused' THEN
      RAISE EXCEPTION 'STOCK_REFUSED: %', COALESCE(movement_result.reason,'failed')
        USING ERRCODE = '23514';
    END IF;
  END LOOP;

  IF NULLIF(_exchange_bill,'') IS NOT NULL THEN
    UPDATE public.sales SET exchanged_to_bill_number = s->>'bill_number'
     WHERE bill_number = _exchange_bill AND COALESCE(store_id,'') = COALESCE(s->>'store_id','');
  END IF;

  RETURN jsonb_build_object('id', s->>'id', 'client_transaction_id', s->>'client_transaction_id');
END;
$$;

REVOKE ALL ON FUNCTION public.pos_sale_commit(jsonb,jsonb,jsonb,jsonb,jsonb,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_sale_commit(jsonb,jsonb,jsonb,jsonb,jsonb,text) TO authenticated, service_role;

COMMIT;
