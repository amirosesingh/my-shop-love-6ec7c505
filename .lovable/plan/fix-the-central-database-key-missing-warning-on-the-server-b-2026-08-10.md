# Unified staff accounts, dynamic roles and a PIN keypad login

Everyone who signs in — admin, manager, supervisor, cashier, or any custom role you invent — ends up with one real account and one verified session. Roles become fully editable, cashiers get a touch keypad, and the till keeps working offline.

## 1. One account type for everyone

- Cashiers today are plain rows with a hashed PIN and no real account. Each one gets a real account created behind the scenes using a hidden internal address (`username@pos-internal.local`), pre-confirmed so no email is ever sent.
- Existing cashiers are migrated silently in the background the first time an admin opens Staff Management (and by a one-time backfill), using their current PIN. Nobody has to re-issue anything and nothing changes for the cashier.
- Once a cashier has a real account, the old PIN relay sign-in route is deleted along with the standalone cashier PIN endpoint and its server session token. The `cashiers` table is kept read-only for one release as a migration safety net, then dropped.
- The PIN doubles as the account password. PINs move from 4-6 digits to a fixed 4 digits on the keypad; existing longer PINs keep working until changed.

## 2. Roles you can create and edit

- The existing role registry gains a full editor. Built-in roles (Cashier, Warehouse Supervisor, Supervisor, Admin) stay locked from deletion; everything else is yours.
- **Role & permissions matrix**: every role as a row, every permission as a column of toggles — open shift, apply discounts, void items, refunds, manage inventory, view reports, and the rest of the existing list.
- Create a custom role from a modal (name + starting level + its own permission ticks). Deleting a role is blocked while any staff member still holds it.
- Changing a role's permissions updates everyone on that role, unless that person has been individually tuned, in which case they keep showing "Custom permissions" as they do now.

## 3. Staff management dashboard

- Creation form: display name, username, 4-digit PIN, role dropdown (fed live from the roles table), branch, and an "Activate immediately" switch.
- Roster table: name, username, role, branch, an Active/Deactivated badge, and a one-tap activate/deactivate toggle. Deactivating blocks sign-in immediately, even on a device that is already open.
- PINs are never displayed back; editing shows "PIN set" with a "Change PIN" action.

## 4. Terminal login with a keypad

- **Step one — pick a person.** A grid of active staff for this terminal's branch, each card showing name and role badge. No keypad on screen.
- **Step two — enter the PIN.** The selected person's card stays at the top with a "Choose different user" button, four PIN dots, and a 3x4 keypad (0-9, Clear, backspace). Sign-in fires automatically on the fourth digit.
- A wrong PIN clears the dots, shows the reason, and leaves the keypad up. A deactivated account says so plainly instead of "wrong PIN".
- A footer link switches to the existing email + password form for administrators.

## 5. Offline behaviour

- On every successful online sign-in the terminal caches that person's PIN hash, role and resolved permissions, so the same keypad works with no connection.
- Shift open/close and sales continue to queue when offline and flush automatically in order when the connection returns, with no duplicates on a flaky link — this extends the queue that already exists rather than adding a second one.
- A cached account that has since been deactivated is refused as soon as the terminal reaches the server again.

## Technical notes

- New SQL file `supabase/sql/23_unified_staff_accounts.sql`: `staff_roles` gains `permissions` editing RPCs already present plus a guard blocking delete when assigned; `app_users` gains `pin_hash` usage for all roles and an index on `is_active`; a `staff_account_provision` service-role routine that creates the auth user with `email_confirm: true`, upserts `app_users`, and copies the cashier's `pin_hash`; `staff_account_set_active` updating both `app_users.is_active` and user metadata. Added to `99_run_all.sql`; nothing existing is dropped in this file.
- `src/lib/staff-admin.ts` (new): `createStaffMember`, `toggleStaffStatus`, `migrateLegacyCashiers` — all via server functions using the service-role client, never from the browser.
- `src/lib/role-admin.ts` (new): thin wrapper over the existing `staff-roles.ts` helpers adding `updateRolePermissions` and the assigned-staff delete guard.
- `src/lib/pos-auth.tsx`: `cashierLogin` becomes `loginPosUser(username, pin)` doing `signInWithPassword` against the synthetic address, checking `is_active`, loading role permissions, and caching them through the existing `offline-credentials` module; the relay/`cashierToken` branch and `src/routes/api/public/cashier-login.ts`, `src/routes/api/cashier-login.ts`, `src/lib/cashier-login.server.ts`, `src/lib/pos-session.server.ts` are removed, with `pos-auth-route.ts` and `session-guard.server.ts` simplified to the single JWT path.
- `src/components/auth/CashierPinLogin.tsx` (new, shadcn + existing tokens) replaces the PIN half of `TerminalLogin.tsx`; `RoleManager.tsx` and `StaffManager.tsx` under `src/components/admin/` are rendered by the existing `src/routes/staff.tsx` shell.
- `src/lib/sync-engine.ts` keeps its outbox; shift actions get a `temp_id` idempotency key and an `online` listener flush.
- Existing tests updated: `permissions.security.test.ts`, `route-guards.security.test.ts`, `own-database.security.test.ts` lose their cashier-relay assertions and gain a check that no browser path holds a service key.
- The new SQL file must be run once against your database before the app switches over.
