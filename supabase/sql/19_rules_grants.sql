-- Run once on the POS database when saving rules fails with
-- "permission denied for function pos_rules_save" (SQLSTATE 42501).
GRANT EXECUTE ON FUNCTION public.pos_rules_get(text)          TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pos_rules_save(text, jsonb)  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_app_supervisor()          TO authenticated, service_role;