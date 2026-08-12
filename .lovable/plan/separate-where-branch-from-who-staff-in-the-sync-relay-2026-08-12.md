# Separate "where" (branch) from "who" (staff) in the sync relay

## What the audit found

The branch-boundary half of this work already exists from the last pass and is largely correct:

- `src/lib/sync-endpoint.server.ts` proves the caller (`verifyRelayCaller`), resolves a server-side scope (`resolveRelayScope`), and refuses reads outside the caller's branch.
- `src/lib/relay-policy.server.ts` pins every insert/update/delete to `scope.storeId`, rejects a payload that claims another branch, gates sensitive columns on permission flags, and returns `STORE_FORBIDDEN` / `PERMISSION_DENIED` / `SCOPE_MISSING` / `TABLE_FORBIDDEN`.
- `runRelayOp(op, scope)` takes the scope as a required argument, so no call site can skip it.
- `supabase/sql/36_store_isolation.sql` adds `user_has_store_access()` and compound RLS on the till tables.

Four real gaps remain, and they are all on the identity side or in scope resolution.

### Gap 1 — identity is never stamped, only branch is

`RelayScope` carries `label`, `role`, `permissions` but the relay writes nothing about *who* did it. Rows arrive with whatever `cashier_name` / `opened_by_name` the client chose to send, so a till can attribute a sale, a void or a drawer open to another cashier. There is no server-set actor on `sales`, `drawer_events`, `stock_adjustments`, `shift_sessions`, `bookings`, `held_orders`, `purchase_orders`.

### Gap 2 — child rows are only checked, never pinned

`sale_items`, `booking_payments`, `purchase_order_items`, `stock_transfer_items` are validated by a parent lookup, but when the parent is not on the server yet (normal for an offline till pushing child-first) the row is accepted unchecked. A crafted child with an unknown `sale_id` slips through.

### Gap 3 — transfers are only checked on insert

`authorizeTransfer` returns `{ ok: true }` unconditionally for `update` and `delete`, so a till can approve, receive or delete a transfer between two other branches.

### Gap 4 — scope resolution has no fast path and no fallback

`resolveRelayScope` always makes one to three PostgREST round-trips to `app_users` per request, and a staff caller whose row is missing gets `storeId: null` and a hard `SCOPE_MISSING` even though their JWT already carries the branch.

## What gets built

### 1. Actor stamping (`user_id` = identity)

`RelayScope` gains `staffUserId` and `actorName`, both server-resolved. A new `ACTOR_COLUMNS` map declares, per table, which columns are actor columns; the relay **overwrites** them from the scope on insert/upsert and on update, and strips them from client payloads:

- `sales.cashier_name`, `sales.cashier_id`
- `shifts.opened_by_staff_id` / `opened_by_name` / `opened_by_role` (on insert), `closed_by_*` (on update to a closing)
- `shift_sessions.staff_id` / `staff_name` / `role`
- `drawer_events.staff_id` / `staff_name` / `role`
- `stock_adjustments.staff_id` / `staff_name` / `role`
- `sku_audit.staff_id` / `staff_name` / `role`
- `bookings.cashier`, `held_orders.held_by`, `purchase_orders.operator_name`
- `sales.created_by` / `updated_by`, `sale_items` inherits from its sale

Multiple cashiers on one till keep working: the branch stays the same, only the actor changes per signed-in session, so mid-shift takeover is unaffected.

### 2. Child rows inherit the parent's branch

- Child tables that have a `store_id` column of their own get it stamped from the parent, and a mismatch is refused.
- A child whose parent is unknown is refused with `STORE_FORBIDDEN` unless the same request also carries the parent insert; the endpoint pre-scans the op batch so a till pushing `sales` + `sale_items` together still succeeds.
- `stock_transfer_items` is validated against both ends of its transfer, not just `from_store_id`.

### 3. Transfers pinned on every verb

`authorizeTransfer` handles `update` and `delete` too: the match is narrowed with `or=(from_store_id.eq.<branch>,to_store_id.eq.<branch>)`, and a caller who is neither end is refused.

### 4. Two-tier scope resolver

New `resolveRelayScope` order:

1. **Fast path** — read `store_id`, `role`, `role_slug` and permission flags from the proof itself: signed cashier-session claims and staff JWT app_metadata. No database round-trip.
2. **Fallback** — on a miss or stale claim, look up `app_users`, with a short in-worker cache keyed by user id (30 s TTL) so a burst of queued ops costs one lookup.
3. A staff caller with a JWT branch but no `app_users` row gets a read-only scope rather than a hard failure, and the response carries `SCOPE_STALE` so the client can refresh its token instead of retrying forever.

Error codes stay `STORE_FORBIDDEN`, `PERMISSION_DENIED`, `SCOPE_MISSING`, plus the new `SCOPE_STALE`; `src/lib/sync-outbox.ts` surfaces them as readable, non-retrying failures.

### 5. Migration `supabase/sql/38_store_identity.sql`

- Actor columns added where missing (`sales.cashier_id`, `sales.created_by`, `sales.updated_by`), all nullable text/uuid so existing rows are untouched.
- `app_users`: a validated trigger (not a CHECK, so supervisor rows stay exempt) requiring `store_id IS NOT NULL` for any account whose role is not admin/manager.
- RLS: confirm every till table's SELECT/INSERT/UPDATE/DELETE policy uses `user_has_store_access(store_id)` on both `USING` and `WITH CHECK`, and add the missing `booking_payments` / `sale_items` / `stock_transfer_items` parent-scoped checks.
- Re-assert GRANTs for `authenticated` and `service_role` on every touched table.

## Technical notes

- All new logic stays in `src/lib/relay-policy.server.ts` plus a small `src/lib/relay-claims.server.ts` for the JWT fast path, so both HTTP routes and the Electron worker relay share one implementation.
- Tests extend `src/lib/__tests__/relay-policy.security.test.ts`: spoofed actor name overwritten, child with unknown parent refused, child accepted when its parent is in the same batch, transfer update by an uninvolved branch refused, JWT fast path avoids the lookup, stale claim degrades to `SCOPE_STALE` not a 403.
- No client-visible behaviour changes for a correctly-signed-in till; the only user-facing difference is that cashier names on receipts and reports become server-truth.
