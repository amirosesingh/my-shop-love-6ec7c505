CREATE OR REPLACE FUNCTION public.skip_stale_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  new_stamp text;
  old_stamp text;
BEGIN
  -- A caller that does not track versions (older tills, admin screens) is
  -- left alone: it always wins, exactly as it does today.
  IF NEW.row_version IS NULL OR NEW.row_version = 0 OR OLD.row_version IS NULL THEN
    RETURN NEW;
  END IF;

  -- The incoming copy is genuinely older than the stored one: drop it.
  IF NEW.row_version < OLD.row_version THEN
    RETURN NULL;
  END IF;

  -- Same version on both sides: fall back to the last-changed time when the
  -- table has one, so a replayed change cannot undo a fresher edit.
  IF NEW.row_version = OLD.row_version THEN
    new_stamp := to_jsonb(NEW) ->> 'updated_at';
    old_stamp := to_jsonb(OLD) ->> 'updated_at';
    IF new_stamp IS NOT NULL AND old_stamp IS NOT NULL AND new_stamp < old_stamp THEN
      RETURN NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DO $$
DECLARE
  t text;
  targets text[] := ARRAY[
    'sales','sale_items','bookings','booking_payments','payment_transactions',
    'members','membership_tiers','promotions','suppliers','stores','shifts',
    'shift_sessions','purchase_orders','purchase_order_items','stock_transfers',
    'stock_transfer_items','stock_adjustments','held_orders','product_barcodes',
    'product_categories','uom_units','pos_settings','app_users',
    'item_activity_logs','terminal_tokens','coupon_campaigns','issued_vouchers',
    'products'
  ];
BEGIN
  FOREACH t IN ARRAY targets LOOP
    -- The name starts with "aa_" so this guard runs before the trigger that
    -- increments the counter, which would otherwise hide the incoming value.
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_aa_stale_guard', t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.skip_stale_update()',
      t || '_aa_stale_guard', t);
  END LOOP;
END;
$$;