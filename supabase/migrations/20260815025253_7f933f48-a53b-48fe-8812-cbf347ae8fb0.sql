CREATE OR REPLACE FUNCTION public.bump_row_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.row_version := COALESCE(OLD.row_version, 0) + 1;
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
    'item_activity_logs','terminal_tokens','coupon_campaigns','issued_vouchers'
  ];
BEGIN
  FOREACH t IN ARRAY targets LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS row_version integer NOT NULL DEFAULT 1', t);
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_bump_row_version', t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.bump_row_version()',
      t || '_bump_row_version', t);
  END LOOP;
END;
$$;