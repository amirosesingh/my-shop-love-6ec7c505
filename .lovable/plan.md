# POS Audit — Findings and Proposed Remediation

Full report: `pos-audit-report.md` (attached in chat). Nothing has been changed and no "dead code" has been removed.

## Headline result

The Windows/Electron till is genuinely offline-first and passes end to end. **Web and Android are not offline-capable**, even though the shared code reads as though they are: `sync-outbox.ts` and `offline-snapshot.ts` both require the Electron `window.pos` bridge, so on Web and Android the offline queue and the cold-start snapshot are silent no-ops. Android additionally purges business data on every launch by design, which wipes held orders and in-progress carts.

Backend policy check found one internet-readable table. Nothing indicates a live breach, but it should be closed first.

## Proposed work, in order

### Stage 1 — Security (do first)
1. `settings_overrides`: replace the `public` + `USING (true)` read policy with the private-key/staff scoping the ALL policy already uses.
2. `settings_scoped`: scope reads to staff/supervisor instead of every authenticated account.
3. `settings_locks`: restrict reads to authenticated staff.
4. Revoke `EXECUTE` from `anon` on `SECURITY DEFINER` functions outside the intentional public set (keep `coupon_claim`, `member_join`, `voucher_by_token`; remove `verify_*_pin`, `staff_account_*`, `set_app_user_permissions`).
5. Electron update rollback: verify a SHA-256 from a signed manifest before spawning the downloaded installer.
6. Wire the existing `pin_throttle_*` functions into `/api/public/cashier-login`.

### Stage 2 — Data-loss paths
7. Add `pos.held.orders` and `pos-state-v2` to the Android persistent allow-list so parked tickets and carts survive a process kill.
8. Give the outbox a real backing store off Electron: IndexedDB on Web, Preferences/SQLite on Android, so a mid-sale disconnect queues instead of throwing away the sale.
9. Queue failed `applyStockDeltas` batches on that same outbox so stock cannot silently miss a decrement after a committed sale.
10. Persist the row-version cache alongside the outbox so conflict detection survives an Android relaunch.

### Stage 3 — Hardening and correctness
11. Electron: add a CSP, `sandbox: true`, and a deny-by-default `setWindowOpenHandler`.
12. Make the relay `NO_SERVICE_KEY` direct-retry conditional on the relay confirming it did not execute, so unkeyed update/delete ops cannot double-apply.
13. Add realtime subscriptions for `held_orders`, `sales`, `products` instead of relying on the 15s poll.
14. Point the SQL explorer at a read-only database login rather than relying on a keyword blocklist.
15. Small guards: `native-http.ts` should assume the plugin is unavailable when the probe is inconclusive; add a `typeof window` guard at `pos-store.tsx:386`.

### Stage 4 — Cleanup (only on your say-so)
16. Delete 15 confirmed-unreferenced files (2 hooks, 3 POS components, 10 unused shadcn primitives).
17. Drop the `export` keyword from ~73 symbols used only inside their own module.
18. Remove `@hookform/resolvers` and `date-fns`; remove `embla-carousel-react` and `input-otp` if their unreferenced UI primitives go.
19. Split `src/routes/index.tsx` (3,500+ lines) into register feature modules.

## Decisions I need from you

- **Printing on Android/Web**: Windows is the only platform that can drive a receipt printer or cash drawer. Do you want a Bluetooth ESC/POS plugin for Android, or should Web/Android be documented as view-only and not used as selling tills?
- **Android offline**: it is currently live-only on purpose. Do you want it made genuinely offline-capable (stage 2 item 8), or should it keep the live-only contract with only the held-order/cart fix?
- The tills talk to a **user-configured external backend**, so the policy fixes in stage 1 must be applied there too — confirm you want migrations generated for that project as well as the managed one.

## Technical notes

- Policy changes go through migrations; each keeps branch scoping intact (`store_visible` / `user_store_id`), no policy will be widened to `true`.
- The outbox change is additive: a storage-adapter interface behind `sync-outbox.ts` with three backends (Electron local DB, IndexedDB, Capacitor Preferences). No change to `commitOps` call sites.
- No database tables are unused — all 51 are referenced. The four uncalled API routes are documented external-consumer endpoints and will not be removed.
