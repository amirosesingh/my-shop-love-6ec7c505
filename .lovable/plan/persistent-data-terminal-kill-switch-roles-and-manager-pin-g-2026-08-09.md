# Persistent data, terminal kill switch, roles and manager PIN gates

Five connected changes: stop the app re-creating deleted records, keep writes behind proven callers, give admins a remote terminal reset, add custom roles with smart permission presets, and a per-action "Require Manager PIN" list with an admin bypass.

## 1. Deleted data stays deleted

- Confirmed cause: on every load, when the products table comes back empty the app copies the built-in demo catalogue (products, members, promotions) straight back in (`loadCloudState` -> `seedCloud` in `src/lib/pos-db.ts`). A second path pushes the built-in store list back whenever the stores table is empty (`src/lib/pos-store.tsx`).
- Both are removed. An empty database stays empty and the screens show their normal empty states.
- The demo content becomes an explicit, admin-only "Load sample data" button on the diagnostics page, so it can never run by itself.
- The in-memory starting state no longer carries demo products, members or promotions, so a first paint before the database answers cannot look seeded or be written back by a later save.
- A regression test asserts nothing performs a bulk insert during load.

## 2. Writes only from proven callers

- Every table write goes through the till relay or a signed-in session; the relay's caller check is tightened so an unproven caller writes nothing and the failure is surfaced instead of silently retried.
- The public sync endpoints keep working for tills but reject any request that cannot prove a cashier session, an active terminal token, or a staff token.
- Row rules are reviewed per table so delete and update require signed-in staff or a supervisor, never a visitor.

## 3. Session ends when the token is rejected, plus a remote kill switch

- One shared response check wraps the central-database client and server-function calls. A 401 or 403 clears the saved session and returns the terminal to the login screen with "Your session ended, please sign in again."
- Timeouts, offline moments and 5xx errors never sign anyone out; they raise the existing connectivity alert and the till keeps working.
- New **Active terminals & sessions** panel (admin only) listing each activated terminal and each open staff session: branch, device, staff name, last seen, status.
- Each row gets **Remote reset**: it revokes that terminal's token and ends its open sessions in the database. The remote till drops out on its next call or its five-minute check, wipes its saved activation and returns to the activation/login screen.

## 4. Roles and staff management

- Built-in roles stay: Cashier, Warehouse Supervisor, Supervisor, Admin — not renameable or deletable.
- New **Role management** panel in Staff Management: create a custom role (name, base level, own default permission checklist) and delete custom roles only; deletion is blocked while staff are assigned.
- Choosing a role ticks that role's defaults; changing any single box switches the label to "Custom permissions", with a "Reset to role defaults" action.
- Staff create/edit forms gain a 4-6 digit **Manager PIN** field, sent to the server and stored hashed, never shown back. Editing shows "PIN set" with "Change PIN".

## 5. Manager PIN toggles and authorisation flow

- New **Manager PIN requirements** section in admin security settings: refunds, cart void, line delete, quantity reduce, manual discount, price override, no-sale drawer open, stock adjustment, shift close, tender edit. Each switch is saved per branch using the existing Global -> Cluster -> Branch inheritance; the legacy refund/drawer PIN toggles fold into this list.
- OFF: the action runs immediately if the user's own permissions allow it.
- ON and the user is an Admin: no prompt; the action runs and is still written to the override audit log as "auto-approved (admin)".
- ON and not an Admin: the Manager Authorisation PIN modal appears; the PIN is checked on the server against manager and admin accounts only, and rejected attempts are recorded.

## Technical notes

- `src/lib/pos-db.ts`: delete `seedCloud` and its call site; `src/lib/pos-store.tsx`: drop the empty-stores backfill and start from an empty state; `src/lib/pos-seed.ts` keeps the sample arrays only for the explicit import button.
- New SQL file `supabase/sql/22_roles_pin_gates_and_sessions.sql`: `staff_roles` table (slug, name, base level, default permissions JSONB, is_core) with grants + RLS (admin write, staff read); `role_slug` on `app_users`/`cashiers`; `set_app_user_pin` / `verify_manager_pin`; `terminal_session_revoke(token_id)`; `require_pin_*` keys on the scoped rules rows. Added to `99_run_all.sql`; nothing is dropped.
- `src/lib/session-expiry.ts` plus a wrapped `fetch` in `src/integrations/supabase/external-client.ts` and a client middleware in `src/start.ts` raise one `session-expired` event; `src/lib/pos-auth.tsx` listens and signs out. 5xx and timeouts route to the connectivity alert.
- `src/lib/manager-gate.tsx` (`ManagerGateProvider` / `useManagerGate`) resolves toggle -> admin bypass -> `ManagerOverrideDialog`, replacing the ad-hoc checks in the register.
- `src/lib/staff-roles.ts` role registry loaded from the database with the current presets as the core seed; `src/routes/staff.tsx` gains the role panel and PIN field; new `src/routes/settings.sessions.tsx` for the kill switch; `src/routes/settings.rules.tsx` renders the toggle list.
- The new SQL file must be run once against your database for the roles, PIN and revoke routines.