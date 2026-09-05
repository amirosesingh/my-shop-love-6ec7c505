DO $migration$
BEGIN
  IF to_regclass('public.stock_transfer_items') IS NULL THEN
    RAISE NOTICE 'public.stock_transfer_items is not installed; supabase/schema.sql will create it.';
    RETURN;
  END IF;

  ALTER TABLE public.stock_transfer_items
    ADD COLUMN IF NOT EXISTS quantity_approved integer,
    ADD COLUMN IF NOT EXISTS quantity_dispatched integer,
    ADD COLUMN IF NOT EXISTS quantity_verified integer;
END
$migration$;

DO $quantity_types$
DECLARE
  target_column text;
  type_name text;
  invalid_count bigint;
BEGIN
  IF to_regclass('public.stock_transfer_items') IS NULL THEN
    RETURN;
  END IF;

  FOREACH target_column IN ARRAY ARRAY[
    'quantity', 'quantity_received', 'quantity_approved',
    'quantity_dispatched', 'quantity_verified'
  ] LOOP
    SELECT c.data_type
      INTO type_name
      FROM information_schema.columns c
     WHERE c.table_schema = 'public'
       AND c.table_name = 'stock_transfer_items'
       AND c.column_name = target_column;

    IF type_name = 'integer' OR type_name IS NULL THEN
      CONTINUE;
    ELSIF type_name IN ('smallint', 'bigint', 'numeric', 'decimal',
                        'text', 'character varying', 'character') THEN
      EXECUTE format(
        'SELECT count(*) FROM public.stock_transfer_items WHERE %1$I IS NOT NULL AND (' ||
        'btrim(%1$I::text) !~ ''^[+-]?[0-9]+([.]0+)?$'' OR ' ||
        'CASE WHEN btrim(%1$I::text) ~ ''^[+-]?[0-9]+([.]0+)?$'' ' ||
        'THEN (%1$I::text)::numeric NOT BETWEEN -2147483648 AND 2147483647 ELSE false END)',
        target_column
      ) INTO invalid_count;

      IF invalid_count > 0 THEN
        RAISE EXCEPTION
          'Cannot safely convert public.stock_transfer_items.% to integer: % incompatible value(s). Correct those values and run this migration again.',
          target_column, invalid_count
          USING ERRCODE = '42804';
      END IF;

      EXECUTE format(
        'ALTER TABLE public.stock_transfer_items ALTER COLUMN %1$I TYPE integer ' ||
        'USING CASE WHEN %1$I IS NULL OR btrim(%1$I::text) = '''' THEN NULL ' ||
        'ELSE (%1$I::text)::numeric::integer END',
        target_column
      );
    ELSE
      RAISE EXCEPTION
        'Cannot automatically convert public.stock_transfer_items.% from % to integer. Correct this column type and run this migration again.',
        target_column, type_name
        USING ERRCODE = '42804';
    END IF;
  END LOOP;
END
$quantity_types$;

DO $backfill$
BEGIN
  IF to_regclass('public.stock_transfer_items') IS NOT NULL
     AND to_regclass('public.stock_transfers') IS NOT NULL THEN
    UPDATE public.stock_transfer_items i
       SET quantity_verified = COALESCE(i.quantity_received, i.quantity_dispatched, i.quantity)
      FROM public.stock_transfers t
     WHERE t.id = i.transfer_id
       AND t.status = 'received'
       AND i.quantity_verified IS NULL;
  END IF;
END
$backfill$;

NOTIFY pgrst, 'reload schema';