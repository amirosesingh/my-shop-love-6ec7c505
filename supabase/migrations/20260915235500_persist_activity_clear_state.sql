ALTER TABLE public.activity_events
  ADD COLUMN IF NOT EXISTS cleared_by text[] NOT NULL DEFAULT '{}'::text[];

CREATE OR REPLACE FUNCTION public.activity_events_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.cleared_by IS DISTINCT FROM OLD.cleared_by
     AND (to_jsonb(NEW) - 'cleared_by') = (to_jsonb(OLD) - 'cleared_by') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'activity_events rows cannot be % ', TG_OP;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_activity_event_cleared(p_event_id uuid, p_cleared boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE _user_id text;
BEGIN
  SELECT a.user_id INTO _user_id FROM public.app_users a
   WHERE a.auth_user_id = auth.uid()
      OR lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', '')) LIMIT 1;
  IF _user_id IS NULL OR NOT public.is_app_supervisor() THEN
    RAISE EXCEPTION 'A signed-in supervisor is required';
  END IF;
  UPDATE public.activity_events SET cleared_by = CASE
    WHEN p_cleared THEN array(SELECT DISTINCT x FROM unnest(cleared_by || _user_id) x)
    ELSE array_remove(cleared_by, _user_id) END WHERE id = p_event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_activity_event_cleared(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_activity_event_cleared(uuid, boolean) TO authenticated;
