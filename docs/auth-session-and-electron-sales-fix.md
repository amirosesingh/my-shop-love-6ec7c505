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
6. A locally committed sale is retained while cloud or Realtime snapshots are stale. It stops being protected after a direct cloud sales read contains the sale.

Branch filtering remains in place for the SQL Server snapshot and renderer event handling, so a terminal refreshes only the active branch's receipts.

## Database impact

No Supabase migration and no SQL Server schema upgrade are required for this fix. It changes session sequencing, SQL read composition, Electron IPC notification, and renderer reconciliation only. Existing database upgrade scripts are intentionally unchanged.

## Validation

- Auth-session regression tests cover revoked sessions, offline connectivity, and near-expiry refresh.
- Electron sales tests cover local item/payment hydration and the main/preload/renderer notification contract.
- The complete Vitest suite, TypeScript check, production build, and diff whitespace check are required before release.

Real-device acceptance should complete a cash and card sale on an activated Electron till, verify immediate appearance in receipts without restarting, then reconnect and confirm the same stable sale ID appears centrally exactly once.
