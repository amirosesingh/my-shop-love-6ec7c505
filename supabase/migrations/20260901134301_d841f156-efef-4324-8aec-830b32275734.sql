REVOKE ALL ON FUNCTION public.stock_transfers_enforce_lifecycle() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.stock_transfer_items_enforce_quantities() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.stock_transfer_approval_required(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stock_transfer_approval_required(text) TO authenticated, service_role;