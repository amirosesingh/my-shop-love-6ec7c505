# Offline-first architecture & sync reliability — code analysis (no changes yet)

Each section names the exact file/line where the problem lives and the change required.

## 1. Instant app launch

**Where it blocks:**

- `src/components/pos/AppShell.tsx:257` — `if (!dataReady && !offlineBypass) return <TillLoader …/>`. The whole UI is gated on the pos-store `ready` flag.
- `src/lib/pos-store.tsx:412–465` (boot effect) — the snapshot paints instantly **only if one exists**. On a fresh/cleared device there is no snapshot, so `ready` waits for `await loadCloudState()` (line 438) to settle, plus a 15 s watchdog (line 379). `loadCloudState` (`src/lib/pos-db.ts:821`) fires 7 sequential cloud reads; a slow connection = long loader.
- `AppShell.tsx:245` — a second full-screen spinner while `terminal.hydrating` unseals the tenant config.
- Good news: on Electron the main process already connects the local DB in the background (`electron/main.cjs` — `void connectLocal(…)`, explicitly "Never awaited"). The block is purely the renderer's `ready` gate.

**Change required:** make the shell render immediately — set `ready` after the synchronous localStorage/snapshot read instead of after the cloud load, run `loadCloudState()` purely as a background refresh (it already merges via `applyCloud`), and replace the full-screen `TillLoader` with the existing compact status pill (`SystemStatusPill`/`TillLoader` already has tone logic to reuse) while data loads. Keep the stall/Retry affordance for the truly-empty first run only.

## 2. Offline data visibility

**Where it originates:**

- `src/lib/db-query.ts:46–51` (`localSlice`) — the "local copy" for reads is **only the browser snapshot** (`readSnapshot()`), even on Electron. The local SQL Server mirror is never queried for reads. 
- `src/lib/offline-snapshot.ts:30–36` — the snapshot holds only `products, members, sales, shifts, promotions, stores, settings`. **Suppliers, bookings, stock_transfers, membership_tiers, held_orders, payment history are not in it**, so those screens have nothing to fall back to offline.
- `src/lib/db-query.ts:85–116` (`runQuery`) — cloud-first when online; local fallback only on connection-class errors. That's correct behavior, but useless for the tables missing from the snapshot.
- `src/lib/pos-db.ts:821` (`loadCloudState`) — the boot read also skips suppliers/bookings/transfers entirely; they only load per-screen against the live cloud.

**Change required:** extend the local read path so `localSlice`/snapshot covers every screen table (add suppliers, bookings, stock_transfers + items, membership_tiers, held_orders to the snapshot writer), and on Electron route local reads through the bridge (`window.pos.snapshot()` / table reads) instead of localStorage. Add the persistent "Offline — showing local data" badge in `AppShell` (the `OfflineDataNotice` component exists — wire it to `effectiveDatabaseMode()`/health instead of per-screen usage).

## 3. Sync failures — payment_transactions & item_activity_logs

**Why these two specifically fail while others succeed:**

- `electron/sync/worker.cjs:167–172` (`init`) — the worker's direct cloud client is created with the **publishable (anon) key** and only gets an `Authorization` header if an `accessToken` was passed in. A cashier signed in by PIN has **no Supabase auth session**, so the worker runs as `anon`. `payment_transactions` (3 policies) and `item_activity_logs` (2 policies) are authenticated-role tables — anon pushes/pulls are refused by RLS. Other tables succeed because the worker prefers the **relay** (`cloudUpsert`, line 183) when a cashier/terminal/session token exists — and the relay (`src/lib/pos-relay.server.ts:56–57`) whitelists both tables. So the failure mode is: **whenever the relay isn't reachable/configured, the direct fallback is anonymous and these two tables are the first to be refused.**
- `electron/sync/worker.cjs:230` (`push`) + `applyStockDeltas` — after upserting `item_activity_logs`, the worker calls `supabase.rpc("stock_apply_deltas")` **directly as anon**. If the RPC isn't granted to anon, every batch errors; the delta error is stored on the watermark but the rows are still marked synced — so stock silently diverges while the UI looks green.
- `src/lib/pos-relay.server.ts:240–263` — the 409 idempotency rescue exists **only in the relay**. The direct path (`runOpLive` in `src/lib/sync-engine.ts:387`) upserts `onConflict: "id"`; a `client_transaction_id` unique-constraint collision (23505) on the direct path is a hard failure — this is the exact "duplicate key value violates unique constraint … client_transaction_id" error you saw.
- Retry/backoff exists in `src/lib/sync-outbox.ts` (renderer queue) but the Electron worker's `markFailed` parks rows after MAX_ATTEMPTS with only a generic message.

**Change required:** (a) never let the worker push these tables as anon — route through the relay whenever any proof token exists, otherwise hold rows as pending instead of failing them; (b) move the `stock_apply_deltas` call behind the relay (or grant + authenticate it) so stock deltas can't be marked synced while refused; (c) port the relay's `client_transaction_id` 409-rescue into `runOpLive` for the direct path; (d) classify failures (network / 401-403 auth / 409 conflict / PGRST204 schema / 23505 constraint) into `sync_error` so the Sync Hub shows the real reason per row.

## 4. Offline login / shift errors

**Where it originates:**

- Login itself is covered: `src/lib/pos-auth.tsx:510–548` falls back to `verifyLocalPin` (Electron bridge) then `verifyCachedPin` (PBKDF2 localStorage cache, `src/lib/offline-credentials.ts`). 
- The shift error: `src/lib/pos-db.ts:956` (`loadActiveShift`) — with no staff session and no relay it calls `localOpenShift` (line 948), which reads **only the snapshot's `shifts` slice**. No snapshot → it throws `"This till cannot read the central database yet"` — this surfaces as the shift-section system error at offline login. On Electron the local SQL DB has the shift rows but is never asked.
- Opening a shift offline: `pos-store.tsx` `openShift` → `openShiftOnServer` returns null without a session → `db.commitShift` → `commitOps` (`pos-db.ts`). On **Electron** this writes locally and works. On the **browser build** the code deliberately throws `AllTargetsFailed` ("no local engine") — so browser offline shift-open fails by design.
- Actual errors are mostly swallowed: `commitOps` throws `AllTargetsFailed` with a generic "Database Connection Required" message (`db-mode.ts:83`), discarding the real cause chain.

**Change required:** teach `localOpenShift`/`loadActiveShift` to ask the Electron bridge for the open shift when the snapshot has none; keep shift state (open/close, totals) mirrored locally on every change (the worker already pulls `shifts`); include the underlying error message in `AllTargetsFailed` (`error.context`/`cause` exist but aren't rendered — show it in `ShiftGuard`'s error panel); leave the browser build cloud-only for shifts but say so explicitly in the error.

## 5. Pull sync failures (transfers, bookings, suppliers, stores, promotions, tiers, members)

**Where it originates:**

- `electron/sync/worker.cjs:344–360` — the **catalogue loop is not resilient**: on any error that isn't "table missing centrally" it does `setPhase("idle"); return` — one failing table (e.g. `promotions`) aborts `suppliers`, `stores`, `membership_tiers` for that cycle. The scoped loop (line 370+) correctly `continue`s per table. This is exactly your "one entity blocks the others" symptom.
- Same anon-auth root cause as issue 3: `selectChangedSince`/`selectScoped` run on the worker's anon client. `members` (4 policies), `stock_transfers` (4), `bookings` (4), `suppliers`, `stores`, `promotions`, `membership_tiers` all have authenticated-scoped RLS — as anon they return **empty or 401/403**, and empty pulls advance nothing but also log nothing, so it looks like "sync runs but nothing arrives".
- No pagination: `.gt(column, since)` with no `range()` — over 1000 changed rows, PostgREST's default cap silently truncates the delta.
- The renderer-side counter (`sync-engine.ts` `pullDelta`) uses HEAD requests with the user's session — those succeed (your network log shows 200s), so the badge says "changes available" while the worker can't fetch them.

**Change required:** make the catalogue loop `continue` per table like the scoped loop; authenticate worker pulls (relay read endpoint or a stored terminal/staff token in the `Authorization` header); add per-entity structured logging (`table, rows, status, error`) into `sync_metadata`; add `range()` pagination to both select helpers.

## Console errors you listed

- **`POST /auth/v1/token?grant_type=password` → 400** — two call sites: `pos-auth.tsx:330` (`login()`) and `terminal-session.ts:45` (`ensureTerminalSession`). A 400 here is `invalid_grant`: either the typed credentials don't match an `auth.users` account (PIN-only staff exist in `app_users`, not Auth — `login()` maps the username via `toLoginAddress` and 400s if that hidden account was never provisioned), or the terminal machine account hasn't been provisioned yet. It's caught and handled, but noisy. Fix: verify `preparePinAccount`/`provisionTerminalAccount` succeeded before attempting the sign-in, and demote the expected-failure log.
- **`POST /rest/v1/rpc/current_app_user` → 401** — fired from `pos-auth.tsx:287` (effect on `userId`), also lines 337/382/831. 401 means the request carried no valid JWT for the **external** project: either the session expired (`sb-external-auth-token` stale), or `current_app_user` lacks `GRANT EXECUTE` to `authenticated` on your external project. Fix: guard the call on a live session (`getSession()` first), and confirm the EXECUTE grant + that the function is `security definer` with `auth.uid()` handling null.
- **`POST /_serverFn/…` → 401 with `FORCE_RELOAD` HTML** (in your network log) — that's the Lovable preview's own access wall intercepting server-function calls in the preview iframe, not app code. It disappears in the published app / desktop build.

## Proposed implementation order (after your confirmation)

1. Issue 1 (launch gate) + Issue 4 (shift local read + error surfacing) — smallest, unblocks daily use.
2. Issue 3 (relay-first pushes, delta-apply auth, 409 rescue on direct path, error classification).
3. Issue 5 (resilient catalogue loop, authenticated pulls, pagination, per-entity logs).
4. Issue 2 (widen snapshot + Electron local reads + offline badge) — largest surface, touches every screen's data path.

No code has been changed yet. Confirm and I'll start with step 1, or tell me a different order.
