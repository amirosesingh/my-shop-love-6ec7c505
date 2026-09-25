-- Rebuild the local-to-cloud apply functions after recovering columns that
-- were hidden inside multi-column ALTER TABLE statements.
CREATE OR REPLACE FUNCTION public.sync_apply_shifts(p_rows jsonb) RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $fn$
DECLARE v_count integer; v_row jsonb;
BEGIN

  INSERT INTO public."shifts" ("id","store_id","terminal_id","terminal_name","opened_by_name","opened_by_staff_id","opened_by_role","closed_by_name","closed_by_staff_id","closed_by_role","opened_at","closed_at","opening_float","counted_cash","expected_cash","note","overdue","created_at","updated_at","status","closing_float","user_id","row_version","counted_card","counted_digital","expected_card","expected_digital","variance_cash","variance_card","variance_digital","variance_total","state","close_reason","closing_started_at","closing_started_by","final_counted_cash","variance_status")
  SELECT "id","store_id","terminal_id","terminal_name","opened_by_name","opened_by_staff_id","opened_by_role","closed_by_name","closed_by_staff_id","closed_by_role","opened_at","closed_at","opening_float","counted_cash","expected_cash","note","overdue","created_at","updated_at","status","closing_float","user_id","row_version","counted_card","counted_digital","expected_card","expected_digital","variance_cash","variance_card","variance_digital","variance_total","state","close_reason","closing_started_at","closing_started_by","final_counted_cash","variance_status" FROM jsonb_populate_recordset(NULL::public."shifts", COALESCE(p_rows,'[]'::jsonb))
  ON CONFLICT ("id") DO UPDATE SET "store_id"=EXCLUDED."store_id","terminal_id"=EXCLUDED."terminal_id","terminal_name"=EXCLUDED."terminal_name","opened_by_name"=EXCLUDED."opened_by_name","opened_by_staff_id"=EXCLUDED."opened_by_staff_id","opened_by_role"=EXCLUDED."opened_by_role","closed_by_name"=EXCLUDED."closed_by_name","closed_by_staff_id"=EXCLUDED."closed_by_staff_id","closed_by_role"=EXCLUDED."closed_by_role","opened_at"=EXCLUDED."opened_at","closed_at"=EXCLUDED."closed_at","opening_float"=EXCLUDED."opening_float","counted_cash"=EXCLUDED."counted_cash","expected_cash"=EXCLUDED."expected_cash","note"=EXCLUDED."note","overdue"=EXCLUDED."overdue","created_at"=EXCLUDED."created_at","updated_at"=EXCLUDED."updated_at","status"=EXCLUDED."status","closing_float"=EXCLUDED."closing_float","user_id"=EXCLUDED."user_id","row_version"=EXCLUDED."row_version","counted_card"=EXCLUDED."counted_card","counted_digital"=EXCLUDED."counted_digital","expected_card"=EXCLUDED."expected_card","expected_digital"=EXCLUDED."expected_digital","variance_cash"=EXCLUDED."variance_cash","variance_card"=EXCLUDED."variance_card","variance_digital"=EXCLUDED."variance_digital","variance_total"=EXCLUDED."variance_total","state"=EXCLUDED."state","close_reason"=EXCLUDED."close_reason","closing_started_at"=EXCLUDED."closing_started_at","closing_started_by"=EXCLUDED."closing_started_by","final_counted_cash"=EXCLUDED."final_counted_cash","variance_status"=EXCLUDED."variance_status" WHERE EXCLUDED."row_version">public."shifts"."row_version";
  GET DIAGNOSTICS v_count=ROW_COUNT;


  RETURN v_count;
END $fn$;

CREATE OR REPLACE FUNCTION public.sync_delete_shifts(p_changes jsonb,p_branch_id text) RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $fn$
DECLARE v_count integer;
BEGIN DELETE FROM public."shifts" x USING jsonb_array_elements(COALESCE(p_changes,'[]'::jsonb)) c
 WHERE upper(COALESCE(c->>'operation','')) IN ('D','DELETE') AND (x.store_id::text=p_branch_id) AND x."id"::text=COALESCE(c->'key'->>'id',(c->>'entityId')::jsonb->>'id',(c->>'entity_id')::jsonb->>'id');
 GET DIAGNOSTICS v_count=ROW_COUNT; RETURN v_count; END $fn$;
REVOKE ALL ON FUNCTION public.sync_apply_shifts(jsonb) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.sync_apply_activity_events(p_rows jsonb) RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $fn$
DECLARE v_count integer; v_row jsonb;
BEGIN

  INSERT INTO public."activity_events" ("id","event_type","severity","title","message","actor_id","actor_name","actor_role","terminal_id","terminal_name","store_id","entity_type","entity_id","amount","meta","whatsapp_status","whatsapp_error","client_event_id","created_at","previous_state","new_state","cleared_by")
  SELECT "id","event_type","severity","title","message","actor_id","actor_name","actor_role","terminal_id","terminal_name","store_id","entity_type","entity_id","amount","meta","whatsapp_status","whatsapp_error","client_event_id","created_at","previous_state","new_state","cleared_by" FROM jsonb_populate_recordset(NULL::public."activity_events", COALESCE(p_rows,'[]'::jsonb))
  ON CONFLICT ("id") DO NOTHING;
  GET DIAGNOSTICS v_count=ROW_COUNT;


  RETURN v_count;
END $fn$;

CREATE OR REPLACE FUNCTION public.sync_delete_activity_events(p_changes jsonb,p_branch_id text) RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $fn$
DECLARE v_count integer;
BEGIN DELETE FROM public."activity_events" x USING jsonb_array_elements(COALESCE(p_changes,'[]'::jsonb)) c
 WHERE upper(COALESCE(c->>'operation','')) IN ('D','DELETE') AND (x.store_id::text=p_branch_id) AND x."id"::text=COALESCE(c->'key'->>'id',(c->>'entityId')::jsonb->>'id',(c->>'entity_id')::jsonb->>'id');
 GET DIAGNOSTICS v_count=ROW_COUNT; RETURN v_count; END $fn$;
REVOKE ALL ON FUNCTION public.sync_apply_activity_events(jsonb) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.sync_apply_booking_payments(p_rows jsonb) RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $fn$
DECLARE v_count integer; v_row jsonb;
BEGIN

  INSERT INTO public."booking_payments" ("id","booking_id","amount","method","cashier","paid_at","created_at","row_version","status","client_payment_id","reference","reversed_at","reversed_by","kind","refund_reason","refunds_payment_id","change_given")
  SELECT "id","booking_id","amount","method","cashier","paid_at","created_at","row_version","status","client_payment_id","reference","reversed_at","reversed_by","kind","refund_reason","refunds_payment_id","change_given" FROM jsonb_populate_recordset(NULL::public."booking_payments", COALESCE(p_rows,'[]'::jsonb))
  ON CONFLICT ("id") DO UPDATE SET "booking_id"=EXCLUDED."booking_id","amount"=EXCLUDED."amount","method"=EXCLUDED."method","cashier"=EXCLUDED."cashier","paid_at"=EXCLUDED."paid_at","created_at"=EXCLUDED."created_at","row_version"=EXCLUDED."row_version","status"=EXCLUDED."status","client_payment_id"=EXCLUDED."client_payment_id","reference"=EXCLUDED."reference","reversed_at"=EXCLUDED."reversed_at","reversed_by"=EXCLUDED."reversed_by","kind"=EXCLUDED."kind","refund_reason"=EXCLUDED."refund_reason","refunds_payment_id"=EXCLUDED."refunds_payment_id","change_given"=EXCLUDED."change_given" WHERE EXCLUDED."row_version">public."booking_payments"."row_version";
  GET DIAGNOSTICS v_count=ROW_COUNT;


  RETURN v_count;
END $fn$;

CREATE OR REPLACE FUNCTION public.sync_delete_booking_payments(p_changes jsonb,p_branch_id text) RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $fn$
DECLARE v_count integer;
BEGIN DELETE FROM public."booking_payments" x USING jsonb_array_elements(COALESCE(p_changes,'[]'::jsonb)) c
 WHERE upper(COALESCE(c->>'operation','')) IN ('D','DELETE') AND (EXISTS(SELECT 1 FROM public."bookings" p WHERE p."id"::text=x."booking_id"::text AND p.store_id::text=p_branch_id)) AND x."id"::text=COALESCE(c->'key'->>'id',(c->>'entityId')::jsonb->>'id',(c->>'entity_id')::jsonb->>'id');
 GET DIAGNOSTICS v_count=ROW_COUNT; RETURN v_count; END $fn$;
REVOKE ALL ON FUNCTION public.sync_apply_booking_payments(jsonb) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.sync_apply_bookings(p_rows jsonb) RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $fn$
DECLARE v_count integer; v_row jsonb;
BEGIN

  INSERT INTO public."bookings" ("id","ref","store_id","shift_id","customer_name","customer_phone","member_id","service_type_id","service_name","service_fee","payment_timing","lines","subtotal","discount","tax","total","paid","due_date","note","cashier","status","sale_receipt_no","closed_at","racket_model","string_type","tension_main","tension_cross","tension_unit","grommet_notes","job_notes","dropped_off_at","promised_at","job_status","job_status_by","job_status_at","notify_whatsapp","created_at","updated_at","tag_id","intake_note","string_origin","string_source_product_id","grip_product_id","charges","technician","liability_accepted","incident_note","row_version","cancel_reason","cancelled_by","cancelled_at","cancelled_terminal","cancel_money_action")
  SELECT "id","ref","store_id","shift_id","customer_name","customer_phone","member_id","service_type_id","service_name","service_fee","payment_timing","lines","subtotal","discount","tax","total","paid","due_date","note","cashier","status","sale_receipt_no","closed_at","racket_model","string_type","tension_main","tension_cross","tension_unit","grommet_notes","job_notes","dropped_off_at","promised_at","job_status","job_status_by","job_status_at","notify_whatsapp","created_at","updated_at","tag_id","intake_note","string_origin","string_source_product_id","grip_product_id","charges","technician","liability_accepted","incident_note","row_version","cancel_reason","cancelled_by","cancelled_at","cancelled_terminal","cancel_money_action" FROM jsonb_populate_recordset(NULL::public."bookings", COALESCE(p_rows,'[]'::jsonb))
  ON CONFLICT ("id") DO UPDATE SET "ref"=EXCLUDED."ref","store_id"=EXCLUDED."store_id","shift_id"=EXCLUDED."shift_id","customer_name"=EXCLUDED."customer_name","customer_phone"=EXCLUDED."customer_phone","member_id"=EXCLUDED."member_id","service_type_id"=EXCLUDED."service_type_id","service_name"=EXCLUDED."service_name","service_fee"=EXCLUDED."service_fee","payment_timing"=EXCLUDED."payment_timing","lines"=EXCLUDED."lines","subtotal"=EXCLUDED."subtotal","discount"=EXCLUDED."discount","tax"=EXCLUDED."tax","total"=EXCLUDED."total","paid"=EXCLUDED."paid","due_date"=EXCLUDED."due_date","note"=EXCLUDED."note","cashier"=EXCLUDED."cashier","status"=EXCLUDED."status","sale_receipt_no"=EXCLUDED."sale_receipt_no","closed_at"=EXCLUDED."closed_at","racket_model"=EXCLUDED."racket_model","string_type"=EXCLUDED."string_type","tension_main"=EXCLUDED."tension_main","tension_cross"=EXCLUDED."tension_cross","tension_unit"=EXCLUDED."tension_unit","grommet_notes"=EXCLUDED."grommet_notes","job_notes"=EXCLUDED."job_notes","dropped_off_at"=EXCLUDED."dropped_off_at","promised_at"=EXCLUDED."promised_at","job_status"=EXCLUDED."job_status","job_status_by"=EXCLUDED."job_status_by","job_status_at"=EXCLUDED."job_status_at","notify_whatsapp"=EXCLUDED."notify_whatsapp","created_at"=EXCLUDED."created_at","updated_at"=EXCLUDED."updated_at","tag_id"=EXCLUDED."tag_id","intake_note"=EXCLUDED."intake_note","string_origin"=EXCLUDED."string_origin","string_source_product_id"=EXCLUDED."string_source_product_id","grip_product_id"=EXCLUDED."grip_product_id","charges"=EXCLUDED."charges","technician"=EXCLUDED."technician","liability_accepted"=EXCLUDED."liability_accepted","incident_note"=EXCLUDED."incident_note","row_version"=EXCLUDED."row_version","cancel_reason"=EXCLUDED."cancel_reason","cancelled_by"=EXCLUDED."cancelled_by","cancelled_at"=EXCLUDED."cancelled_at","cancelled_terminal"=EXCLUDED."cancelled_terminal","cancel_money_action"=EXCLUDED."cancel_money_action" WHERE EXCLUDED."row_version">public."bookings"."row_version";
  GET DIAGNOSTICS v_count=ROW_COUNT;


  RETURN v_count;
END $fn$;

CREATE OR REPLACE FUNCTION public.sync_delete_bookings(p_changes jsonb,p_branch_id text) RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $fn$
DECLARE v_count integer;
BEGIN DELETE FROM public."bookings" x USING jsonb_array_elements(COALESCE(p_changes,'[]'::jsonb)) c
 WHERE upper(COALESCE(c->>'operation','')) IN ('D','DELETE') AND (x.store_id::text=p_branch_id) AND x."id"::text=COALESCE(c->'key'->>'id',(c->>'entityId')::jsonb->>'id',(c->>'entity_id')::jsonb->>'id');
 GET DIAGNOSTICS v_count=ROW_COUNT; RETURN v_count; END $fn$;
REVOKE ALL ON FUNCTION public.sync_apply_bookings(jsonb) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.sync_apply_held_orders(p_rows jsonb) RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $fn$
DECLARE v_count integer; v_row jsonb;
BEGIN

  INSERT INTO public."held_orders" ("id","label","store_id","shift_id","held_by","total","lines","cart_discount","cart_discount_type","exchange_ref","member_id","member_name","coupon","note","cancelled_from","held_at","created_at","updated_at","row_version","status","pending_request_id")
  SELECT "id","label","store_id","shift_id","held_by","total","lines","cart_discount","cart_discount_type","exchange_ref","member_id","member_name","coupon","note","cancelled_from","held_at","created_at","updated_at","row_version","status","pending_request_id" FROM jsonb_populate_recordset(NULL::public."held_orders", COALESCE(p_rows,'[]'::jsonb))
  ON CONFLICT ("id") DO UPDATE SET "label"=EXCLUDED."label","store_id"=EXCLUDED."store_id","shift_id"=EXCLUDED."shift_id","held_by"=EXCLUDED."held_by","total"=EXCLUDED."total","lines"=EXCLUDED."lines","cart_discount"=EXCLUDED."cart_discount","cart_discount_type"=EXCLUDED."cart_discount_type","exchange_ref"=EXCLUDED."exchange_ref","member_id"=EXCLUDED."member_id","member_name"=EXCLUDED."member_name","coupon"=EXCLUDED."coupon","note"=EXCLUDED."note","cancelled_from"=EXCLUDED."cancelled_from","held_at"=EXCLUDED."held_at","created_at"=EXCLUDED."created_at","updated_at"=EXCLUDED."updated_at","row_version"=EXCLUDED."row_version","status"=EXCLUDED."status","pending_request_id"=EXCLUDED."pending_request_id" WHERE EXCLUDED."row_version">public."held_orders"."row_version";
  GET DIAGNOSTICS v_count=ROW_COUNT;


  RETURN v_count;
END $fn$;

CREATE OR REPLACE FUNCTION public.sync_delete_held_orders(p_changes jsonb,p_branch_id text) RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $fn$
DECLARE v_count integer;
BEGIN DELETE FROM public."held_orders" x USING jsonb_array_elements(COALESCE(p_changes,'[]'::jsonb)) c
 WHERE upper(COALESCE(c->>'operation','')) IN ('D','DELETE') AND (x.store_id::text=p_branch_id) AND x."id"::text=COALESCE(c->'key'->>'id',(c->>'entityId')::jsonb->>'id',(c->>'entity_id')::jsonb->>'id');
 GET DIAGNOSTICS v_count=ROW_COUNT; RETURN v_count; END $fn$;
REVOKE ALL ON FUNCTION public.sync_apply_held_orders(jsonb) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.sync_apply_purchase_orders(p_rows jsonb) RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $fn$
DECLARE v_count integer; v_row jsonb;
BEGIN

  INSERT INTO public."purchase_orders" ("id","po_number","supplier_name","operator_name","total_cost","total_items_count","created_at","supplier_id","store_id","store_code","invoice_date","invoice_entry_date","updated_at","row_version","pending_edit_request_id","pending_edit_by","pending_edit_at")
  SELECT "id","po_number","supplier_name","operator_name","total_cost","total_items_count","created_at","supplier_id","store_id","store_code","invoice_date","invoice_entry_date","updated_at","row_version","pending_edit_request_id","pending_edit_by","pending_edit_at" FROM jsonb_populate_recordset(NULL::public."purchase_orders", COALESCE(p_rows,'[]'::jsonb))
  ON CONFLICT ("id") DO UPDATE SET "po_number"=EXCLUDED."po_number","supplier_name"=EXCLUDED."supplier_name","operator_name"=EXCLUDED."operator_name","total_cost"=EXCLUDED."total_cost","total_items_count"=EXCLUDED."total_items_count","created_at"=EXCLUDED."created_at","supplier_id"=EXCLUDED."supplier_id","store_id"=EXCLUDED."store_id","store_code"=EXCLUDED."store_code","invoice_date"=EXCLUDED."invoice_date","invoice_entry_date"=EXCLUDED."invoice_entry_date","updated_at"=EXCLUDED."updated_at","row_version"=EXCLUDED."row_version","pending_edit_request_id"=EXCLUDED."pending_edit_request_id","pending_edit_by"=EXCLUDED."pending_edit_by","pending_edit_at"=EXCLUDED."pending_edit_at" WHERE EXCLUDED."row_version">public."purchase_orders"."row_version";
  GET DIAGNOSTICS v_count=ROW_COUNT;


  RETURN v_count;
END $fn$;

CREATE OR REPLACE FUNCTION public.sync_delete_purchase_orders(p_changes jsonb,p_branch_id text) RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $fn$
DECLARE v_count integer;
BEGIN DELETE FROM public."purchase_orders" x USING jsonb_array_elements(COALESCE(p_changes,'[]'::jsonb)) c
 WHERE upper(COALESCE(c->>'operation','')) IN ('D','DELETE') AND (x.store_id::text=p_branch_id) AND x."id"::text=COALESCE(c->'key'->>'id',(c->>'entityId')::jsonb->>'id',(c->>'entity_id')::jsonb->>'id');
 GET DIAGNOSTICS v_count=ROW_COUNT; RETURN v_count; END $fn$;
REVOKE ALL ON FUNCTION public.sync_apply_purchase_orders(jsonb) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.sync_apply_stock_transfers(p_rows jsonb) RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $fn$
DECLARE v_count integer; v_row jsonb;
BEGIN

  INSERT INTO public."stock_transfers" ("id","ref","kind","transfer_scope","from_store_id","from_store_name","from_group_id","to_store_id","to_store_name","to_group_id","status","note","created_by","approved_by","approved_at","received_by","received_at","rejected_reason","created_at","updated_at","row_version","verified_by","verified_at","posted_at","discrepancy_reason")
  SELECT "id","ref","kind","transfer_scope","from_store_id","from_store_name","from_group_id","to_store_id","to_store_name","to_group_id","status","note","created_by","approved_by","approved_at","received_by","received_at","rejected_reason","created_at","updated_at","row_version","verified_by","verified_at","posted_at","discrepancy_reason" FROM jsonb_populate_recordset(NULL::public."stock_transfers", COALESCE(p_rows,'[]'::jsonb))
  ON CONFLICT ("id") DO UPDATE SET "ref"=EXCLUDED."ref","kind"=EXCLUDED."kind","transfer_scope"=EXCLUDED."transfer_scope","from_store_id"=EXCLUDED."from_store_id","from_store_name"=EXCLUDED."from_store_name","from_group_id"=EXCLUDED."from_group_id","to_store_id"=EXCLUDED."to_store_id","to_store_name"=EXCLUDED."to_store_name","to_group_id"=EXCLUDED."to_group_id","status"=EXCLUDED."status","note"=EXCLUDED."note","created_by"=EXCLUDED."created_by","approved_by"=EXCLUDED."approved_by","approved_at"=EXCLUDED."approved_at","received_by"=EXCLUDED."received_by","received_at"=EXCLUDED."received_at","rejected_reason"=EXCLUDED."rejected_reason","created_at"=EXCLUDED."created_at","updated_at"=EXCLUDED."updated_at","row_version"=EXCLUDED."row_version","verified_by"=EXCLUDED."verified_by","verified_at"=EXCLUDED."verified_at","posted_at"=EXCLUDED."posted_at","discrepancy_reason"=EXCLUDED."discrepancy_reason" WHERE EXCLUDED."row_version">public."stock_transfers"."row_version";
  GET DIAGNOSTICS v_count=ROW_COUNT;


  RETURN v_count;
END $fn$;

CREATE OR REPLACE FUNCTION public.sync_delete_stock_transfers(p_changes jsonb,p_branch_id text) RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $fn$
DECLARE v_count integer;
BEGIN DELETE FROM public."stock_transfers" x USING jsonb_array_elements(COALESCE(p_changes,'[]'::jsonb)) c
 WHERE upper(COALESCE(c->>'operation','')) IN ('D','DELETE') AND (p_branch_id IN (x.from_store_id::text,x.to_store_id::text)) AND x."id"::text=COALESCE(c->'key'->>'id',(c->>'entityId')::jsonb->>'id',(c->>'entity_id')::jsonb->>'id');
 GET DIAGNOSTICS v_count=ROW_COUNT; RETURN v_count; END $fn$;
REVOKE ALL ON FUNCTION public.sync_apply_stock_transfers(jsonb) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.sync_apply_terminal_tokens(p_rows jsonb) RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $fn$
DECLARE v_count integer; v_row jsonb;
BEGIN

  INSERT INTO public."terminal_tokens" ("id","location_id","location_name","device_name","status","created_at","activated_at","revoked_at","last_seen_at","app_version","last_sync_at","reissued_at","replaced_by","claimed_by_device","claimed_at","platform","row_version")
  SELECT "id","location_id","location_name","device_name","status","created_at","activated_at","revoked_at","last_seen_at","app_version","last_sync_at","reissued_at","replaced_by","claimed_by_device","claimed_at","platform","row_version" FROM jsonb_populate_recordset(NULL::public."terminal_tokens", COALESCE(p_rows,'[]'::jsonb))
  ON CONFLICT ("id") DO UPDATE SET "location_id"=EXCLUDED."location_id","location_name"=EXCLUDED."location_name","device_name"=EXCLUDED."device_name","status"=EXCLUDED."status","created_at"=EXCLUDED."created_at","activated_at"=EXCLUDED."activated_at","revoked_at"=EXCLUDED."revoked_at","last_seen_at"=EXCLUDED."last_seen_at","app_version"=EXCLUDED."app_version","last_sync_at"=EXCLUDED."last_sync_at","reissued_at"=EXCLUDED."reissued_at","replaced_by"=EXCLUDED."replaced_by","claimed_by_device"=EXCLUDED."claimed_by_device","claimed_at"=EXCLUDED."claimed_at","platform"=EXCLUDED."platform","row_version"=EXCLUDED."row_version" WHERE EXCLUDED."row_version">public."terminal_tokens"."row_version";
  GET DIAGNOSTICS v_count=ROW_COUNT;


  RETURN v_count;
END $fn$;

CREATE OR REPLACE FUNCTION public.sync_delete_terminal_tokens(p_changes jsonb,p_branch_id text) RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $fn$
DECLARE v_count integer;
BEGIN DELETE FROM public."terminal_tokens" x USING jsonb_array_elements(COALESCE(p_changes,'[]'::jsonb)) c
 WHERE upper(COALESCE(c->>'operation','')) IN ('D','DELETE') AND (true) AND x."id"::text=COALESCE(c->'key'->>'id',(c->>'entityId')::jsonb->>'id',(c->>'entity_id')::jsonb->>'id');
 GET DIAGNOSTICS v_count=ROW_COUNT; RETURN v_count; END $fn$;
REVOKE ALL ON FUNCTION public.sync_apply_terminal_tokens(jsonb) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.sync_apply_pos_store_settings(p_rows jsonb) RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $fn$
DECLARE v_count integer; v_row jsonb;
BEGIN

  INSERT INTO public."pos_store_settings" ("store_id","block_shift_close_on_hold","require_daily_sales_for_shift_close","require_counted_cash_on_close","require_opening_float_count","enable_blind_cash_count","max_drawer_cash_limit","require_reason_for_payout","allow_multiple_shifts_per_terminal","enable_cashier_x_report","show_opening_float_at_close","show_expected_totals_at_close","show_live_variance_at_close","show_itemized_tender_breakdown","require_manager_pin_on_variance","variance_pin_threshold","max_cashier_discount_percent","max_cart_discount_amount","allow_discount_stacking","require_reason_for_price_override","prevent_below_cost_sale","allow_tax_exemption","prevent_negative_stock_sale","require_receipt_for_refund","require_manager_pin_for_refund","max_refund_days_limit","track_item_voids","auto_lock_timeout_seconds","require_manager_pin_for_cash_drawer_open","enable_manager_pin_audit_log","require_pin_void_cart","require_pin_void_line","require_pin_reduce_qty","require_pin_manual_discount","require_pin_price_override","require_pin_stock_adjustment","require_pin_shift_close","require_pin_edit_tenders","require_pin_terminal_reset","row_version","updated_by","updated_at","allow_offline_approvals","offline_approval_requires_pin","online_only_void_cart","online_only_void_line","online_only_reduce_qty","online_only_manual_discount","online_only_price_override","online_only_stock_adjustment","online_only_shift_close","online_only_edit_tenders","online_only_terminal_reset","online_only_refund")
  SELECT "store_id","block_shift_close_on_hold","require_daily_sales_for_shift_close","require_counted_cash_on_close","require_opening_float_count","enable_blind_cash_count","max_drawer_cash_limit","require_reason_for_payout","allow_multiple_shifts_per_terminal","enable_cashier_x_report","show_opening_float_at_close","show_expected_totals_at_close","show_live_variance_at_close","show_itemized_tender_breakdown","require_manager_pin_on_variance","variance_pin_threshold","max_cashier_discount_percent","max_cart_discount_amount","allow_discount_stacking","require_reason_for_price_override","prevent_below_cost_sale","allow_tax_exemption","prevent_negative_stock_sale","require_receipt_for_refund","require_manager_pin_for_refund","max_refund_days_limit","track_item_voids","auto_lock_timeout_seconds","require_manager_pin_for_cash_drawer_open","enable_manager_pin_audit_log","require_pin_void_cart","require_pin_void_line","require_pin_reduce_qty","require_pin_manual_discount","require_pin_price_override","require_pin_stock_adjustment","require_pin_shift_close","require_pin_edit_tenders","require_pin_terminal_reset","row_version","updated_by","updated_at","allow_offline_approvals","offline_approval_requires_pin","online_only_void_cart","online_only_void_line","online_only_reduce_qty","online_only_manual_discount","online_only_price_override","online_only_stock_adjustment","online_only_shift_close","online_only_edit_tenders","online_only_terminal_reset","online_only_refund" FROM jsonb_populate_recordset(NULL::public."pos_store_settings", COALESCE(p_rows,'[]'::jsonb))
  ON CONFLICT ("store_id") DO UPDATE SET "block_shift_close_on_hold"=EXCLUDED."block_shift_close_on_hold","require_daily_sales_for_shift_close"=EXCLUDED."require_daily_sales_for_shift_close","require_counted_cash_on_close"=EXCLUDED."require_counted_cash_on_close","require_opening_float_count"=EXCLUDED."require_opening_float_count","enable_blind_cash_count"=EXCLUDED."enable_blind_cash_count","max_drawer_cash_limit"=EXCLUDED."max_drawer_cash_limit","require_reason_for_payout"=EXCLUDED."require_reason_for_payout","allow_multiple_shifts_per_terminal"=EXCLUDED."allow_multiple_shifts_per_terminal","enable_cashier_x_report"=EXCLUDED."enable_cashier_x_report","show_opening_float_at_close"=EXCLUDED."show_opening_float_at_close","show_expected_totals_at_close"=EXCLUDED."show_expected_totals_at_close","show_live_variance_at_close"=EXCLUDED."show_live_variance_at_close","show_itemized_tender_breakdown"=EXCLUDED."show_itemized_tender_breakdown","require_manager_pin_on_variance"=EXCLUDED."require_manager_pin_on_variance","variance_pin_threshold"=EXCLUDED."variance_pin_threshold","max_cashier_discount_percent"=EXCLUDED."max_cashier_discount_percent","max_cart_discount_amount"=EXCLUDED."max_cart_discount_amount","allow_discount_stacking"=EXCLUDED."allow_discount_stacking","require_reason_for_price_override"=EXCLUDED."require_reason_for_price_override","prevent_below_cost_sale"=EXCLUDED."prevent_below_cost_sale","allow_tax_exemption"=EXCLUDED."allow_tax_exemption","prevent_negative_stock_sale"=EXCLUDED."prevent_negative_stock_sale","require_receipt_for_refund"=EXCLUDED."require_receipt_for_refund","require_manager_pin_for_refund"=EXCLUDED."require_manager_pin_for_refund","max_refund_days_limit"=EXCLUDED."max_refund_days_limit","track_item_voids"=EXCLUDED."track_item_voids","auto_lock_timeout_seconds"=EXCLUDED."auto_lock_timeout_seconds","require_manager_pin_for_cash_drawer_open"=EXCLUDED."require_manager_pin_for_cash_drawer_open","enable_manager_pin_audit_log"=EXCLUDED."enable_manager_pin_audit_log","require_pin_void_cart"=EXCLUDED."require_pin_void_cart","require_pin_void_line"=EXCLUDED."require_pin_void_line","require_pin_reduce_qty"=EXCLUDED."require_pin_reduce_qty","require_pin_manual_discount"=EXCLUDED."require_pin_manual_discount","require_pin_price_override"=EXCLUDED."require_pin_price_override","require_pin_stock_adjustment"=EXCLUDED."require_pin_stock_adjustment","require_pin_shift_close"=EXCLUDED."require_pin_shift_close","require_pin_edit_tenders"=EXCLUDED."require_pin_edit_tenders","require_pin_terminal_reset"=EXCLUDED."require_pin_terminal_reset","row_version"=EXCLUDED."row_version","updated_by"=EXCLUDED."updated_by","updated_at"=EXCLUDED."updated_at","allow_offline_approvals"=EXCLUDED."allow_offline_approvals","offline_approval_requires_pin"=EXCLUDED."offline_approval_requires_pin","online_only_void_cart"=EXCLUDED."online_only_void_cart","online_only_void_line"=EXCLUDED."online_only_void_line","online_only_reduce_qty"=EXCLUDED."online_only_reduce_qty","online_only_manual_discount"=EXCLUDED."online_only_manual_discount","online_only_price_override"=EXCLUDED."online_only_price_override","online_only_stock_adjustment"=EXCLUDED."online_only_stock_adjustment","online_only_shift_close"=EXCLUDED."online_only_shift_close","online_only_edit_tenders"=EXCLUDED."online_only_edit_tenders","online_only_terminal_reset"=EXCLUDED."online_only_terminal_reset","online_only_refund"=EXCLUDED."online_only_refund" WHERE EXCLUDED."row_version">public."pos_store_settings"."row_version";
  GET DIAGNOSTICS v_count=ROW_COUNT;


  RETURN v_count;
END $fn$;

CREATE OR REPLACE FUNCTION public.sync_delete_pos_store_settings(p_changes jsonb,p_branch_id text) RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $fn$
DECLARE v_count integer;
BEGIN DELETE FROM public."pos_store_settings" x USING jsonb_array_elements(COALESCE(p_changes,'[]'::jsonb)) c
 WHERE upper(COALESCE(c->>'operation','')) IN ('D','DELETE') AND (x.store_id::text=p_branch_id) AND x."store_id"::text=COALESCE(c->'key'->>'store_id',(c->>'entityId')::jsonb->>'store_id',(c->>'entity_id')::jsonb->>'store_id');
 GET DIAGNOSTICS v_count=ROW_COUNT; RETURN v_count; END $fn$;
REVOKE ALL ON FUNCTION public.sync_apply_pos_store_settings(jsonb) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.sync_apply_stock_count_drafts(p_rows jsonb) RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $fn$
DECLARE v_count integer; v_row jsonb;
BEGIN

  INSERT INTO public."stock_count_drafts" ("id","store_id","terminal_id","staff_id","staff_name","status","reason","note","lines","line_count","total_impact","posted_at","posted_by","created_at","updated_at","reference","store_code","pending_edit_request_id","pending_edit_by","pending_edit_at")
  SELECT "id","store_id","terminal_id","staff_id","staff_name","status","reason","note","lines","line_count","total_impact","posted_at","posted_by","created_at","updated_at","reference","store_code","pending_edit_request_id","pending_edit_by","pending_edit_at" FROM jsonb_populate_recordset(NULL::public."stock_count_drafts", COALESCE(p_rows,'[]'::jsonb))
  ON CONFLICT ("id") DO UPDATE SET "store_id"=EXCLUDED."store_id","terminal_id"=EXCLUDED."terminal_id","staff_id"=EXCLUDED."staff_id","staff_name"=EXCLUDED."staff_name","status"=EXCLUDED."status","reason"=EXCLUDED."reason","note"=EXCLUDED."note","lines"=EXCLUDED."lines","line_count"=EXCLUDED."line_count","total_impact"=EXCLUDED."total_impact","posted_at"=EXCLUDED."posted_at","posted_by"=EXCLUDED."posted_by","created_at"=EXCLUDED."created_at","updated_at"=EXCLUDED."updated_at","reference"=EXCLUDED."reference","store_code"=EXCLUDED."store_code","pending_edit_request_id"=EXCLUDED."pending_edit_request_id","pending_edit_by"=EXCLUDED."pending_edit_by","pending_edit_at"=EXCLUDED."pending_edit_at";
  GET DIAGNOSTICS v_count=ROW_COUNT;


  RETURN v_count;
END $fn$;

CREATE OR REPLACE FUNCTION public.sync_delete_stock_count_drafts(p_changes jsonb,p_branch_id text) RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $fn$
DECLARE v_count integer;
BEGIN DELETE FROM public."stock_count_drafts" x USING jsonb_array_elements(COALESCE(p_changes,'[]'::jsonb)) c
 WHERE upper(COALESCE(c->>'operation','')) IN ('D','DELETE') AND (x.store_id::text=p_branch_id) AND x."id"::text=COALESCE(c->'key'->>'id',(c->>'entityId')::jsonb->>'id',(c->>'entity_id')::jsonb->>'id');
 GET DIAGNOSTICS v_count=ROW_COUNT; RETURN v_count; END $fn$;
REVOKE ALL ON FUNCTION public.sync_apply_stock_count_drafts(jsonb) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.sync_apply_authorization_requests(p_rows jsonb) RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $fn$
DECLARE v_count integer; v_row jsonb;
BEGIN

  INSERT INTO public."authorization_requests" ("id","action_key","requested_by","requested_by_name","store_id","terminal_id","reason","payload","status","decided_by","decided_by_name","decided_at","decision_note","expires_at","consumed_at","requester_direct_limit","value_unit","created_at","updated_at","requested_amount","approved_amount","approved_payload","bill_snapshot","snapshot_hash","held_order_id","notified_at")
  SELECT "id","action_key","requested_by","requested_by_name","store_id","terminal_id","reason","payload","status","decided_by","decided_by_name","decided_at","decision_note","expires_at","consumed_at","requester_direct_limit","value_unit","created_at","updated_at","requested_amount","approved_amount","approved_payload","bill_snapshot","snapshot_hash","held_order_id","notified_at" FROM jsonb_populate_recordset(NULL::public."authorization_requests", COALESCE(p_rows,'[]'::jsonb))
  ON CONFLICT ("id") DO UPDATE SET "action_key"=EXCLUDED."action_key","requested_by"=EXCLUDED."requested_by","requested_by_name"=EXCLUDED."requested_by_name","store_id"=EXCLUDED."store_id","terminal_id"=EXCLUDED."terminal_id","reason"=EXCLUDED."reason","payload"=EXCLUDED."payload","status"=EXCLUDED."status","decided_by"=EXCLUDED."decided_by","decided_by_name"=EXCLUDED."decided_by_name","decided_at"=EXCLUDED."decided_at","decision_note"=EXCLUDED."decision_note","expires_at"=EXCLUDED."expires_at","consumed_at"=EXCLUDED."consumed_at","requester_direct_limit"=EXCLUDED."requester_direct_limit","value_unit"=EXCLUDED."value_unit","created_at"=EXCLUDED."created_at","updated_at"=EXCLUDED."updated_at","requested_amount"=EXCLUDED."requested_amount","approved_amount"=EXCLUDED."approved_amount","approved_payload"=EXCLUDED."approved_payload","bill_snapshot"=EXCLUDED."bill_snapshot","snapshot_hash"=EXCLUDED."snapshot_hash","held_order_id"=EXCLUDED."held_order_id","notified_at"=EXCLUDED."notified_at";
  GET DIAGNOSTICS v_count=ROW_COUNT;


  RETURN v_count;
END $fn$;

CREATE OR REPLACE FUNCTION public.sync_delete_authorization_requests(p_changes jsonb,p_branch_id text) RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $fn$
DECLARE v_count integer;
BEGIN DELETE FROM public."authorization_requests" x USING jsonb_array_elements(COALESCE(p_changes,'[]'::jsonb)) c
 WHERE upper(COALESCE(c->>'operation','')) IN ('D','DELETE') AND (x.store_id::text=p_branch_id) AND x."id"::text=COALESCE(c->'key'->>'id',(c->>'entityId')::jsonb->>'id',(c->>'entity_id')::jsonb->>'id');
 GET DIAGNOSTICS v_count=ROW_COUNT; RETURN v_count; END $fn$;
REVOKE ALL ON FUNCTION public.sync_apply_authorization_requests(jsonb) FROM PUBLIC;
