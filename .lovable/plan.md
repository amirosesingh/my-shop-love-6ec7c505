# Architecture Scan + Stage 1: Fix Cashier Login (Electron, online + offline)

## Database engines (answer to your question)

- **Local (on the till):** two local stores exist.
  - **SQLite** — embedded, `userData/local_pos_database.db`, opened with Node's built-in `node:sqlite` (no native module). Schema: `electron/db/offline_sqlite_v2.sql`. This is the default offline mirror.
  - **Microsoft SQL Server** — optional shop server the operator connects to via the setup wizard (ODBC / `msnodesqlv8`, `electron/db/pool.cjs`, `repo.cjs`, script `db/offline/pos-offline-sqlserver.sql`).
- **Online/server:** **PostgreSQL** (Supabase/Lovable Cloud), migrations in `supabase/migrations/` (latest `20260821035305_*.sql`).

So Stage 5 will need three SQL dialects: Postgres (server), SQLite (embedded local), T-SQL (shop SQL Server) — SQLite gets additive `ALTER TABLE ... ADD COLUMN` / recreate-table patterns only.

## How login works today

```text
CashierPinLogin -> useAuth().cashierLogin(username, pin)
  -> POST /api/public/cashier-login  (served by the local Node app server Electron spawns on 127.0.0.1)
      -> hasServiceKey()  --> if false: 503 "Central database key missing on this server"
      -> cashierLoginServer(): rpc verify_terminal_pin via service key
      -> signCashierSession() requires SETTINGS_ENCRYPTION_KEY
  -> on network throw only: verifyCachedPin() from localStorage cache
```

## Root cause (verified by reading the code)

1. **Missing server keys in the Electron build.** `electron/main.cjs` `startAppServer()` spawns the bundled server with `{...process.env, HOST, PORT, NODE_ENV}` and nothing else. No file in `electron/` ever sets `POS_SUPABASE_SERVICE_ROLE_KEY`, `POS_SERVICE_ROLE_KEY`, `SUPABASE_POS_SERVICE_ROLE_KEY` or `SETTINGS_ENCRYPTION_KEY` (grep across `electron/` returns nothing; they only appear in `.env.example`). On a packaged shop PC those variables do not exist, so `hasServiceKey()` is false and the endpoint answers 503 *"Central database key missing on this server"* — this is the "no key/database keys found" message. Even with the key present, session minting would still throw because `SETTINGS_ENCRYPTION_KEY` is also absent.
   It is **not** a hostname/domain resolution problem: the renderer talks to `http://127.0.0.1:<port>` from the same process tree.
2. **No fallback on a server-side failure.** In `pos-auth.tsx` the offline path is only entered when `fetch` throws or `navigator.onLine` is false. A 503/500 JSON reply sets `failure` and the login is refused outright — so the key problem also blocks the offline path.
3. **"Offline login" is not backed by the local SQL database.** `src/lib/offline-credentials.ts` stores a PBKDF2 verifier in `localStorage`, only for staff who already signed in successfully on that terminal. The SQLite mirror already has `app_users` (with `pin_hash`, `pin_length`, `permissions`, `store_id`) and `cashiers`, but **nothing syncs staff rows into it and nothing reads them at login** (no `app_users` reference in `repo.cjs` or the sync engine). So a fresh till with no internet cannot authenticate anyone.

## Stage 1 changes

**A. Key provisioning for the desktop server**
- Add a sealed key store (reuse the `safeStorage` pattern of `electron/db-config-store.cjs`) holding the service key and settings-encryption key, and inject them into the spawned app-server env in `startAppServer()`.
- Fall back to `process.env` and to keys baked at build time so existing deployments keep working.
- Surface entry/edit in the existing Secure Credentials settings panel, and make the server restart pick up newly saved keys.
- If keys are absent, `/api/public/cashier-login` answers with a distinct machine-readable code (`no_service_key`) instead of a generic error.

**B. Client fallback logic (`src/lib/pos-auth.tsx`)**
- Treat *transport or server-capability* failures (fetch throw, 5xx, `no_service_key`, timeout ~6s) as "no connection" and fall through to local login.
- Keep credential rejections (401 invalid PIN, deactivated account) as hard failures — never fall back for those, so a disabled account cannot log in offline.

**C. Local SQL database login**
- New Electron IPC verb `staff:verify-pin` in `electron/db/repo.cjs` + `sqlite.cjs`: look up `app_users` by `user_id`/email, check `is_active`, verify the PIN against the stored hash, return profile + permissions. Implemented for both local engines (SQLite mirror and shop SQL Server) through the existing router.
- New sync pull of staff rows (`app_users`, `staff_roles`, permissions) into the local mirror on every successful online session, so the till can authenticate someone who has never signed in on that machine.
- The hash format must match what the server stores; if the server-side hash is not reproducible client-side, the till stores a PBKDF2 verifier written at sync time instead — decided while implementing, and reported back to you.
- Keep the existing `localStorage` verifier as a last-resort third tier.

**D. Sync-back after an offline login**
- Offline sign-ins, session starts/ends and attendance rows are written to the local outbox with a deterministic id (terminal + username + timestamp) and pushed on reconnect through the existing sync engine, upserted on that id so replays cannot duplicate.

**E. Diagnostics**
- Login failures log a specific reason (no key / unreachable / rejected / local-fallback-used) into the existing diagnostics log, and the login screen shows "Signed in offline — will sync when connection returns".

## Notes

- No schema changes are applied in Stage 1; any new/changed columns are recorded and turned into SQL files in Stage 5.
- Stages 2–5 are untouched until you approve Stage 1.
