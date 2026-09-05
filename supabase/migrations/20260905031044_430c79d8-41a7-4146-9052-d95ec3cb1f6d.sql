-- Four SECURITY DEFINER routines were runnable by any signed-in account.
-- They set credentials or write the security record, so each now proves the
-- caller is a supervisor. Trusted server-side calls (service_role) still pass.

CREATE OR REPLACE FUNCTION public.assert_supervisor_caller()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF coalesce(auth.role(), '') = 'service_role' THEN RETURN; END IF;
  IF NOT public.is_app_supervisor() THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.assert_supervisor_caller() TO authenticated;
GRANT EXECUTE ON FUNCTION public.assert_supervisor_caller() TO service_role;

CREATE OR REPLACE FUNCTION public.set_authorization_pin(p_user_id text, p_pin text, p_updated_by text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp', 'extensions'
AS $function$
BEGIN
  PERFORM public.assert_supervisor_caller();
  IF p_pin !~ '^[0-9]{4,8}$' THEN
    RAISE EXCEPTION 'A PIN must be 4 to 8 digits';
  END IF;
  UPDATE public.app_users
     SET pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf', 10)),
         pin_length = length(p_pin),
         pin_set_at = now(),
         pin_updated_by = p_updated_by,
         updated_at = now()
   WHERE lower(user_id) = lower(btrim(p_user_id));
  RETURN FOUND;
END $function$;

CREATE OR REPLACE FUNCTION public.staff_account_set_pin(p_user_id text, p_pin text, p_pin_length smallint DEFAULT 4)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  PERFORM public.assert_supervisor_caller();
  IF coalesce(p_pin, '') = '' OR length(p_pin) < 4 OR length(p_pin) > 32 THEN
    RAISE EXCEPTION 'STAFF_PIN_INVALID';
  END IF;
  UPDATE public.app_users
  SET pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf', 10)),
      pin_length = least(length(p_pin), 32)::smallint,
      updated_at = now()
  WHERE lower(user_id) = lower(trim(p_user_id));
END
$function$;

CREATE OR REPLACE FUNCTION public.staff_account_adopt_legacy(p_username text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE c public.cashiers%rowtype;
BEGIN
  PERFORM public.assert_supervisor_caller();
  SELECT * INTO c FROM public.cashiers WHERE lower(username) = lower(trim(p_username));
  IF NOT FOUND THEN RETURN; END IF;
  INSERT INTO public.app_users
    (user_id, full_name, email, role, role_slug, store_id, is_active, pin_hash, pin_length, permissions)
  VALUES
    (lower(c.username), coalesce(nullif(trim(c.full_name), ''), c.username),
     lower(c.username) || '@pos-internal.local', 'staff'::public.app_role,
     coalesce(c.role_slug, 'cashier'), c.store_id, c.is_active, c.pin_hash, 6,
     coalesce(c.permissions, '{}'::jsonb))
  ON CONFLICT (user_id) DO UPDATE SET
    pin_hash = CASE WHEN public.app_users.pin_hash = '' THEN EXCLUDED.pin_hash ELSE public.app_users.pin_hash END,
    role_slug = coalesce(public.app_users.role_slug, EXCLUDED.role_slug),
    updated_at = now();
END
$function$;

CREATE OR REPLACE FUNCTION public.security_report_findings(_source text, _deployment_ref text, _findings jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _item jsonb;
  _fp text;
  _seen text[] := ARRAY[]::text[];
  _new integer := 0;
  _inserted boolean;
  _resolved integer := 0;
BEGIN
  PERFORM public.assert_supervisor_caller();
  IF coalesce(_source, '') NOT IN ('ci', 'selfcheck') THEN
    RAISE EXCEPTION 'INVALID_SOURCE';
  END IF;
  IF _findings IS NULL OR jsonb_typeof(_findings) <> 'array' THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD';
  END IF;
  IF jsonb_array_length(_findings) > 200 THEN
    RAISE EXCEPTION 'TOO_MANY_FINDINGS';
  END IF;
  IF (SELECT count(*) FROM public.security_findings
       WHERE created_at > now() - interval '1 hour') > 200 THEN
    RAISE EXCEPTION 'REPORT_RATE_LIMITED';
  END IF;

  FOR _item IN SELECT * FROM jsonb_array_elements(_findings) LOOP
    IF coalesce(trim(_item ->> 'title'), '') = '' THEN CONTINUE; END IF;

    _fp := _source || ':' || coalesce(
      nullif(trim(_item ->> 'id'), ''),
      md5(lower(trim(_item ->> 'title'))));

    _seen := _seen || _fp;

    INSERT INTO public.security_findings AS f
      (fingerprint, source, severity, title, detail, deployment_ref)
    VALUES (
      left(_fp, 200),
      _source,
      CASE lower(coalesce(_item ->> 'severity', 'medium'))
        WHEN 'critical' THEN 'critical' WHEN 'high' THEN 'high'
        WHEN 'low' THEN 'low' WHEN 'info' THEN 'info' ELSE 'medium' END,
      left(trim(_item ->> 'title'), 200),
      left(coalesce(_item ->> 'detail', ''), 4000),
      left(coalesce(_deployment_ref, ''), 200)
    )
    ON CONFLICT (fingerprint) DO UPDATE
      SET last_seen_at    = now(),
          severity        = excluded.severity,
          detail          = excluded.detail,
          deployment_ref  = coalesce(nullif(excluded.deployment_ref, ''), f.deployment_ref),
          status          = CASE WHEN f.status = 'resolved' THEN 'open' ELSE f.status END,
          resolved_at     = CASE WHEN f.status = 'resolved' THEN NULL ELSE f.resolved_at END
    RETURNING (xmax = 0) INTO _inserted;

    IF _inserted THEN _new := _new + 1; END IF;
  END LOOP;

  UPDATE public.security_findings
     SET status = 'resolved', resolved_at = now()
   WHERE source = _source AND status <> 'resolved' AND NOT (fingerprint = ANY (_seen));
  GET DIAGNOSTICS _resolved = ROW_COUNT;

  RETURN jsonb_build_object('new', _new, 'reported', array_length(_seen, 1),
                            'resolved', _resolved);
END $function$;