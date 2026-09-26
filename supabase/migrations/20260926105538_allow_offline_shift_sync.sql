-- Local Electron terminals own their operational shift transaction. The
-- background sync path must be able to reproduce that committed state without
-- the ordinary client-write guards erasing financial fields. Append-only
-- closing records accept an id once and are never updated or deleted.

CREATE OR REPLACE FUNCTION public.sync_apply_shifts(p_rows jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $fn$
DECLARE v_count integer;
BEGIN
  PERFORM set_config('pos.shift_fn','on',true);
  INSERT INTO public.shifts
    (id,store_id,terminal_id,terminal_name,opened_by_name,opened_by_staff_id,opened_by_role,
     closed_by_name,closed_by_staff_id,closed_by_role,opened_at,closed_at,opening_float,
     counted_cash,expected_cash,note,overdue,created_at,updated_at,status,closing_float,user_id,
     row_version,counted_card,counted_digital,expected_card,expected_digital,variance_cash,
     variance_card,variance_digital,variance_total,state,close_reason,closing_started_at,
     closing_started_by,final_counted_cash,variance_status)
  SELECT id,store_id,terminal_id,terminal_name,opened_by_name,opened_by_staff_id,opened_by_role,
     closed_by_name,closed_by_staff_id,closed_by_role,opened_at,closed_at,opening_float,
     counted_cash,expected_cash,note,overdue,created_at,updated_at,status,closing_float,user_id,
     row_version,counted_card,counted_digital,expected_card,expected_digital,variance_cash,
     variance_card,variance_digital,variance_total,state,close_reason,closing_started_at,
     closing_started_by,final_counted_cash,variance_status
  FROM jsonb_populate_recordset(NULL::public.shifts,COALESCE(p_rows,'[]'::jsonb))
  ON CONFLICT (id) DO UPDATE SET
    store_id=EXCLUDED.store_id,terminal_id=EXCLUDED.terminal_id,terminal_name=EXCLUDED.terminal_name,
    opened_by_name=EXCLUDED.opened_by_name,opened_by_staff_id=EXCLUDED.opened_by_staff_id,
    opened_by_role=EXCLUDED.opened_by_role,closed_by_name=EXCLUDED.closed_by_name,
    closed_by_staff_id=EXCLUDED.closed_by_staff_id,closed_by_role=EXCLUDED.closed_by_role,
    opened_at=EXCLUDED.opened_at,closed_at=EXCLUDED.closed_at,opening_float=EXCLUDED.opening_float,
    counted_cash=EXCLUDED.counted_cash,expected_cash=EXCLUDED.expected_cash,note=EXCLUDED.note,
    overdue=EXCLUDED.overdue,created_at=EXCLUDED.created_at,updated_at=EXCLUDED.updated_at,
    status=EXCLUDED.status,closing_float=EXCLUDED.closing_float,user_id=EXCLUDED.user_id,
    row_version=EXCLUDED.row_version,counted_card=EXCLUDED.counted_card,
    counted_digital=EXCLUDED.counted_digital,expected_card=EXCLUDED.expected_card,
    expected_digital=EXCLUDED.expected_digital,variance_cash=EXCLUDED.variance_cash,
    variance_card=EXCLUDED.variance_card,variance_digital=EXCLUDED.variance_digital,
    variance_total=EXCLUDED.variance_total,state=EXCLUDED.state,close_reason=EXCLUDED.close_reason,
    closing_started_at=EXCLUDED.closing_started_at,closing_started_by=EXCLUDED.closing_started_by,
    final_counted_cash=EXCLUDED.final_counted_cash,variance_status=EXCLUDED.variance_status
  WHERE EXCLUDED.row_version>public.shifts.row_version;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  PERFORM set_config('pos.shift_fn','',true);
  RETURN v_count;
END $fn$;

CREATE OR REPLACE FUNCTION public.sync_apply_shift_cash_counts(p_rows jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $fn$
DECLARE v_count integer;
BEGIN
  PERFORM set_config('pos.shift_fn','on',true);
  INSERT INTO public.shift_cash_counts
    (id,shift_id,store_id,terminal_id,kind,counted_cash,counted_card,counted_digital,reason,
     counted_by_name,counted_by_staff_id,counted_by_user_id,client_key,created_at)
  SELECT id,shift_id,store_id,terminal_id,kind,counted_cash,counted_card,counted_digital,reason,
     counted_by_name,counted_by_staff_id,counted_by_user_id,client_key,created_at
  FROM jsonb_populate_recordset(NULL::public.shift_cash_counts,COALESCE(p_rows,'[]'::jsonb))
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  PERFORM set_config('pos.shift_fn','',true);
  RETURN v_count;
END $fn$;

CREATE OR REPLACE FUNCTION public.sync_delete_shift_cash_counts(p_changes jsonb,p_branch_id text)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $fn$
BEGIN RETURN 0; END $fn$;

CREATE OR REPLACE FUNCTION public.sync_apply_shift_close_events(p_rows jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $fn$
DECLARE v_count integer;
BEGIN
  PERFORM set_config('pos.shift_fn','on',true);
  INSERT INTO public.shift_close_events
    (id,shift_id,store_id,terminal_id,event,from_state,to_state,detail,actor_name,actor_staff_id,
     actor_user_id,created_at)
  SELECT id,shift_id,store_id,terminal_id,event,from_state,to_state,detail,actor_name,actor_staff_id,
     actor_user_id,created_at
  FROM jsonb_populate_recordset(NULL::public.shift_close_events,COALESCE(p_rows,'[]'::jsonb))
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  PERFORM set_config('pos.shift_fn','',true);
  RETURN v_count;
END $fn$;

CREATE OR REPLACE FUNCTION public.sync_delete_shift_close_events(p_changes jsonb,p_branch_id text)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $fn$
BEGIN RETURN 0; END $fn$;

CREATE OR REPLACE FUNCTION public.sync_apply_shift_reconciliations(p_rows jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $fn$
DECLARE v_count integer;
BEGIN
  PERFORM set_config('pos.shift_fn','on',true);
  INSERT INTO public.shift_reconciliations
    (id,shift_id,store_id,count_id,expected_cash,expected_card,expected_digital,counted_cash,
     counted_card,counted_digital,variance_cash,variance_card,variance_digital,variance_total,
     variance_status,created_at)
  SELECT id,shift_id,store_id,count_id,expected_cash,expected_card,expected_digital,counted_cash,
     counted_card,counted_digital,variance_cash,variance_card,variance_digital,variance_total,
     variance_status,created_at
  FROM jsonb_populate_recordset(NULL::public.shift_reconciliations,COALESCE(p_rows,'[]'::jsonb))
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  PERFORM set_config('pos.shift_fn','',true);
  RETURN v_count;
END $fn$;

CREATE OR REPLACE FUNCTION public.sync_delete_shift_reconciliations(p_changes jsonb,p_branch_id text)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $fn$
BEGIN RETURN 0; END $fn$;

REVOKE ALL ON FUNCTION public.sync_apply_shifts(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_apply_shift_cash_counts(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_apply_shift_close_events(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_apply_shift_reconciliations(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_delete_shift_cash_counts(jsonb,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_delete_shift_close_events(jsonb,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_delete_shift_reconciliations(jsonb,text) FROM PUBLIC;
