# Unified staff accounts, dynamic roles and a PIN keypad login

Everyone who signs in — admin, manager, supervisor, cashier, or any custom role you invent — ends up with one real account and one verified session. Roles become fully editable, cashiers get a touch keypad, and the till keeps working offline.

Confirmed decisions: build on the existing staff and role tables (no parallel set), migrate current cashiers silently, and retire the old PIN relay sign-in once every cashier has a real account.

## 1. One account type for everyone

- Cashiers today are plain rows with a hashed PIN and no real account. Each one gets a real account created behind the scenes using a hidden internal address (`username@pos-internal.local`), pre-confirmed so no email is ever sent.
- Existing cashiers are migrated silently using their current PIN, by a one-time backfill plus a catch-up pass when an admin opens Staff Management. Nobody has to re-issue anything.
- Once migrated, the old PIN relay sign-in route and its standalone endpoint and server session token are removed. The `cashiers` table is kept read-only for one release as a safety net, then dropped.
- The PIN doubles as the account password. New PINs are a fixed 4 digits to match the keypad; existing longer PINs keep working until changed.

## 2. Roles you can create and edit

- The existing role registry gains a full editor. Built-in roles (Cashier, Warehouse Supervisor, Supervisor, Admin) stay protected from deletion; everything else is yours.
- **Role & permissions matrix**: every role as a row, every permission as a column of toggles — open shift, apply discounts, void items, refunds, manage inventory, view reports, and the rest of the existing list.
- Create a custom role from a modal (name, starting level, its own permission ticks). Deleting a role is blocked while any staff member still holds it.
- Editing a role's permissions updates everyone on that role, except people who were individually tuned — they keep showing "Custom permissions" as they do today.

## 3. Staff management dashboard

- Creation form: display name, username, 4-digit PIN, role dropdown (fed live from the roles table), branch, and an "Activate immediately" switch.
- Roster table: name, username, role, branch, an Active/Deactivated badge, and a one-tap toggle. Deactivating blocks sign-in immediately, including on a device already open.
- PINs are never shown back; editing shows "PIN set" with a "Change PIN" action.

## 4. Terminal login with a keypad

- **Step one — pick a person.** A grid of active staff for this terminal's branch, each card showing name and role badge. No keypad on screen.
- **Step two — enter the PIN.** The selected person stays pinned at the top with a "Choose different user" button, four PIN dots, and a 3x4 keypad (0-9, Clear, backspace). Sign-in fires automatically on the fourth digit.
- A wrong PIN clears the dots, shows the reason and leaves the keypad up. A deactivated account says so plainly instead of "wrong PIN".
- A footer link switches to the existing email + password form for administrators.

## 5. Offline behaviour

- Every successful online sign-in caches that person's PIN hash, role and resolved permissions on the terminal, so the same keypad works with no connection.
- Shift open/close and sales continue to queue offline and flush in order when the connection returns, with no duplicates on a flaky link — extending the queue that already exists rather than adding a second one.
- A cached account that has since been deactivated is refused as soon as the terminal reaches the server again.

## Technical notes

- New SQL file `supabase/sql/23_unified_staff_accounts.sql`: role delete guard when assigned; `app_users` index on `is_active`; `staff_account_provision` service-role routine creating the auth user with `email_confirm: true`, upserting `app_users` and copying the cashier's `pin_hash`; `staff_account_set_active` updating both `app_users.is_active` and user metadata. Registered in `99_run_all.sql`; nothing existing is dropped here.
- `src/lib/staff-admin.ts` (new): `createStaffMember`, `toggleStaffStatus`, `migrateLegacyCashiers` — all through server functions using the service-role client, never from the browser.
- `src/lib/role-admin.ts` (new): wrapper over the existing `staff-roles.ts` helpers adding `updateRolePermissions` and the assigned-staff delete guard.
- `src/lib/pos-auth.tsx`: `cashierLogin` becomes `loginPosUser(username, pin)` — `signInWithPassword` against the synthetic address, `is_active` check, role permission load, caching via the existing `offline-credentials` module. The relay/`cashierToken` branch plus `src/routes/api/public/cashier-login.ts`, `src/routes/api/cashier-login.ts`, `src/lib/cashier-login.server.ts` and `src/lib/pos-session.server.ts` are removed; `pos-auth-route.ts` and `session-guard.server.ts` collapse to the single JWT path.
- `src/components/auth/CashierPinLogin.tsx` (new, existing shadcn + design tokens) replaces the PIN half of `TerminalLogin.tsx`; `RoleManager.tsx` and `StaffManager.tsx` under `src/components/admin/` render inside the existing `src/routes/staff.tsx` shell.
- `src/lib/sync-engine.ts` keeps its outbox; shift actions gain a `temp_id` idempotency key and an `online` listener flush.
- Tests updated: `permissions.security.test.ts`, `route-guards.security.test.ts`, `own-database.security.test.ts` lose cashier-relay assertions and gain a check that no browser path holds a service key.
- The new SQL file must be run once against your database before the app switches over.
