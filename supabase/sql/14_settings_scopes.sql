-- ============================================================
-- 14_settings_scopes.sql — multi-level settings inheritance
-- Global → Cluster → Branch, with per-key override flags,
-- effective-value resolution and a batch push to child branches.
-- Safe to run repeatedly: nothing is dropped destructively.
-- Requires: 00_extensions_and_enums.sql, 01_stores_and_terminals.sql,
--           02_staff_and_access.sql
-- ============================================================

-- ---------- cluster registry ----------
CREATE TABLE IF NOT EXISTS public.store_groups (
  id text NOT NULL,
  name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

DROP TRIGGER IF EXISTS store_groups_touch ON public.store_groups;
CREATE TRIGGER store_groups_touch BEFORE UPDATE ON public.store_groups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.store_groups (id, name) VALUES ('default', 'Default cluster')
ON CONFLICT (id) DO NOTHING;

-- Every cluster referenced by a store gets a row, so the picker is never empty.
INSERT INTO public.store_groups (id, name)
SELECT DISTINCT s.group_id, s.group_id
  FROM public.stores s
 WHERE coalesce(s.group_id, '') <> ''
ON CONFLICT (id) DO NOTHING;

GRANT SELECT ON public.store_groups TO authenticated;
GRANT ALL ON public.store_groups TO service_role;
ALTER TABLE public.store_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff read clusters" ON public.store_groups;
CREATE POLICY "Staff read clusters" ON public.store_groups
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

-- ---------- scoped settings ----------
CREATE TABLE IF NOT EXISTS public.settings_scoped (
  scope text NOT NULL CHECK (scope IN ('GLOBAL', 'CLUSTER', 'BRANCH')),
  scope_id text NOT NULL DEFAULT '',
  key text NOT NULL,
  value jsonb NOT NULL DEFAULT 'null'::jsonb,
  is_overridden boolean NOT NULL DEFAULT true,
  updated_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope, scope_id, key)
);

DROP TRIGGER IF EXISTS settings_scoped_touch ON public.settings_scoped;
CREATE TRIGGER settings_scoped_touch BEFORE UPDATE ON public.settings_scoped
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS settings_scoped_scope_idx
  ON public.settings_scoped (scope, scope_id);

GRANT SELECT ON public.settings_scoped TO authenticated;
GRANT ALL ON public.settings_scoped TO service_role;
ALTER TABLE public.settings_scoped ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff read scoped settings" ON public.settings_scoped;
CREATE POLICY "Staff read scoped settings" ON public.settings_scoped
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

-- ---------- helpers ----------
CREATE OR REPLACE FUNCTION public.settings_cluster_of(_store_id text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT coalesce(nullif(s.group_id, ''), 'default')
    FROM public.stores s
   WHERE s.id = _store_id
   LIMIT 1
$function$;

DROP FUNCTION IF EXISTS public.settings_effective(text, text);

CREATE OR REPLACE FUNCTION public.settings_effective(_scope text, _scope_id text)
 RETURNS TABLE(
   setting_key text,
   effective_value jsonb,
   source text,
   is_overridden boolean,
   parent_inherited_value jsonb
 )
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _cluster text := '';
  _branch  text := '';
  r record;
  gv jsonb; cv jsonb; bv jsonb;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Only staff can read settings';
  END IF;

  IF _scope = 'BRANCH' THEN
    _branch  := coalesce(_scope_id, '');
    _cluster := coalesce(public.settings_cluster_of(_branch), 'default');
  ELSIF _scope = 'CLUSTER' THEN
    _cluster := coalesce(_scope_id, '');
  END IF;

  FOR r IN
    SELECT DISTINCT s.key
      FROM public.settings_scoped s
     WHERE s.scope = 'GLOBAL'
        OR (s.scope = 'CLUSTER' AND s.scope_id = _cluster)
        OR (s.scope = 'BRANCH'  AND s.scope_id = _branch)
  LOOP
    SELECT s.value INTO gv FROM public.settings_scoped s
     WHERE s.scope = 'GLOBAL' AND s.key = r.key AND s.is_overridden;
    SELECT s.value INTO cv FROM public.settings_scoped s
     WHERE s.scope = 'CLUSTER' AND s.scope_id = _cluster AND s.key = r.key AND s.is_overridden;
    SELECT s.value INTO bv FROM public.settings_scoped s
     WHERE s.scope = 'BRANCH' AND s.scope_id = _branch AND s.key = r.key AND s.is_overridden;

    setting_key := r.key;

    IF _scope = 'GLOBAL' THEN
      effective_value := gv;
      source := 'GLOBAL';
      is_overridden := gv IS NOT NULL;
      parent_inherited_value := NULL;
    ELSIF _scope = 'CLUSTER' THEN
      effective_value := coalesce(cv, gv);
      source := CASE WHEN cv IS NOT NULL THEN 'CLUSTER' ELSE 'GLOBAL' END;
      is_overridden := cv IS NOT NULL;
      parent_inherited_value := gv;
    ELSE
      effective_value := coalesce(bv, cv, gv);
      source := CASE
                  WHEN bv IS NOT NULL THEN 'BRANCH'
                  WHEN cv IS NOT NULL THEN 'CLUSTER'
                  ELSE 'GLOBAL'
                END;
      is_overridden := bv IS NOT NULL;
      parent_inherited_value := coalesce(cv, gv);
    END IF;

    IF effective_value IS NOT NULL OR parent_inherited_value IS NOT NULL THEN
      RETURN NEXT;
    END IF;
  END LOOP;
END $function$;

DROP FUNCTION IF EXISTS public.settings_upsert(text, text, jsonb);

-- _patch shape: { "<key>": { "value": <json>, "is_overridden": true|false }, ... }
CREATE OR REPLACE FUNCTION public.settings_upsert(_scope text, _scope_id text, _patch jsonb)
 RETURNS TABLE(
   setting_key text,
   effective_value jsonb,
   source text,
   is_overridden boolean,
   parent_inherited_value jsonb
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  k text;
  entry jsonb;
  keep boolean;
  who text := coalesce(auth.uid()::text, 'system');
BEGIN
  IF NOT public.is_app_supervisor() THEN
    RAISE EXCEPTION 'Only supervisors can change settings';
  END IF;
  IF _scope NOT IN ('GLOBAL', 'CLUSTER', 'BRANCH') THEN
    RAISE EXCEPTION 'UNKNOWN_SCOPE';
  END IF;
  IF _scope = 'GLOBAL' THEN _scope_id := ''; END IF;

  FOR k, entry IN SELECT * FROM jsonb_each(coalesce(_patch, '{}'::jsonb)) LOOP
    keep := coalesce((entry ->> 'is_overridden')::boolean, true);
    -- The global tier has no parent, so it always keeps its own value.
    IF _scope = 'GLOBAL' THEN keep := true; END IF;

    IF keep THEN
      INSERT INTO public.settings_scoped (scope, scope_id, key, value, is_overridden, updated_by)
      VALUES (_scope, coalesce(_scope_id, ''), k, coalesce(entry -> 'value', 'null'::jsonb), true, who)
      ON CONFLICT (scope, scope_id, key) DO UPDATE
        SET value = excluded.value, is_overridden = true,
            updated_by = excluded.updated_by, updated_at = now();
    ELSE
      -- Dropping the override falls the key back to the parent tier.
      DELETE FROM public.settings_scoped s
       WHERE s.scope = _scope AND s.scope_id = coalesce(_scope_id, '') AND s.key = k;
    END IF;
  END LOOP;

  RETURN QUERY SELECT * FROM public.settings_effective(_scope, coalesce(_scope_id, ''));
END $function$;

DROP FUNCTION IF EXISTS public.settings_sync_batch(text, text, text[]);

-- Push the source scope's effective values down to every child branch.
CREATE OR REPLACE FUNCTION public.settings_sync_batch(_scope text, _scope_id text, _keys text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  target record;
  eff record;
  written integer := 0;
  targets integer := 0;
  who text := coalesce(auth.uid()::text, 'system');
  log jsonb := '[]'::jsonb;
  per integer;
BEGIN
  IF NOT public.is_app_supervisor() THEN
    RAISE EXCEPTION 'Only supervisors can push settings';
  END IF;
  IF _scope NOT IN ('GLOBAL', 'CLUSTER') THEN
    RAISE EXCEPTION 'PUSH_SOURCE_MUST_BE_GLOBAL_OR_CLUSTER';
  END IF;

  FOR target IN
    SELECT s.id, s.name FROM public.stores s
     WHERE _scope = 'GLOBAL'
        OR coalesce(nullif(s.group_id, ''), 'default') = coalesce(nullif(_scope_id, ''), 'default')
  LOOP
    targets := targets + 1;
    per := 0;
    FOR eff IN SELECT * FROM public.settings_effective(_scope, coalesce(_scope_id, '')) LOOP
      CONTINUE WHEN _keys IS NOT NULL
                AND array_length(_keys, 1) IS NOT NULL
                AND NOT (eff.setting_key = ANY (_keys));
      CONTINUE WHEN eff.effective_value IS NULL;

      INSERT INTO public.settings_scoped (scope, scope_id, key, value, is_overridden, updated_by)
      VALUES ('BRANCH', target.id, eff.setting_key, eff.effective_value, true, who)
      ON CONFLICT (scope, scope_id, key) DO UPDATE
        SET value = excluded.value, is_overridden = true,
            updated_by = excluded.updated_by, updated_at = now();
      per := per + 1;
      written := written + 1;
    END LOOP;
    log := log || jsonb_build_object('store_id', target.id, 'store_name', target.name, 'written', per);
  END LOOP;

  RETURN jsonb_build_object('targets', targets, 'written', written, 'detail', log);
END $function$;

REVOKE ALL ON FUNCTION public.settings_upsert(text, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.settings_sync_batch(text, text, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.settings_effective(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.settings_cluster_of(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.settings_upsert(text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.settings_sync_batch(text, text, text[]) TO authenticated;

-- ---------- verification ----------
SELECT t.name AS table_name,
       CASE WHEN to_regclass('public.' || t.name) IS NULL THEN 'MISSING' ELSE 'OK' END AS status
FROM (VALUES ('store_groups'), ('settings_scoped')) AS t(name);