-- Effective POS rules plus branch-row concurrency metadata.
-- Values still inherit through pos_rules_get; this exposes only bookkeeping
-- needed to reject stale edits and never returns credentials or private data.
CREATE OR REPLACE FUNCTION public.pos_rules_snapshot(_store_id text DEFAULT '')
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  WITH requested AS (
    SELECT COALESCE(btrim(_store_id), '') AS store_id
  ), metadata AS (
    SELECT s.store_id, s.row_version, s.updated_at, s.updated_by
      FROM public.pos_store_settings s, requested r
     WHERE s.store_id = r.store_id
  )
  SELECT jsonb_build_object(
    'rules', public.pos_rules_get(r.store_id),
    'store_id', r.store_id,
    'row_version', COALESCE(m.row_version, 1),
    'updated_at', m.updated_at,
    'updated_by', m.updated_by
  )
    FROM requested r LEFT JOIN metadata m ON m.store_id = r.store_id;
$$;

REVOKE ALL ON FUNCTION public.pos_rules_snapshot(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pos_rules_snapshot(text) TO authenticated, service_role;

-- Realtime is an invalidation signal only; clients refetch the complete sale.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['sales', 'sale_items', 'payment_transactions'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
         WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      END IF;
    END IF;
  END LOOP;
END $$;
