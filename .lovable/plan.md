# Close the five open security alerts

Checked against the current SQL and app code first.

## 1. Staff table reachable with no access rules (`app_users`)

Confirmed: `app_users` has row protection on and zero policies, while signed-in accounts still hold full read/write grants on it (`supabase/sql/02_staff_and_access.sql`). No app code reads that table directly — every path goes through the privileged routines (`current_app_user`, `list_app_users`, `set_app_user_*`, `verify_terminal_pin`) or the service-key relay.

Fix: withdraw the direct table grants from signed-in accounts and keep only the internal service role. Access keeps working through the existing routines, and the "reachable but no rules" condition disappears because the table is no longer reachable through the data API. A narrow self-read policy is added so a signed-in person can still read their own row if a future screen needs it.

## 2-5. Four privileged routines callable by visitors

Confirmed: `pos_rules_get`, `verify_manager_pin` and `held_orders_open_count` are granted to visitors explicitly (`13_pos_rules.sql`, `19_rules_grants.sql`), and `pos_rules_save` inherits the default "everyone may run" right that was never withdrawn — which is why it is flagged even though the file only grants it to signed-in accounts.

They were opened to visitors because the server calls them with the public key. The correct fix is to stop needing visitor access:

- The server-side rules helper (`src/lib/pos-rules.server.ts`) calls these four routines with the internal service key instead of the public key. Manager PIN checks, held-ticket counts, and rule reads/writes all already run on the server, never in the browser.
- The unauthenticated rules read (settings before sign-in) keeps working, because the server performs it — the browser never calls the routine itself.
- Withdraw the run right from visitors and from the implicit "everyone" grant on all four routines; keep signed-in accounts on `pos_rules_save` (it re-checks for a supervisor internally) and the service role on all four.
- `pos_rules_save`'s existing service-key fallback path stays as-is.

## Verification

1. Re-read the run rights for the four routines and the grants on `app_users`.
2. Run the database linter and the live self-check; confirm all five findings close on their own rather than being marked fixed by hand.
3. In the preview: load settings before sign-in (defaults still render), save a rule as a supervisor, and run a manager-PIN override — all three exercise the routines through the new service-key path.

## Technical notes

- New migration on the backend plus matching updates to `supabase/sql/02_staff_and_access.sql`, `13_pos_rules.sql`, and `19_rules_grants.sql` so a re-run does not reintroduce the visitor grants (`REVOKE ... FROM PUBLIC, anon` after each `CREATE FUNCTION`).
- `src/lib/pos-rules.server.ts`: `rpc()` routes through `serviceRest` from `pos-relay.server.ts` for `pos_rules_get`, `pos_rules_save`, `verify_manager_pin`, `held_orders_open_count`; supervisor identity is still verified before any write.
- No change to `security_selfcheck`'s allowlist — the activation routines stay allowlisted, and these four are removed from visitor reach instead of being excused.