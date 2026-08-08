-- Run once on the POS database when saving rules fails with
-- "permission denied for function pos_rules_save" (SQLSTATE 42501).
-- Elevated routines stay out of reach of visitors; the server calls them with
-- the internal service key.
REVOKE ALL ON FUNCTION public.pos_rules_get(text)         FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pos_rules_save(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_rules_get(text)          TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pos_rules_save(text, jsonb)  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_app_supervisor()          TO authenticated, service_role;