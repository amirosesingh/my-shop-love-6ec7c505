# Lock the sync relay to the caller's own branch and permissions

## What the audit found

- `src/routes/api/public/sync.ts` proves *who* the caller is (`verifyRelayCaller`) but then calls `runRelayOp(op)` without passing the caller at all.
- `src/lib/pos-relay.server.ts` executes every operation with the service key (`serviceRest`), checking only that the table is in `RELAY_TABLES` (18 tables incl. `sales`, `products`, `members`, `stores`, `purchase_orders`).
- Result: a till proven for store A can insert/update/delete rows for store B, and no permission flag (`can_edit_product_price`, `can_process_refund`, `can_edit_member_points`, ...) is re-checked server-side.
- The cashier-token path in `verifyRelayCaller` returns no `storeId` at all; the session-token path does (`branch_id`). Terminal tokens carry `location_id`.

## Important constraint on the requested approach

Fully removing the service key is not possible for this app: PIN cashiers have **no** account on the central database, which is the entire reason the relay exists. Replacing it with a caller-scoped client would break offline/PIN tills. Instead the relay becomes a **server-side policy enforcement point** that applies the same rules RLS would apply, and the service key is only ever used after those checks pass. Staff callers who *do* hold a real session keep going direct (RLS-enforced) as today.

## What gets built

### 1. A real caller scope

Extend `RelayCaller` with `storeId`, `roleSlug`, `permissions`, `isSupervisor`:
- session token -> `branch_id` + look up `app_users` by `staff_user_id` for role/permissions
- cashier token -> resolve `app_users` by username to get `store_id`, role and permission flags (today it returns nothing)
- terminal token -> `location_id`, treated as a till with till-level permissions only
- staff access token -> `app_users` by `auth_user_id`; admin/manager become `isSupervisor` (cross-branch allowed)

### 2. Store-boundary enforcement in `runRelayOp`

`runRelayOp(op, caller)` — caller becomes a required argument, so no call site can skip it.
- For store-scoped tables (`sales`, `shifts`, `shift_sessions`, `held_orders`, `bookings`, `booking_payments`, `drawer_events`, `stock_adjustments`, `sku_audit`, `purchase_orders`, `whatsapp_queue`): every row gets `store_id` **stamped** with `caller.storeId` (an incoming different value is rejected, not silently overwritten), and every `update`/`delete` match gets `store_id=eq.<caller store>` appended so it can never touch another branch.
- Child tables (`sale_items`, `purchase_order_items`, `booking_payments`, `stock_transfer_items`) are validated by parent lookup: the parent id must belong to a visible store.
- `stock_transfers`: caller must be the `from_store_id` or `to_store_id` branch.
- `stores` is removed from the writable set entirely (supervisor-only, and supervisors have a real session and write directly).
- A caller with no resolvable `storeId` and no supervisor role is rejected 403.

### 3. Permission re-checks for sensitive writes

Before the write, the relay re-validates the caller's `app_users.permissions` server-side:
- `products` price/cost columns -> `can_edit_product_price`; `members.loyalty_points`/`total_spent` -> `can_edit_member_points`; `sales.is_refunded` and refund rows -> `can_process_refund`; discount columns -> `can_give_discount`; `purchase_orders*` -> `can_receive_purchase_order`; deletes on `sales`/`sale_items` -> `can_void_item`.
- Column allow-lists per table strip anything not syncable (audit/immutable columns).
- Failures return `403` with a specific code (`STORE_FORBIDDEN`, `PERMISSION_DENIED`, `TABLE_FORBIDDEN`) that the outbox surfaces as a readable message instead of retrying forever.

### 4. Route

Add the protected path `src/routes/api/v1/pos/sync.ts` as the canonical endpoint (same handler module, shared logic extracted). `/api/public/sync` stays mounted as a thin deprecated alias with identical enforcement, because shipped Android APKs and Electron builds (`electron/main.cjs`, `src/lib/sync-relay.ts`) point at it and would go permanently offline otherwise. New clients are pointed at `/api/v1/pos/sync`; the alias can be retired once installs have rolled over.

### 5. RLS migration

One migration plus a mirrored `supabase/sql/36_store_isolation.sql`:
- `user_has_store_access(_store_id text)` — SECURITY DEFINER, `SET search_path = public, pg_temp`: true for admin/manager, otherwise `app_users.store_id = _store_id`.
- Confirm RLS enabled on all relay tables; rewrite policies for `sales`, `sale_items`, `shifts`, `shift_sessions`, `held_orders`, `bookings`, `booking_payments`, `drawer_events`, `stock_adjustments`, `purchase_orders(+items)`, `stock_transfers(+items)` so SELECT/INSERT/UPDATE all require `user_has_store_access(store_id)`, with `WITH CHECK` matching `USING` (this also closes the two flagged gaps: `booking_payments` and `sale_items` WITH CHECK being bare `is_staff_now()`).
- `products`, `members`, `stores`, `pos_settings`: writes require the matching permission flag via `has_perm()` triggers; reads stay staff-wide.
- Re-assert GRANTs for `authenticated` / `service_role` on every touched table.

## Technical notes

- Enforcement lives in one new module `src/lib/relay-policy.server.ts` (scope resolution, table rules, column allow-lists) so both routes and the Electron worker relay path share one implementation.
- Tests added under `src/lib/__tests__/relay-policy.security.test.ts`: cross-store write rejected, spoofed `store_id` in payload rejected, permission-gated column rejected, supervisor cross-branch allowed.
- Not in scope of this pass (separate findings, happy to do next): unauthenticated `pushActivityEvent`, `recordSystemAudit`, `verifyManagerPin`, `getTerminalAccount`, and the anon grant on `security_report_findings`.
