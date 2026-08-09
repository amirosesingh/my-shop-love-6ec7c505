# Secure sessions, idle timeouts and a full permission matrix

One session system shared by the web app, the Windows shell and the Android app: a secret only the device holds, a hashed copy in the database, an idle limit an admin can set, and a kill switch that disconnects a device on its next call.

## 1. One session record per sign-in

- Every sign-in (admin, supervisor, cashier) mints a long random token on the server. The raw value goes back to the device once and is kept in the device's secure store — Windows `safeStorage`, Android secure store, encrypted browser store on web. The database stores only a SHA-256 fingerprint of it.
- The new `user_sessions` record holds who signed in, the branch, the terminal, when it was last used, its idle limit, and whether it has been revoked.
- Every call from any platform sends the token as a bearer header, including the background sync calls. The server fingerprints it, finds the session, checks it is not revoked and not idle past its limit, then stamps the last-used time and continues.
- A missing, unknown, revoked or idle-expired token is marked revoked and answered with 401.

## 2. Signing out and being cut off

- Signing out revokes the record and wipes the device's stored token.
- Deleting a branch or resetting a terminal revokes every session tied to it, so those devices drop out on their next call — no waiting.
- One shared response check on all three platforms: a genuine 401/403 wipes local session data and returns to Sign In with "Session expired or revoked. Please sign in again." Timeouts, offline moments and 5xx keep the till working and only raise the connectivity alert.

## 3. Idle timeout settings

- New **Idle session timeout** section in admin security settings: a global default in minutes (15 / 30 / 60 / 120, or a custom number).
- Staff profiles get an optional per-person override (for example cashiers 15 minutes, admins 480). Role-level defaults sit between the two.
- The resolved limit — person, then role, then global — is written onto the session when it is created, so changing the setting later does not disturb sessions already running.

## 4. One staff list, one permission matrix

- All accounts are ordinary staff records; there is no separate cashier identity path. The internal `is_staff` helpers stay as database row-rule helpers (many existing policies depend on them and dropping them would lock tables), but they stop being the identity check for sync and API calls — the session record is.
- The permission matrix in Staff Management gets an individual switch for every capability, grouped by area: register access, refunds, voids, discounts, drawer open, inventory adjustments, staff management, settings, reports.
- Picking a role ticks that role's defaults; flipping any single switch relabels the person as "Custom permissions", with a "Reset to role defaults" action. Admin rows stay all-on and read-only.

## 5. Manager PIN and the admin bypass

- The existing "Require Manager PIN" switches keep driving the protected actions, plus "Reset all terminals".
- Admin: no prompt, the action runs and is still written to the override log as auto-approved.
- Anyone else: the Manager Authorisation PIN modal appears and the PIN is checked on the server against manager and admin accounts only. Identical behaviour on web, Windows and Android.

## Technical notes

- New `supabase/schema29.sql` (additions only, nothing dropped, no seeding): `user_sessions` (user_id, staff_user_id, branch_id, terminal_id, session_token_hash unique, idle_timeout_minutes, last_activity_at, is_revoked, created_at) with grants and RLS; `session_start`, `session_touch`, `session_revoke`, `sessions_revoke_for_branch`, `sessions_revoke_for_terminal` as security-definer routines; `idle_timeout_minutes` columns on `app_users` and `cashiers`; an `idle_timeout_minutes` default in the scoped settings rows; branch-delete and terminal-revoke triggers extended to call the revoke routines. This file must be run once against your database.
- Server: `src/lib/session-token.server.ts` (mint + SHA-256 fingerprint), `src/lib/session-guard.server.ts` used by `verifyRelayCaller` in `src/lib/pos-relay.server.ts`, `src/routes/api/public/sync.ts`, `src/routes/api/settings*.ts` and the privileged server functions; new `src/lib/auth-session.functions.ts` for start / touch / logout.
- Client: `src/lib/pos-credentials.ts` gains the raw session token as the primary credential and stops mirroring it into `sessionStorage`; `src/lib/sync-relay.ts` and `src/integrations/supabase/external-client.ts` attach `Authorization: Bearer <raw token>`; `src/lib/session-expiry.ts` stays the single decision point, wired into relay fetches and `src/lib/session-expiry.middleware.ts`.
- Settings and staff UI: `src/routes/settings.rules.tsx` gains the idle-timeout section; `src/routes/staff.tsx` gains the per-person idle override and the expanded toggle matrix backed by `src/lib/pos-permissions.tsx` and `src/lib/staff-roles.ts`; `src/lib/manager-gate.tsx` keeps the admin bypass consistent on all platforms.
- The Electron and Capacitor shells store and clear the raw token through their existing secure stores, so a remote reset clears them too.