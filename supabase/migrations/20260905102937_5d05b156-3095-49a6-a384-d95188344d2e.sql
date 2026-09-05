CREATE OR REPLACE FUNCTION public.enforce_sale_item_permissions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  line_value numeric;
  taken_off numeric;
BEGIN
  IF coalesce(NEW.discount_percent, 0) < 0
     OR coalesce(NEW.discount_amount, 0) < 0
     OR coalesce(NEW.coupon_discount, 0) < 0 THEN
    RAISE EXCEPTION 'INVALID_DISCOUNT_NEGATIVE';
  END IF;

  IF coalesce(NEW.discount_percent, 0) > 100 THEN
    RAISE EXCEPTION 'INVALID_DISCOUNT_PERCENT';
  END IF;

  line_value := abs(coalesce(NEW.unit_price, 0) * coalesce(NEW.quantity, 0));
  taken_off := coalesce(NEW.coupon_discount, 0)
             + coalesce(NEW.discount_amount, 0)
             + (line_value - coalesce(NEW.coupon_discount, 0)) * coalesce(NEW.discount_percent, 0) / 100;

  IF taken_off > line_value + 0.01 THEN
    RAISE EXCEPTION 'INVALID_DISCOUNT_EXCEEDS_LINE';
  END IF;

  IF (SELECT auth.uid()) IS NULL THEN RETURN NEW; END IF;

  IF coalesce(NEW.discount_percent, 0) > 0
     OR coalesce(NEW.discount_amount, 0) > 0
     OR coalesce(NEW.coupon_discount, 0) > 0 THEN
    IF NOT public.has_perm('can_give_discount') THEN
      RAISE EXCEPTION 'PERMISSION_DENIED_DISCOUNT';
    END IF;
  END IF;

  IF coalesce(NEW.is_return, false) OR coalesce(NEW.quantity, 0) < 0 THEN
    IF NOT public.has_perm('can_process_refund') THEN
      RAISE EXCEPTION 'PERMISSION_DENIED_REFUND';
    END IF;
  END IF;

  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.enforce_sale_permissions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  base numeric;
BEGIN
  IF coalesce(NEW.discount_amount, 0) < 0 OR coalesce(NEW.coupon_discount, 0) < 0 THEN
    RAISE EXCEPTION 'INVALID_DISCOUNT_NEGATIVE';
  END IF;

  base := abs(coalesce(NEW.subtotal_amount, 0));
  IF base > 0
     AND coalesce(NEW.discount_amount, 0) + coalesce(NEW.coupon_discount, 0) > base + 0.01 THEN
    RAISE EXCEPTION 'INVALID_DISCOUNT_EXCEEDS_BILL';
  END IF;

  IF (SELECT auth.uid()) IS NULL THEN RETURN NEW; END IF;

  IF coalesce(NEW.discount_amount, 0) > 0 OR coalesce(NEW.coupon_discount, 0) > 0 THEN
    IF NOT public.has_perm('can_give_discount') THEN
      RAISE EXCEPTION 'PERMISSION_DENIED_DISCOUNT';
    END IF;
  END IF;

  IF coalesce(NEW.is_refunded, false) THEN
    IF NOT public.has_perm('can_process_refund') THEN
      RAISE EXCEPTION 'PERMISSION_DENIED_REFUND';
    END IF;
  END IF;

  RETURN NEW;
END $function$;