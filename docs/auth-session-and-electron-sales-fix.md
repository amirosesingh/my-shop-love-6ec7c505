# Auth session and Electron sales visibility fix

## Scope

This change addresses two related runtime failures:

- stale Supabase sessions repeatedly calling `/auth/v1/user` with a revoked token and then calling the authenticated-only `current_app_user()` RPC without a valid identity;
- completed Electron sales being committed to local SQL Server but disappearing from, or never being refreshed into, the renderer.

## Authentication flow

Persisted Supabase sessions are now validated before the application exposes them to background workers. A nearly expired session is refreshed first and an online session is confirmed with `getUser()`. A definite server rejection such as `Session not found` clears the session immediately; a connectivity failure preserves the stored session for offline operation.

Only a verified central user starts central-account status polling. A local terminal or cashier session therefore no longer makes anonymous calls to `current_app_user()`. Logout clears renderer identity and background-session presence before the remote logout request, closing the race in which authenticated work could continue while the server session was being revoked.

The `current_app_user()` function remains restricted to the `authenticated` role. No anonymous execute permission was added.

## Electron checkout-to-UI flow

1. Checkout sends the complete sale aggregate through the preload bridge.
2. Electron commits the sale, its items, payment transactions, and related rows to SQL Server atomically.
3. Only after that transaction succeeds, the main process broadcasts `business:changed` to open renderer windows.
4. The renderer reloads local sales and updates the POS store immediately.
5. The local snapshot now hydrates each receipt with its item and payment rows, including payment metadata required by receipt views.
6. Electron startup, focus, reconnect, and Realtime notifications all re-read the connected SQL Server snapshot. They never replace the receipt list with a cloud-only result.
7. Browser and mobile clients remain cloud-first.

The renderer now calls the actual nested preload sync interface (`pos.sync`) so foreground and network events wake the main-process coordinator. The main process remains the only Electron sync owner.

## HTTP 400 aggregate repair

Supabase logs identified the failed RPC as `pos_sync_push_aggregate` with `SYNC_BRANCH_FORBIDDEN`. The sale header and payment rows carried the branch, but sale-item rows did not. New checkouts now persist `sale_items.branch_id`.

For receipts already queued locally, the push worker fills only an empty sale-item branch from the terminal's authoritative aggregate branch. It never overwrites a non-empty different branch, so central cross-branch validation remains intact. PostgREST `message`, `code`, status, and details are also retained in desktop diagnostics instead of being reduced to `HTTP 400`.

Branch filtering remains in place for the SQL Server snapshot and renderer event handling, so a terminal refreshes only the active branch's receipts.

## Database impact

No new Supabase migration or SQL Server schema upgrade is required for this fix. The existing idempotent SQL Server updater already creates `sale_items.branch_id`; this change populates it in new writes and repairs missing values in queued upload payloads. The strict Supabase branch validation is intentionally unchanged.

## Validation

- Auth-session regression tests cover revoked sessions, offline connectivity, and near-expiry refresh.
- Electron sales tests cover local item/payment hydration, local-first renderer routing, the main/preload/renderer notification contract, queued branch repair, and detailed PostgREST errors.
- The complete Vitest suite, TypeScript check, production build, and diff whitespace check are required before release.

Real-device acceptance should complete a cash and card sale on an activated Electron till, verify immediate appearance in receipts without restarting, then reconnect and confirm the same stable sale ID appears centrally exactly once.
