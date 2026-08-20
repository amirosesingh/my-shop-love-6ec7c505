# PART 2 — Restore the POS rules and manager-override backend

## What I verified in the database and code

- None of the six objects exist. A live query returns no rows for `pos_rules_get`, `pos_rules_save`, `verify_manager_pin`, `log_manager_override`, `held_orders_open_count`, and `to_regclass('public.pos_store_settings')` is null.
- One migration already references four of them (`20260808062157_...sql`) but only to re-grant EXECUTE inside a `DO` loop, guarded so it applies cleanly when the routine is absent — which is why the gap was never noticed.
- `src/lib/pos-rules.server.ts` swallows every failure: `loadRules` returns built-in defaults on any error, `verifyManagerPinInDb` returns `null` (indistinguishable from a wrong PIN), `logOverride` discards the error, `heldOrderCount` returns `0`. So a missing backend currently reads as "rules are default, PIN is wrong, no held bills".

## Reuse instead of new structures

- **Staff and PINs**: reuse `app_users` (`pin_hash` is bcrypt via `extensions.crypt`, plus `is_active`, `role`, `role_slug`, `store_id`, `permissions`). `verify_manager_pin` follows exactly the shape of the existing `verify_terminal_pin` — no second PIN model, no new hashing.
- **Throttling**: reuse the existing `pin_throttle_status/fail/reset` functions already called from `src/lib/pos-rules.functions.ts`. No change to that model.
- **Held orders**: reuse the `held_orders` table (`store_id`, `cancelled_from`) — no new table.
- **Audit**: reuse `audit_logs` (`action_category`, `action_name`, `target_module`, `user_id`, `user_name`, `details`) for override records rather than a parallel audit table.
- **New only where nothing fits**: `pos_store_settings`, because rules are per-branch and `pos_settings` is a single global row with a different purpose.

## Database work (one migration)

1. `public.pos_store_settings` — `store_id text primary key` (empty string = the global row), one nullable column per rule key in `PosRules`, `row_version int`, `updated_at`, `updated_by`. Nullable means "inherit"; the global row layers under the branch row. GRANTs: `SELECT, INSERT, UPDATE` to `authenticated`, `ALL` to `service_role`, no `anon`; RLS on, with read for authenticated and write restricted to supervisors via the existing `is_supervisor_now()`.
2. `pos_rules_get(_store_id text) -> jsonb` — security definer, returns branch row over global row over shipped defaults, so it always answers a complete rule set.
3. `pos_rules_save(_store_id text, _patch jsonb, _expected_version int default null) -> jsonb` — security definer, supervisor-checked, applies only known rule keys, bumps `row_version`, rejects a stale `_expected_version` with a distinct error, returns the new effective set.
4. `verify_manager_pin(...)` — security definer; matches on `lower(user_id)`, requires `is_active`, requires manager/admin authority (role `admin`/`manager` or the role's `can_*` supervisory permission), compares with `extensions.crypt`, and on success writes the override audit row in the same transaction. Returns a single row `(user_id, full_name, role)`; returns nothing on any failure so no oracle is leaked. PIN is never logged, never returned, never in `details`.
5. `log_manager_override(...)` — security definer insert into `audit_logs` with category `override`; raises on failure rather than returning quietly.
6. `held_orders_open_count(_store_id text) -> integer` — counts `held_orders` for the branch (or all branches when `_store_id` is empty), excluding cancelled ones, scoped through the existing `store_visible()` check.

All six get `REVOKE ... FROM PUBLIC, anon` and `GRANT EXECUTE TO authenticated, service_role`, matching the earlier migration's intent.

## Application changes

- `src/lib/pos-rules.server.ts`: stop collapsing every failure into a default. Each helper returns a discriminated result — `ok`, `backend_unavailable`, `unauthorized`, `invalid_pin`, `locked`, `db_error` — carrying the underlying reason. `loadRules` still yields the strict defaults for the UI, but tags them `source: "fallback"` so callers can tell a real configuration from a dead backend.
- `logOverride` no longer swallows: a failed audit write is reported to the caller and surfaced; the till is not blocked, but the failure is visible and recorded.
- `heldOrderCount` distinguishes "zero held bills" from "could not ask", and `assertShiftClosable` refuses to close on the latter instead of assuming zero.
- `src/lib/pos-rules.functions.ts`: pass the new codes through `getPosRules`, `savePosRules`, `verifyManagerPin`, `assertShiftClosable`; preserve the existing throttle ordering and the signed grant token.
- `src/lib/pos-rules.tsx`: expose `backendAvailable` on the rules context.
- `src/routes/settings.rules.tsx`: a clear banner when the rules backend is unavailable, with saving disabled — instead of silently editing values that go nowhere. Concurrency conflict shows a reload prompt.
- `src/components/pos/ManagerOverrideDialog.tsx`: distinct messages for wrong PIN, inactive account, insufficient authority, locked out, and backend unavailable.
- Diagnostics: a new rules-backend probe in `src/lib/health-scan.ts` (new `ScanArea`-compatible finding) reporting missing table/functions or a failing call as a critical operational failure.

## Tests

New `src/lib/__tests__/pos-rules-backend.test.ts` covering: load branch rules, save branch rules, reload after save, defaults for a new branch, stale-version rejection, manager PIN accepted, wrong PIN rejected, inactive manager rejected, unauthorised staff rejected, throttle lockout respected and not reset by a failure, successful override audited, failed override not recorded as approved, held-order count scoped by branch, and the four gated flows (shift-variance approval, void approval, discount override, price override, tender override) driven through the server functions with the database layer stubbed. Then `bunx vitest run` for the whole suite, plus a live query confirming all six objects exist after the migration.

## Technical notes

- Migration file: `supabase/migrations/<timestamp>_pos_rules_backend.sql`, applied through the migration tool (needs your approval).
- Security decisions: PIN comparison stays inside the database with bcrypt; no plaintext PIN crosses a boundary or reaches `details`; the override log stores identities, action, branch, terminal and a short reason only — no payment data; rule writes require a supervisor both in the server function and again in the database routine; `anon` gets no grant anywhere.
- Nothing in sales, inventory, sync or permissions logic changes.
