# Finish the unified staff login: keypad UI, admin screens, offline queue keys

The backend half is already in place: staff accounts, dynamic roles with permission maps, provisioning and activation routines, and the unified sign-in path. What remains is the visible half plus one sync safeguard.

## 1. Terminal login with a staff grid and keypad

- Step one shows a grid of active staff for the terminal's bound branch — name, role badge, no keypad on screen.
- Step two pins the chosen person at the top with a "Choose different user" button, four PIN dots, and a 3x4 keypad (0-9, Clear, backspace). Sign-in fires automatically on the fourth digit; accounts still on a longer legacy PIN keep an explicit Enter.
- A wrong PIN clears the dots and keeps the keypad up; a deactivated account says so plainly instead of "wrong PIN".
- A footer link switches to the existing email + password form for administrators.
- Physical keyboard entry keeps working for devices with a numeric pad.

## 2. Role and permission manager

- A matrix on the staff page: every role as a row, every permission as a column of switches (open shift, discounts, void items, refunds, inventory, reports, and the rest of the existing list).
- Create a custom role from a modal: name, starting level, its own permission ticks.
- Built-in roles cannot be deleted; deleting any role is blocked while staff still hold it. Renaming and permission edits stay allowed where the role is not a system role.

## 3. Staff manager

- Creation form: display name, username, 4-digit PIN, role dropdown fed live from the roles table, branch selector, "Activate immediately" switch.
- Roster table: name, username, role, branch, Active/Deactivated badge, one-tap toggle. Deactivating blocks sign-in immediately.
- PINs are never shown back; editing shows "PIN set" with a "Change PIN" action.
- Both screens appear as tabs inside the existing staff page rather than new routes.

## 4. Offline queue safeguard

- Every queued shift and sale entry carries a stable local id used as an idempotency key, so a flaky connection cannot create a duplicate when a write is retried.
- Replay stays in the existing per-terminal chronological order; no new queue is introduced.

## Technical notes

- New `src/components/auth/CashierPinLogin.tsx` (existing shadcn components and design tokens) replaces the PIN half of `src/components/pos/TerminalLogin.tsx`; staff list comes from `listTerminalStaff()` in `src/lib/staff-admin.ts`, sign-in from the unified path in `src/lib/pos-auth.tsx`.
- New `src/components/admin/RoleManager.tsx` and `src/components/admin/StaffManager.tsx` sit on top of the existing `src/lib/role-admin.ts` and `src/lib/staff-admin.ts` helpers; mounted as tabs in `src/routes/staff.tsx` alongside the current directory.
- `src/lib/sync-outbox.ts` / `src/lib/sync-engine.ts`: reuse the existing entry `id` as the idempotency key on shift and sale rows; no schema change and no new storage key.
- No database migration is needed — `supabase/sql/23_unified_staff_accounts.sql` already covers this work.
