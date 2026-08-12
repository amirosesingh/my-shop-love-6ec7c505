-- 37: server-side PIN attempt brake + withdraw anonymous security reporting.
CREATE TABLE IF NOT EXISTS public.pin_attempts (
  key text PRIMARY KEY,
  attempts integer NOT NULL DEFAULT 0,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.pin_attempts TO service_role;
ALTER TABLE public.pin_attempts ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.pin_throttle_status(_key text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT jsonb_build_object(
        'locked', (a.locked_until IS NOT NULL AND a.locked_until > now()),
        'locked_until', a.locked_until,
        'attempts', a.attempts)
     FROM public.pin_attempts a WHERE a.key = _key),
    jsonb_build_object('locked', false, 'attempts', 0));
$$;

CREATE OR REPLACE FUNCTION public.pin_throttle_fail(
  _key text, _limit integer DEFAULT 5, _window_secs integer DEFAULT 900, _lock_secs integer DEFAULT 300
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE row public.pin_attempts;
BEGIN
  INSERT INTO public.pin_attempts (key, attempts, window_started_at, updated_at)
  VALUES (_key, 1, now(), now())
  ON CONFLICT (key) DO UPDATE
    SET attempts = CASE WHEN public.pin_attempts.window_started_at < now() - make_interval(secs => _window_secs)
          THEN 1 ELSE public.pin_attempts.attempts + 1 END,
        window_started_at = CASE WHEN public.pin_attempts.window_started_at < now() - make_interval(secs => _window_secs)
          THEN now() ELSE public.pin_attempts.window_started_at END,
        updated_at = now()
  RETURNING * INTO row;

  IF row.attempts >= _limit THEN
    UPDATE public.pin_attempts
      SET locked_until = now() + make_interval(secs => _lock_secs),
          attempts = 0, window_started_at = now(), updated_at = now()
      WHERE key = _key RETURNING * INTO row;
  END IF;

  RETURN jsonb_build_object(
    'locked', (row.locked_until IS NOT NULL AND row.locked_until > now()),
    'locked_until', row.locked_until, 'attempts', row.attempts);
END;
$$;

CREATE OR REPLACE FUNCTION public.pin_throttle_reset(_key text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM public.pin_attempts WHERE key = _key;
$$;

REVOKE ALL ON FUNCTION public.pin_throttle_status(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pin_throttle_fail(text, integer, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pin_throttle_reset(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pin_throttle_status(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.pin_throttle_fail(text, integer, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.pin_throttle_reset(text) TO service_role;

REVOKE ALL ON FUNCTION public.security_report_findings(text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.security_report_findings(text, text, jsonb) TO authenticated, service_role;
