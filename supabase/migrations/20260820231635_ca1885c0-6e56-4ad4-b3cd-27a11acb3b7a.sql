CREATE TABLE IF NOT EXISTS public.settings_scoped (
  scope text NOT NULL DEFAULT 'GLOBAL',
  scope_id text NOT NULL DEFAULT '',
  key text NOT NULL,
  value jsonb,
  is_overridden boolean NOT NULL DEFAULT true,
  updated_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope, scope_id, key)
);

GRANT SELECT ON public.settings_scoped TO authenticated;
GRANT ALL ON public.settings_scoped TO service_role;

ALTER TABLE public.settings_scoped ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS settings_scoped_read ON public.settings_scoped;
CREATE POLICY settings_scoped_read ON public.settings_scoped
  FOR SELECT TO authenticated USING (true);

DROP TRIGGER IF EXISTS settings_scoped_touch ON public.settings_scoped;
CREATE TRIGGER settings_scoped_touch BEFORE UPDATE ON public.settings_scoped
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.settings_cluster_of(_scope text, _scope_id text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _scope = 'CLUSTER' THEN _scope_id
    WHEN _scope = 'BRANCH' THEN COALESCE(NULLIF((SELECT group_id FROM public.stores WHERE id = _scope_id), ''), 'default')
    ELSE ''
  END
$$;

CREATE OR REPLACE FUNCTION public.settings_effective(_scope text, _scope_id text)
RETURNS TABLE(setting_key text, effective_value jsonb, source text, is_overridden boolean, parent_inherited_value jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cluster text := public.settings_cluster_of(_scope, _scope_id);
BEGIN
  RETURN QUERY
  WITH keys AS (
    SELECT DISTINCT s.key FROM public.settings_scoped s
    WHERE s.is_overridden
      AND (
        (s.scope = 'GLOBAL')
        OR (_scope <> 'GLOBAL' AND s.scope = 'CLUSTER' AND s.scope_id = v_cluster)
        OR (_scope = 'BRANCH' AND s.scope = 'BRANCH' AND s.scope_id = _scope_id)
      )
  ), vals AS (
    SELECT k.key,
      (SELECT s.value FROM public.settings_scoped s
        WHERE s.scope = 'GLOBAL' AND s.scope_id = '' AND s.key = k.key AND s.is_overridden) AS g,
      (SELECT s.value FROM public.settings_scoped s
        WHERE s.scope = 'CLUSTER' AND s.scope_id = v_cluster AND s.key = k.key AND s.is_overridden) AS c,
      (SELECT s.value FROM public.settings_scoped s
        WHERE s.scope = 'BRANCH' AND s.scope_id = _scope_id AND s.key = k.key AND s.is_overridden) AS b
    FROM keys k
  )
  SELECT
    v.key,
    CASE _scope WHEN 'GLOBAL' THEN v.g WHEN 'CLUSTER' THEN COALESCE(v.c, v.g) ELSE COALESCE(v.b, v.c, v.g) END,
    CASE
      WHEN _scope = 'BRANCH' AND v.b IS NOT NULL THEN 'BRANCH'
      WHEN _scope <> 'GLOBAL' AND v.c IS NOT NULL THEN 'CLUSTER'
      ELSE 'GLOBAL'
    END,
    CASE _scope WHEN 'GLOBAL' THEN v.g IS NOT NULL WHEN 'CLUSTER' THEN v.c IS NOT NULL ELSE v.b IS NOT NULL END,
    CASE _scope WHEN 'GLOBAL' THEN NULL::jsonb WHEN 'CLUSTER' THEN v.g ELSE COALESCE(v.c, v.g) END
  FROM vals v;
END;
$$;

CREATE OR REPLACE FUNCTION public.settings_upsert(_scope text, _scope_id text, _patch jsonb)
RETURNS TABLE(setting_key text, effective_value jsonb, source text, is_overridden boolean, parent_inherited_value jsonb)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec record;
  v_actor text := COALESCE(auth.uid()::text, 'system');
BEGIN
  IF NOT public.is_supervisor_now() THEN
    RAISE EXCEPTION 'Not allowed to change settings';
  END IF;
  IF _scope NOT IN ('GLOBAL','CLUSTER','BRANCH') THEN
    RAISE EXCEPTION 'Unknown settings scope %', _scope;
  END IF;

  FOR rec IN SELECT * FROM jsonb_each(COALESCE(_patch, '{}'::jsonb)) LOOP
    IF COALESCE((rec.value->>'is_overridden')::boolean, false) OR _scope = 'GLOBAL' THEN
      INSERT INTO public.settings_scoped(scope, scope_id, key, value, is_overridden, updated_by)
      VALUES (_scope, COALESCE(_scope_id, ''), rec.key, rec.value->'value', true, v_actor)
      ON CONFLICT (scope, scope_id, key)
      DO UPDATE SET value = EXCLUDED.value, is_overridden = true,
                    updated_by = EXCLUDED.updated_by, updated_at = now();
    ELSE
      DELETE FROM public.settings_scoped s
      WHERE s.scope = _scope AND s.scope_id = COALESCE(_scope_id, '') AND s.key = rec.key;
    END IF;
  END LOOP;

  RETURN QUERY SELECT * FROM public.settings_effective(_scope, _scope_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.settings_sync_batch(_scope text, _scope_id text, _keys text[])
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_targets int := 0;
  v_written int := 0;
  v_detail jsonb := '[]'::jsonb;
  v_actor text := COALESCE(auth.uid()::text, 'system');
  store record;
  n int;
BEGIN
  IF NOT public.is_supervisor_now() THEN
    RAISE EXCEPTION 'Not allowed to push settings';
  END IF;

  FOR store IN
    SELECT st.id, st.name FROM public.stores st
    WHERE st.archived_at IS NULL
      AND (_scope = 'GLOBAL' OR COALESCE(NULLIF(st.group_id, ''), 'default') = _scope_id)
  LOOP
    v_targets := v_targets + 1;
    n := 0;
    INSERT INTO public.settings_scoped(scope, scope_id, key, value, is_overridden, updated_by)
    SELECT 'BRANCH', store.id, e.setting_key, e.effective_value, true, v_actor
    FROM public.settings_effective(_scope, _scope_id) e
    WHERE (_keys IS NULL OR e.setting_key = ANY(_keys))
      AND e.effective_value IS NOT NULL
    ON CONFLICT (scope, scope_id, key)
    DO UPDATE SET value = EXCLUDED.value, is_overridden = true,
                  updated_by = EXCLUDED.updated_by, updated_at = now();
    GET DIAGNOSTICS n = ROW_COUNT;
    v_written := v_written + n;
    v_detail := v_detail || jsonb_build_object('store_id', store.id, 'store_name', store.name, 'written', n);
  END LOOP;

  RETURN jsonb_build_object('targets', v_targets, 'written', v_written, 'detail', v_detail);
END;
$$;

REVOKE ALL ON FUNCTION public.settings_effective(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.settings_upsert(text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.settings_sync_batch(text, text, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.settings_cluster_of(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.settings_effective(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.settings_upsert(text, text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.settings_sync_batch(text, text, text[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.settings_cluster_of(text, text) TO authenticated, service_role;