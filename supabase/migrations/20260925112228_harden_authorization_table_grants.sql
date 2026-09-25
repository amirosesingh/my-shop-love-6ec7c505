-- Approval requests are decided through server-owned handlers. Keep direct
-- clients read-only (and branch-scoped by RLS) while preserving relay access.
REVOKE ALL ON public.authorization_actions FROM anon, authenticated;
REVOKE ALL ON public.authorization_requests FROM anon, authenticated;
REVOKE ALL ON public.authorization_log FROM anon, authenticated;

GRANT SELECT ON public.authorization_actions TO authenticated;
GRANT SELECT ON public.authorization_requests TO authenticated;
GRANT SELECT ON public.authorization_log TO authenticated;

GRANT ALL ON public.authorization_actions TO service_role;
GRANT ALL ON public.authorization_requests TO service_role;
GRANT ALL ON public.authorization_log TO service_role;
