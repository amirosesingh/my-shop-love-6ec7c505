# Activation logging, safe deploys, and Cloudflare variable persistence

## 1. Version 1.2.32 and onward

- Set the app version to `1.2.32` in `package.json` and `src/version.ts`.
- The existing bump script keeps incrementing the patch digit from there, so the next releases are 1.2.33, 1.2.34, and so on. No change to how the desktop/Android update feeds read the number.

## 2. Record every terminal activation attempt

Today an activation either succeeds silently or shows an error on the till and leaves no trace an administrator can look at. Each attempt will be written to the activity trail instead.

Recorded outcomes:

| Outcome | When |
| --- | --- |
| Activation succeeded | the till won the one-time claim |
| Already claimed | the token was already used by another device |
| Expired | the code passed its 15-minute life or its server expiry |
| Revoked | management cancelled the code |
| Invalid code | the code could not be read |
| Unreachable / setup missing | the target database refused it or lacks the helpers |

Each entry carries: terminal (token) id, branch id and branch name where known, device name and platform (Windows desktop, Android, browser), app version, timestamp, and the plain-language reason.

Because an unactivated till has no database of its own yet, the entry is written straight to the tenant named inside the token, using the same temporary connection the claim already uses. It also lands in the local trail so it survives if the network drops. Entries appear in the existing Audit / Activity screen under "Security & access", searchable by terminal id.

## 3. Nothing gets deleted after deployment

A sweep of the SQL files and app code for anything that removes data, plus a guarantee that deploying cannot drop anything:

- `supabase/sql/02_staff_and_access.sql` currently begins with `DROP TABLE IF EXISTS public.cashiers CASCADE`. Re-running the setup pack on a live database would wipe the cashier list. This becomes create-if-missing plus additive column changes, so re-running is safe.
- The same file's routine-rebuild block and policy drops stay, since replacing a function or an access rule loses no rows — they are grouped and commented as "definition only, no data".
- `supabase/sql/98_drop_unused.sql` is the only destructive file. Its statements are commented out by default and its header states clearly that nothing runs unless an administrator deliberately uncomments them. It is kept out of any "run all" path.
- `supabase/sql/99_run_all.sql` gets a stated guarantee at the top: every file it lists is additive and safe to re-run on a live database.
- The app-side deletes found in coupons, bookings, catalog metadata, stock transfers, and terminal tokens are reviewed one by one; each is a user-initiated action on a single record (remove a hold, cancel a transfer line, revoke a token). None run at start-up, on deploy, or on a timer. A short list goes into the SQL README so this stays auditable.

## 4. Cloudflare values disappearing on deploy

Cause: `wrangler.jsonc` declares no variables, and `wrangler deploy` replaces the Worker's whole variable set with what the config file declares. Anything typed into the dashboard as a plain-text variable (`SUPABASE_URL`, `SUPABASE_ANON_KEY`) is wiped on the next deploy. Encrypted secrets are normally preserved, but the same setting protects them too.

Fix in `wrangler.jsonc`:

- Add `"keep_vars": true` so a deploy never removes values set in the dashboard.
- Add a `vars` block holding only the two public values (`SUPABASE_URL`, `SUPABASE_ANON_KEY`) so a fresh Worker still boots before anyone touches the dashboard. These are public by design — the anon key already ships in browser code.
- Keep `POS_SUPABASE_SERVICE_ROLE_KEY` and `SETTINGS_ENCRYPTION_KEY` as encrypted secrets only; they are never written into the config file.

Supporting updates:

- `docs/cloudflare-hosting.md`: which four values to set, which two are plain variables and which two are secrets, and a note that `keep_vars` protects them across deploys.
- `.env.example`: the same four names with the same split.
- The health probe at `/api/public/sync-health` already reports where the configuration came from; it will also report whether each of the four names is present, so a missing value is visible in one look after any deploy.

## Technical notes

- Files touched: `package.json`, `src/version.ts`, `src/lib/terminal-tokens.ts` (activation outcome logging), a small helper for writing an activation event to a tenant, `src/routes/api/public/sync-health.ts`, `wrangler.jsonc`, `supabase/sql/02_staff_and_access.sql`, `supabase/sql/98_drop_unused.sql`, `supabase/sql/README.md`, `docs/cloudflare-hosting.md`, `.env.example`.
- No schema migration is required: activation events use the existing `audit_logs` table and its existing access rules.
- No change to how queries are authorised; the logging write uses the same temporary tenant connection the claim already opens.