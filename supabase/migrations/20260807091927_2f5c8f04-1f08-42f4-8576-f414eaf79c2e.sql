-- Default-deny for any future routine in the exposed schema
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM authenticated;

DO $grants$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig, p.proname
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);

    IF r.proname IN ('coupon_claim','member_welcome_claim','voucher_by_token',
                     'verify_cashier_pin','verify_terminal_pin',
                     'terminal_token_status','terminal_token_heartbeat') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated', r.sig);
    ELSIF r.proname IN ('current_app_user','list_app_users','list_cashiers',
                        'upsert_cashier','delete_cashier','set_cashier_permissions',
                        'upsert_terminal_user','delete_terminal_user','set_terminal_active',
                        'set_app_user_profile','set_app_user_permissions',
                        'coupon_issue_manual','voucher_redeem','voucher_set_status',
                        'stock_transfer_receive','terminal_token_claim',
                        'security_selfcheck','security_set_finding_status') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
    END IF;
    -- everything else (internal helpers, trigger bodies) stays owner-only
  END LOOP;
END $grants$;