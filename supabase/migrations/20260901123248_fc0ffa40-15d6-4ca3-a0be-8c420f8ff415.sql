-- The append-only guard is a trigger; nothing should be able to call it
-- directly through the API.
ALTER FUNCTION public.entity_status_history_immutable() SECURITY INVOKER;
REVOKE ALL ON FUNCTION public.entity_status_history_immutable() FROM PUBLIC, anon, authenticated;