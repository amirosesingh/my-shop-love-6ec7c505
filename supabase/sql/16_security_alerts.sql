-- ============================================================
-- 16 · Security alerts
-- Findings raised by deployment scans and by the nightly database
-- posture self-check. Visible to admins only. Idempotent.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.security_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint text NOT NULL UNIQUE,
  source text NOT NULL CHECK (source IN ('ci', 'selfcheck', 'manual')),
  severity text NOT NULL DEFAULT 'medium'
    CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info')),
  title text NOT NULL,
  detail text NOT NULL DEFAULT '',
  deployment_ref text,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'acknowledged', 'resolved')),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_by text,
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, UPDATE ON public.security_findings TO authenticated;
GRANT ALL ON public.security_findings TO service_role;
ALTER TABLE public.security_findings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins read security findings" ON public.security_findings;
CREATE POLICY "admins read security findings"
  ON public.security_findings FOR SELECT TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'admin'));

DROP POLICY IF EXISTS "admins update security findings" ON public.security_findings;
CREATE POLICY "admins update security findings"
  ON public.security_findings FOR UPDATE TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'admin'))
  WITH CHECK (public.has_role((SELECT auth.uid()), 'admin'));

CREATE INDEX IF NOT EXISTS security_findings_open_idx
  ON public.security_findings (severity, last_seen_at DESC) WHERE status <> 'resolved';
CREATE INDEX IF NOT EXISTS security_findings_source_idx
  ON public.security_findings (source, status);
CREATE INDEX IF NOT EXISTS security_findings_seen_idx
  ON public.security_findings (last_seen_at DESC);

DROP TRIGGER IF EXISTS security_findings_touch ON public.security_findings;
CREATE TRIGGER security_findings_touch
  BEFORE UPDATE ON public.security_findings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Ingest: append-only, de-duplicates on fingerprint, auto-closes stale rows.
CREATE OR REPLACE FUNCTION public.security_report_findings(
  _source text, _deployment_ref text, _findings jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _item jsonb; _fp text; _seen text[] := ARRAY[]::text[];
  _new integer := 0; _inserted boolean; _resolved integer := 0;
BEGIN
  IF coalesce(_source, '') NOT IN ('ci', 'selfcheck') THEN RAISE EXCEPTION 'INVALID_SOURCE'; END IF;
  IF _findings IS NULL OR jsonb_typeof(_findings) <> 'array' THEN RAISE EXCEPTION 'INVALID_PAYLOAD'; END IF;
  IF jsonb_array_length(_findings) > 200 THEN RAISE EXCEPTION 'TOO_MANY_FINDINGS'; END IF;
  IF (SELECT count(*) FROM public.security_findings
       WHERE created_at > now() - interval '1 hour') > 200 THEN
    RAISE EXCEPTION 'REPORT_RATE_LIMITED';
  END IF;

  FOR _item IN SELECT * FROM jsonb_array_elements(_findings) LOOP
    IF coalesce(trim(_item ->> 'title'), '') = '' THEN CONTINUE; END IF;
    _fp := _source || ':' || coalesce(nullif(trim(_item ->> 'id'), ''),
                                      md5(lower(trim(_item ->> 'title'))));
    _seen := _seen || _fp;

    INSERT INTO public.security_findings AS f
      (fingerprint, source, severity, title, detail, deployment_ref)
    VALUES (
      left(_fp, 200), _source,
      CASE lower(coalesce(_item ->> 'severity', 'medium'))
        WHEN 'critical' THEN 'critical' WHEN 'high' THEN 'high'
        WHEN 'low' THEN 'low' WHEN 'info' THEN 'info' ELSE 'medium' END,
      left(trim(_item ->> 'title'), 200),
      left(coalesce(_item ->> 'detail', ''), 4000),
      left(coalesce(_deployment_ref, ''), 200))
    ON CONFLICT (fingerprint) DO UPDATE
      SET last_seen_at   = now(),
          severity       = excluded.severity,
          detail         = excluded.detail,
          deployment_ref = coalesce(nullif(excluded.deployment_ref, ''), f.deployment_ref),
          status         = CASE WHEN f.status = 'resolved' THEN 'open' ELSE f.status END,
          resolved_at    = CASE WHEN f.status = 'resolved' THEN NULL ELSE f.resolved_at END
    RETURNING (xmax = 0) INTO _inserted;

    IF _inserted THEN _new := _new + 1; END IF;
  END LOOP;

  UPDATE public.security_findings
     SET status = 'resolved', resolved_at = now()
   WHERE source = _source AND status <> 'resolved' AND NOT (fingerprint = ANY (_seen));
  GET DIAGNOSTICS _resolved = ROW_COUNT;

  RETURN jsonb_build_object('new', _new, 'reported', array_length(_seen, 1), 'resolved', _resolved);
END $function$;

-- Nightly drift audit of the database's own posture.
CREATE OR REPLACE FUNCTION public.security_selfcheck()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE _found jsonb := '[]'::jsonb; r record;
BEGIN
  IF (SELECT auth.uid()) IS NOT NULL AND NOT public.has_role((SELECT auth.uid()), 'admin') THEN
    RAISE EXCEPTION 'Only admins can run the security self-check';
  END IF;

  FOR r IN
    SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity
  LOOP
    _found := _found || jsonb_build_object(
      'id', 'rls_disabled:' || r.name, 'severity', 'critical',
      'title', 'Table "' || r.name || '" has no row protection',
      'detail', 'Row level security is switched off, so the data API exposes every row of this table.');
  END LOOP;

  FOR r IN
    SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
      AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid)
      AND (has_table_privilege('anon', c.oid, 'SELECT')
        OR has_table_privilege('authenticated', c.oid, 'SELECT'))
  LOOP
    _found := _found || jsonb_build_object(
      'id', 'rls_no_policy:' || r.name, 'severity', 'high',
      'title', 'Table "' || r.name || '" is reachable but has no access rules',
      'detail', 'Row protection is on with no policies, so every read of this table fails or leaks depending on grants.');
  END LOOP;

  FOR r IN
    SELECT p.proname AS name FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
      AND has_function_privilege('anon', p.oid, 'execute')
      AND p.proname NOT IN ('coupon_claim', 'member_welcome_claim', 'voucher_by_token',
                            'verify_cashier_pin', 'verify_terminal_pin',
                            'terminal_token_heartbeat', 'security_report_findings')
  LOOP
    _found := _found || jsonb_build_object(
      'id', 'anon_definer:' || r.name, 'severity', 'high',
      'title', 'Privileged routine "' || r.name || '" is callable by visitors',
      'detail', 'This routine runs with elevated rights and is no longer restricted to signed-in staff.');
  END LOOP;

  FOR r IN
    SELECT p.proname AS name FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
      AND coalesce(array_to_string(p.proconfig, ','), '') NOT LIKE '%search_path%'
  LOOP
    _found := _found || jsonb_build_object(
      'id', 'unlocked_path:' || r.name, 'severity', 'medium',
      'title', 'Privileged routine "' || r.name || '" has no locked lookup path',
      'detail', 'Without a locked search path this routine can be hijacked by a look-alike object.');
  END LOOP;

  RETURN public.security_report_findings('selfcheck', 'nightly', _found);
END $function$;

CREATE OR REPLACE FUNCTION public.security_set_finding_status(
  _id uuid, _status text, _by text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.has_role((SELECT auth.uid()), 'admin') THEN
    RAISE EXCEPTION 'Only admins can manage security alerts';
  END IF;
  IF _status NOT IN ('open', 'acknowledged', 'resolved') THEN RAISE EXCEPTION 'INVALID_STATUS'; END IF;

  UPDATE public.security_findings
     SET status          = _status,
         acknowledged_by = CASE WHEN _status = 'open' THEN NULL ELSE left(coalesce(_by, ''), 120) END,
         acknowledged_at = CASE WHEN _status = 'open' THEN NULL ELSE now() END,
         resolved_at     = CASE WHEN _status = 'resolved' THEN now() ELSE NULL END
   WHERE id = _id;
END $function$;

REVOKE ALL ON FUNCTION public.security_report_findings(text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.security_selfcheck() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.security_set_finding_status(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.security_report_findings(text, text, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.security_selfcheck() TO authenticated;
GRANT EXECUTE ON FUNCTION public.security_set_finding_status(uuid, text, text) TO authenticated;

-- Nightly run at 03:00.
CREATE EXTENSION IF NOT EXISTS pg_cron;
DO $cron$
BEGIN
  PERFORM cron.unschedule('security-selfcheck');
EXCEPTION WHEN OTHERS THEN NULL;
END $cron$;
SELECT cron.schedule('security-selfcheck', '0 3 * * *', $$SELECT public.security_selfcheck();$$);
