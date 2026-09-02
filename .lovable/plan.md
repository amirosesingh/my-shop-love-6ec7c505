# Targeted feature check — Android, Electron & Database

## Feature 1 — API / Private Key (Android + Electron)

**Current:**
- No service-role or secret key is hardcoded anywhere in the Electron or Android code. The only secret path is `electron/server-keys.cjs`, which seals a service-role key in the OS vault and injects it into the bundled local server, and `src/components/pos/settings/panels/ServerKeysPanel.tsx`, which lets an administrator type that service-role key into the desktop app. That is exactly the "move the private key into settings" pattern you ruled out.
- `src/lib/external-supabase-config.ts` hardcodes a project URL and publishable (anon) key as `POS_PROJECT`. Non-secret, but it is baked into the bundle; on terminal apps it is deliberately ignored in favour of the sealed per-device values.
- Non-secret cloud config on device is already correct: Electron uses DPAPI/safeStorage (`electron/cloud-credentials.cjs`), Android uses Keystore/EncryptedSharedPreferences (`src/lib/secure-cloud-config.ts`).

**Required (partially present):**
- Remove the service-role key from the desktop device entirely: delete the key-entry UI and the sealed service-key store, and have cashier PIN sign-in and other privileged operations answered by the hosted backend endpoint (`/api/public/cashier-login` on the central server) instead of a locally spawned server holding the key. Keep the locally generated session-signing key, which is not a shared secret.
- Leave the hardcoded `POS_PROJECT` values as they are for Web (out of scope) but confirm terminal builds never fall back to them.

## Feature 2 — Emergency Access

**Current:**
- Android: `src/components/mobile/OfflineGate.tsx` blocks the app with "No connection / Try again" and has no way into configuration — a device with a wrong or missing backend URL/key cannot be repaired from that screen.
- Electron: the recovery window (`electron/recovery.cjs` + `recovery.html`) only opens on repeated *startup* failures and offers rollback/logs/diagnostics — no connection repair. In-app, `CloudSetupGate.tsx` appears only when no keys are stored, and offers "Continue Offline".

**Required (partially present):**
- Add an "Emergency access" action on the Android no-connection gate and on the Electron connection-failure state, opening a local-only configuration screen that never calls the failing backend.
- On Electron, make that screen reachable from the safe-mode recovery window too (it already runs independently of the app bundle).
- Gate entry with the existing local admin/PIN check so it is not open to any user.

## Feature 3 — Recovery / Emergency Settings

**Current:** There is no recovery-settings surface for connection repair. Configuration today lives inside the normal app at Settings → Database & Cloud Connection, which is unreachable when the gate blocks the app.

**Required (not present):**
- A minimal offline-capable configuration screen holding exactly what the code needs to reach the backend: central database URL and publishable (anon) key (`secure-cloud-config`), plus a "test connection" call and a "clear stored credentials" action. Nothing else — terminal and branch configuration stay untouched.

## Feature 4 — Stock Transfer / Receiver product table

**Current:** `src/components/pos/ProductPicker.tsx` is a single-line list (name, one code, on-hand at the branch) inside a 208px scroll box, used by `TransferComposer.tsx`. It filters the whole catalogue already held in client state, shows only the first 25 matches, has no fixed-header columns, no branch column, no quantity field or Add button (clicking a row adds it), and no scanner input. `/receiving/$id` has no picker at all (it counts the note's lines).

**Required (partially present):**
- Rework the picker into a compact fixed-header table: Barcode | Item | Branch (where applicable) | Available | Qty | Add, with its own internal scroll.
- Add a scan/search input that accepts a scanner's keyboard-wedge input and adds an exact barcode match immediately.
- Replace the full in-memory catalogue scan with a server-side search (debounced, limited result set) so large catalogues are not loaded into the client.
- Keep the surrounding transfer/receiving forms unchanged.

## Feature 5 — Database health check / migration generator

**Current:**
- Cloud: `central-schema.ts` (authoritative definition) + `central-drift.ts` compare tables, columns and coarse type family via PostgREST introspection, and `schema-health.ts` generates a versioned, additive-only Postgres migration file that records itself in `schema_migrations`. Indexes are emitted only when a dependent column was repaired. Nullability, primary keys, foreign keys, constraints, defaults, functions, triggers, RLS and policies are not compared, and RLS/policy statements are never generated.
- Local: the engine is Microsoft SQL Server with `database/schema.sql` as master; `SchemaPanel.tsx` + `repo.cjs` heal missing tables/columns with guarded T-SQL, and `schema-health.ts` emits a matching `local_NNN` file. Same coverage limits.
- Nothing drops or recreates structures — that requirement is already satisfied.

**Required (partially present):**
- Extend the authoritative definition and the comparison to nullability, defaults, primary keys, foreign keys, check/unique constraints, indexes, functions, triggers, RLS state and policies (cloud), and the equivalent subset for SQL Server (no RLS/policies there).
- Introspect the cloud side through a service-relay SQL read of `information_schema`/`pg_catalog` rather than the PostgREST root document, which cannot expose constraints, triggers or policies.
- Emit one complete migration file per environment covering schema plus security (RLS enable + `create policy if not exists`), still additive and non-destructive, with drops surfaced as commented-out suggestions only.

## Nothing to change

Web API/key configuration, terminal configuration, branch configuration and all other POS features are out of scope for this work.
