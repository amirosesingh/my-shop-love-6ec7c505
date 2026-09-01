REVOKE ALL ON FUNCTION public.shift_log_event(uuid, text, text, text, jsonb, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.shift_log_event(uuid, text, text, text, jsonb, text) TO service_role;

REVOKE ALL ON FUNCTION public.shift_expected_view(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.shift_expected_view(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.shift_close_start(uuid, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.shift_close_start(uuid, text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.shift_cash_count_submit(uuid, numeric, numeric, numeric, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.shift_cash_count_submit(uuid, numeric, numeric, numeric, text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.shift_recount_submit(uuid, numeric, text, numeric, numeric, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.shift_recount_submit(uuid, numeric, text, numeric, numeric, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.shift_variance_approve(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.shift_variance_approve(uuid, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.shift_state(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.shift_state(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.shift_records_immutable() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.shifts_guard_client_writes() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.sales_block_closing_shift() FROM public, anon, authenticated;