# Lock down privileged routines + on/off switches for the member & redeem subdomains

## Part 1 — the two "SECURITY DEFINER function is executable" warnings

I checked the live grants. Today **7 routines are callable by anonymous visitors** and **31 by any signed-in user**. Most of the signed-in ones are internal helpers that policies and other routines call for you — the browser never needs them.

### Keep callable by visitors (public coupon/terminal pages depend on them)
`coupon_claim`, `member_welcome_claim`, `voucher_by_token`, `verify_cashier_pin`, `verify_terminal_pin`, `terminal_token_status`, `terminal_token_heartbeat`.
These are the only entry points the public join/claim pages and the till sign-in screen use. Each already validates its own input and returns nothing sensitive; `voucher_by_token` strips staff names.

### Revoke from everyone (internal only — run inside policies/triggers as the owner)
`has_perm`, `has_role`, `is_staff`, `is_staff_now`, `is_app_supervisor`, `is_supervisor_now`, `store_visible`, `user_store_id`, `user_cluster_id`, `coupon_log`, `member_join`, `campaign_is_live`, `normalize_phone`, every `enforce_*` trigger function, `sync_auth_user_to_public`, `security_report_findings`.

### Keep for signed-in staff (real app actions, each already checks the caller's role inside)
`current_app_user`, `list_app_users`, `list_cashiers`, `upsert_cashier`, `delete_cashier`, `set_cashier_permissions`, `upsert_terminal_user`, `delete_terminal_user`, `set_terminal_active`, `set_app_user_profile`, `set_app_user_permissions`, `coupon_issue_manual`, `voucher_redeem`, `voucher_set_status`, `stock_transfer_receive`, `terminal_token_claim`, `security_selfcheck`, `security_set_finding_status`.

I'll also re-assert `REVOKE EXECUTE ... FROM PUBLIC` on the whole schema first, so a future routine is locked by default instead of open by default.

The linter still lists any remaining reachable routine as a warning by design. After the revokes I'll mark the two findings fixed for the routines that were genuinely over-exposed, and record the deliberate allow-list in the security memory so future scans don't re-raise the public coupon entry points.

## Part 2 — turn the member and redeem subdomains on/off

Two new switches next to the domain fields in **Settings → System & Integrations**:

- **Member signup domain — enabled/disabled**
- **Voucher redemption domain — enabled/disabled**

Effects when a domain is switched off:

- Visiting `/join` (member) or `/claim/:slug` and `/c/:token` (redeem) shows a plain "This page is currently unavailable" card instead of the form/voucher.
- The root redirect for that hostname stops firing, so the host lands on the normal app.
- Copy-link and QR buttons in the backoffice (campaign links, voucher links, join link) are disabled with a tooltip explaining which switch to turn on.
- The System status page and the top-bar health pill skip the health check for a disabled domain and show it as "Off" instead of red.

Both default to **on**, so nothing changes until you flip a switch.

## Technical notes

- Grants land as a migration plus the mirrored file `supabase/sql/15_security_and_performance.sql` (and `16_security_alerts.sql` for the alert routines) so your external backend stays in step.
- New fields `memberDomainEnabled` / `redeemDomainEnabled` on `IntegrationSettings` (`src/lib/pos-types.ts`), stored in the existing `pos_settings.integration_settings` JSON — no schema change needed, defaults applied on read in `src/lib/pos-db.ts`.
- Gating helpers added to `src/lib/coupon-hosts.ts` (`joinUrl`/`claimUrl`/`voucherUrl` return null when disabled); route guards in `src/routes/join.tsx`, `claim.$slug.tsx`, `c.$token.tsx`; health-check filter in `src/lib/system-health.ts` and `settings.system.tsx`.
- Version bump so desktop and Android pick the change up.
