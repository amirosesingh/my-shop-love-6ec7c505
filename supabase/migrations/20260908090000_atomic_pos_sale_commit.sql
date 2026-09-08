-- Atomically accept one immutable POS sale graph.
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS rounding_adjustment numeric(18,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rounding_label text;

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
  r jsonb;
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

  FOR r IN SELECT value FROM jsonb_array_elements(COALESCE(_items,'[]'::jsonb)) LOOP
    INSERT INTO public.sale_items (
      id, sale_id, product_id, product_name, unit_price, unit_cost, quantity,
      discount_percent, discount_amount, tax_rate, is_return, is_foc,
      promo_id, coupon_code, coupon_discount, created_at
    ) VALUES (
      (r->>'id')::uuid, (s->>'id')::uuid, NULLIF(r->>'product_id','')::uuid,
      r->>'product_name', COALESCE((r->>'unit_price')::numeric,0),
      COALESCE((r->>'unit_cost')::numeric,0), COALESCE((r->>'quantity')::integer,1),
      COALESCE((r->>'discount_percent')::numeric,0), COALESCE((r->>'discount_amount')::numeric,0),
      COALESCE((r->>'tax_rate')::numeric,0), COALESCE((r->>'is_return')::boolean,false),
      COALESCE((r->>'is_foc')::boolean,false), NULLIF(r->>'promo_id',''),
      NULLIF(r->>'coupon_code',''), COALESCE((r->>'coupon_discount')::numeric,0), now()
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

  FOR r IN SELECT value FROM jsonb_array_elements(COALESCE(_payments,'[]'::jsonb)) LOOP
    INSERT INTO public.payment_transactions (
      id, source_type, sale_id, booking_id, member_id, store_id, shift_id,
      terminal_id, amount, method, kind, reference, cashier_id, cashier_name,
      note, paid_at, created_at, status, metadata
    ) VALUES (
      (r->>'id')::uuid, COALESCE(NULLIF(r->>'source_type',''),'sale'),
      (s->>'id')::uuid, NULL, NULLIF(r->>'member_id','')::uuid,
      NULLIF(s->>'store_id',''), NULLIF(r->>'shift_id',''),
      NULLIF(r->>'terminal_id',''), COALESCE((r->>'amount')::numeric,0),
      COALESCE(NULLIF(r->>'method',''),'cash'), COALESCE(NULLIF(r->>'kind',''),'payment'),
      NULLIF(r->>'reference',''), NULLIF(r->>'cashier_id',''), NULLIF(r->>'cashier_name',''),
      COALESCE(r->>'note',''), COALESCE(NULLIF(r->>'paid_at','')::timestamptz,now()),
      COALESCE(NULLIF(r->>'created_at','')::timestamptz,now()),
      COALESCE(NULLIF(r->>'status',''),'completed'), COALESCE(r->'metadata','{}'::jsonb)
    ) ON CONFLICT (id) DO NOTHING;
  END LOOP;

  FOR r IN SELECT value FROM jsonb_array_elements(COALESCE(_movements,'[]'::jsonb)) LOOP
    INSERT INTO public.item_activity_logs (
      id, product_id, product_name, sku, barcode, store_id, terminal_id,
      activity_type, reference, quantity_delta, stock_before, stock_after,
      unit_cost, staff_id, staff_name, role, note, created_at
    ) VALUES (
      (r->>'id')::uuid, NULLIF(r->>'product_id','')::uuid, NULLIF(r->>'product_name',''),
      NULLIF(r->>'sku',''), NULLIF(r->>'barcode',''), NULLIF(s->>'store_id',''),
      NULLIF(r->>'terminal_id',''), r->>'activity_type', NULLIF(r->>'reference',''),
      COALESCE((r->>'quantity_delta')::integer,0), NULLIF(r->>'stock_before','')::integer,
      NULLIF(r->>'stock_after','')::integer, COALESCE((r->>'unit_cost')::numeric,0),
      NULLIF(r->>'staff_id',''), NULLIF(r->>'staff_name',''), NULLIF(r->>'role',''),
      COALESCE(r->>'note',''), COALESCE(NULLIF(r->>'created_at','')::timestamptz,now())
    ) ON CONFLICT (id) DO NOTHING;
  END LOOP;

  FOR movement_result IN
    SELECT * FROM public.stock_apply_deltas(
      (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'movement_id', r->>'id', 'product_id', r->>'product_id',
        'store_id', s->>'store_id', 'delta', r->>'quantity_delta'
      )), '[]'::jsonb) FROM jsonb_array_elements(COALESCE(_movements,'[]'::jsonb)) r)
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
