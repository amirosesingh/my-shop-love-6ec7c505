CREATE TABLE IF NOT EXISTS public.system_audit_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  actor_id text,
  actor_name text,
  actor_role text,
  action_type text NOT NULL,
  entity_affected text,
  entity_id text,
  old_value jsonb,
  new_value jsonb,
  terminal_id text,
  ip_address text,
  store_id text,
  note text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS system_audit_logs_created_idx ON public.system_audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS system_audit_logs_actor_idx ON public.system_audit_logs (actor_id);
CREATE INDEX IF NOT EXISTS system_audit_logs_action_idx ON public.system_audit_logs (action_type);

GRANT SELECT ON public.system_audit_logs TO authenticated;
GRANT SELECT, INSERT ON public.system_audit_logs TO service_role;

ALTER TABLE public.system_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Supervisors read the audit trail" ON public.system_audit_logs;
CREATE POLICY "Supervisors read the audit trail"
ON public.system_audit_logs
FOR SELECT
TO authenticated
USING (public.is_supervisor_now());

-- No UPDATE or DELETE policy exists, and no such grants are issued: entries
-- are append-only for every role except the database owner.
CREATE OR REPLACE FUNCTION public.system_audit_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'system_audit_logs entries cannot be changed or removed';
END;
$$;

DROP TRIGGER IF EXISTS system_audit_logs_immutable ON public.system_audit_logs;
CREATE TRIGGER system_audit_logs_immutable
BEFORE UPDATE OR DELETE ON public.system_audit_logs
FOR EACH ROW EXECUTE FUNCTION public.system_audit_immutable();