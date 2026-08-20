# Part 4 — Remove permissive duplicate access rules and prove branch isolation

## What the database actually shows today

Verified by querying the live database:

| Table | Protection on | Access rules found |
| --- | --- | --- |
| `audit_logs` | yes | 2 correct staff rules **plus** duplicates `audit_logs_staff_read` (read: `true`) and `audit_logs_staff_insert` (write: `true`) |
| `branch_telemetry` | yes | 3 correct staff rules **plus** duplicates reading/updating/inserting with `true`; `anon` also holds full table privileges |
| `payment_types` | yes | supervisor-only write rule **plus** `payment_types_staff_write` (`ALL … true`) and a read rule open to everyone |
| `cashiers` | yes | no rules, and only the internal service role holds privileges — correctly unreachable |
| `pin_attempts` | yes | no rules, but `anon` and signed-in users still hold full privileges (currently blocked only because no rule exists) |

Because rules are combined with OR, each `true` duplicate fully cancels the stricter staff/supervisor rule next to it. Also confirmed: `branch_telemetry` has a `store_id` column, tills write it directly from the browser (`src/lib/telemetry.ts`), and `user_has_store_access()` already exists for branch checks.

## What gets changed

### 1. Drop the permissive duplicates (migration)
- `audit_logs`: drop `audit_logs_staff_read` and `audit_logs_staff_insert`; keep the two staff-gated rules.
- `branch_telemetry`: drop `branch_telemetry_staff_read` / `_write` / `_update`.
- `payment_types`: drop `payment_types_staff_read` and `payment_types_staff_write`; keep supervisor-only writes and a read rule for signed-in staff (the visitor-open read is narrowed to signed-in users, since the till reads payment types after sign-in).

### 2. Branch-scope telemetry
Replace the remaining telemetry rules so a till may insert/update **only rows for its own branch** (`user_has_store_access(store_id)` on both the match and the check), while supervisors/admins keep full visibility for the telemetry centre. Reads stay staff-wide only for supervisors; a branch till reads its own branch.

### 3. Lock down the login-support tables
- Withdraw all table privileges on `pin_attempts` from visitors and signed-in users (service role only), matching `cashiers`. PIN throttling continues to work because it runs entirely inside the existing privileged routines.
- Leave protection on with no rules on both tables — no PIN data is reachable through the data API.

### 4. Relay alignment (code, minimal)
`audit_logs` is currently listed as a global (unscoped) table in the relay policy. It stays global for supervisors, but audit rows written through the relay get the caller's branch stamped from the server-resolved scope rather than the payload, consistent with the rest of the relay. No change to `resolveRelayScope()`'s trust model — branch still never comes from the client.

## Verification

- Re-query rules and privileges after the migration and confirm no `true` expression remains on the five tables.
- Run the database linter and the in-app self-check.
- Direct database probes as a signed-in cashier of branch A: read another branch's telemetry (denied), update another branch's telemetry (denied), select from `pin_attempts` / `cashiers` (denied), insert a payment type (denied), read audit logs (allowed, staff-wide as documented).
- Same probes as supervisor/admin (allowed).

## Tests

Extend `src/lib/__tests__/relay-policy.security.test.ts` and add a rules-regression test covering: cross-branch telemetry write refused, cross-branch operational write refused, relay branch spoof refused, unauthorised role refused, supervisor and admin allowed, and a guard asserting the removed permissive rule names never reappear in the migration set. Run `bunx vitest run`.

## Technical notes

- One new migration under `supabase/migrations/`; drops are by exact rule name so nothing else is touched.
- Privileges re-asserted explicitly for `authenticated` and `service_role` on the tables that keep data-API access; `anon` is revoked on `branch_telemetry` and `pin_attempts`.
- No change to authentication flows, `verify_cashier_pin`, `pin_throttle_*`, or client authorisation logic.
