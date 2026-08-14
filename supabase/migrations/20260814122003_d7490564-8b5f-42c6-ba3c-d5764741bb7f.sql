-- 1 · multi-barcode backfill --------------------------------------------------
INSERT INTO public.product_barcodes (product_id, barcode, label, pack_size, is_primary)
SELECT p.id, btrim(p.barcode), 'Primary', 1, true
FROM public.products p
WHERE coalesce(btrim(p.barcode), '') <> ''
ON CONFLICT (barcode) DO NOTHING;

INSERT INTO public.product_barcodes (product_id, barcode, label, pack_size, is_primary)
SELECT p.id, btrim(a.code), 'Alias', 1, false
FROM public.products p
CROSS JOIN LATERAL unnest(coalesce(p.barcode_aliases, ARRAY[]::text[])) AS a(code)
WHERE coalesce(btrim(a.code), '') <> ''
ON CONFLICT (barcode) DO NOTHING;

INSERT INTO public.product_barcodes (product_id, barcode, label, pack_size, is_primary)
SELECT p.id,
       btrim(v.item ->> 'code'),
       nullif(btrim(coalesce(v.item ->> 'label', '')), ''),
       coalesce(nullif(v.item ->> 'packSize', '')::numeric, 1),
       false
FROM public.products p
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(p.barcode_variants) = 'array' THEN p.barcode_variants ELSE '[]'::jsonb END
) AS v(item)
WHERE coalesce(btrim(v.item ->> 'code'), '') <> ''
ON CONFLICT (barcode) DO NOTHING;

-- 2 · payment ledger backfill --------------------------------------------------
INSERT INTO public.payment_transactions
  (source_type, sale_id, member_id, store_id, shift_id, amount, method, kind,
   reference, cashier_id, cashier_name, note, paid_at)
SELECT 'sale',
       s.id,
       s.member_id,
       s.store_id,
       s.shift_id,
       coalesce(nullif(t.item ->> 'amount', '')::numeric, 0),
       coalesce(nullif(btrim(coalesce(t.item ->> 'method', '')), ''), s.payment_type),
       CASE WHEN s.is_refunded THEN 'refund' ELSE 'payment' END,
       s.bill_number,
       s.cashier_id,
       s.cashier_name,
       '',
       s.created_at
FROM public.sales s
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(s.payments) = 'array' AND jsonb_array_length(s.payments) > 0
       THEN s.payments
       ELSE jsonb_build_array(jsonb_build_object('method', s.payment_type, 'amount', s.paid_amount))
  END
) AS t(item)
WHERE NOT EXISTS (
  SELECT 1 FROM public.payment_transactions pt
  WHERE pt.source_type = 'sale' AND pt.sale_id = s.id
);

INSERT INTO public.payment_transactions
  (source_type, booking_id, member_id, store_id, amount, method, kind,
   reference, cashier_name, note, paid_at)
SELECT 'booking',
       bp.booking_id,
       b.member_id,
       b.store_id,
       bp.amount,
       bp.method,
       'payment',
       b.ref,
       bp.cashier,
       '',
       bp.paid_at
FROM public.booking_payments bp
JOIN public.bookings b ON b.id = bp.booking_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.payment_transactions pt
  WHERE pt.source_type = 'booking' AND pt.booking_id = bp.booking_id AND pt.paid_at = bp.paid_at
);

-- 3 · deposits can never exceed the booking total -------------------------------
CREATE OR REPLACE FUNCTION public.booking_payment_within_total()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  booking_total numeric;
  already_paid numeric;
BEGIN
  SELECT total INTO booking_total FROM public.bookings WHERE id = NEW.booking_id;
  IF booking_total IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT coalesce(sum(amount), 0) INTO already_paid
  FROM public.booking_payments
  WHERE booking_id = NEW.booking_id
    AND (TG_OP = 'INSERT' OR id <> NEW.id);
  IF already_paid + NEW.amount > booking_total + 0.005 THEN
    RAISE EXCEPTION 'Payment of % exceeds the amount still due on this booking (% of % already paid)',
      NEW.amount, already_paid, booking_total;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS booking_payment_within_total_trg ON public.booking_payments;
CREATE TRIGGER booking_payment_within_total_trg
BEFORE INSERT OR UPDATE ON public.booking_payments
FOR EACH ROW EXECUTE FUNCTION public.booking_payment_within_total();

-- 4 · ledger lookup indexes ------------------------------------------------------
CREATE INDEX IF NOT EXISTS payment_transactions_sale_idx ON public.payment_transactions (sale_id);
CREATE INDEX IF NOT EXISTS payment_transactions_booking_idx ON public.payment_transactions (booking_id);
CREATE INDEX IF NOT EXISTS payment_transactions_paid_at_idx ON public.payment_transactions (paid_at DESC);