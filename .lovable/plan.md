# Staff Accounts, Terminal Login, Sync & Security Hardening

## What changes for you

- Creating staff stops failing with "missing required field": branch, role and PIN length are always sent.
- One form field: "Username or Email Address". A plain username becomes a hidden internal address so the person can sign in immediately at the till with their PIN. A real email address stays as-is, gets its own password (not a PIN), and receives a confirmation email before first sign-in.
- Terminal login becomes a two-step screen: pick your name from a grid of active staff for this branch, then enter your PIN on a large touch keypad. A footer link switches to email + password for administrators.
- Deactivated accounts are blocked with a clear "Account deactivated" message, and are signed out the moment they try a privileged action.
- The screen locks itself after a configurable idle period (set in seconds, in Settings) and there is a "Lock screen" button in the POS header. Locking never closes the shift.
- A cashier cannot have two open shifts on two registers; they are prompted to resume or close the other one.
- After 5 wrong PINs the keypad locks for 5 minutes on that terminal.
- Queued offline work that retries on a weak connection updates the existing record instead of creating duplicate sales or shifts.

## Step 1 - Provisioning and sign-in

- `src/lib/staff-admin.server.ts`: split provisioning into two paths.
  - No "@" in the identifier: `${input.toLowerCase().trim()}@pos-internal.local`, `email_confirm: true`, password = PIN, PIN hash + `pin_length` stored.
  - Contains "@": keep the real address, `email_confirm: false`, password = the admin-supplied password, no PIN row.
  - Always send branch (explicit, may be null), role slug and `pin_length` (validated 4-6) to `staff_account_upsert`; reject creation when the role slug is unknown.
- `src/lib/staff-admin.ts` / `staff-admin.functions.ts`: widen the payload with `mode: "username" | "email"` and optional `password`, validating before the server call so errors read clearly.
- `src/lib/pos-auth.tsx`: one sign-in handler taking `identifier` + secret. Identifier without "@" maps to the internal domain; otherwise it is used raw. Always goes through `supabase.auth.signInWithPassword` for a real JWT. If the profile row is inactive, sign out immediately and return "Account deactivated".

## Step 2 - Terminal PIN login

`src/components/auth/CashierPinLogin.tsx` rewritten as two states:

```text
STATE 1  [ Jane Doe ]  [ Ali Bin ]  [ Sara T ]   <- active staff, branch-bound
         role badge under each name
STATE 2  Jane Doe (Cashier)   [Choose different user]
         * * * *            (dots sized to the person's PIN length)
         1 2 3 / 4 5 6 / 7 8 9 / Clear 0 Backspace
```

- Physical numpad and touch both supported; auto-submit on the last expected digit (4-digit PINs submit instantly, 5-6 digit PINs submit on Enter or final digit).
- Inline errors for wrong PIN, deactivated account and lockout countdown.
- Footer button toggles the administrator email + password form.

## Step 3 - Admin tabs

`src/routes/staff.tsx` reduced to two tabs and nothing else.

- Staff tab (`StaffManager.tsx`): "Username or Email Address" field with helper text, PIN input (4-6 digits) shown only in username mode, password input shown only in email mode, role dropdown fed live from the roles table, branch dropdown. Roster table with display name, username/email, role, status badge, instant active toggle, "PIN set" indicator and a Change PIN modal. Raw PINs never displayed.
- Roles tab (`RoleManager.tsx`): permission matrix switches for open shift, discounts, void items, refunds, manage inventory, view reports; custom role modal; delete blocked for core roles and for roles still assigned to staff.
- Legacy cashier modals/forms and any table call bypassing Supabase Auth removed from the route.

## Step 4 - Offline queue idempotency

- `src/lib/sync-outbox.ts`: each queued entry already has a unique local id; carry it as `temp_id` on the payload for operational tables.
- `src/lib/sync-engine.ts`: insert/upsert for sales, shifts, drawer events and stock movements resolves on the record id / `temp_id` with merge-duplicates, so a retry updates instead of duplicating. Per-terminal replay order untouched, no new storage keys.

## Step 5 - Security hardening

- Auto-lock: idle timer with the interval read from settings **in seconds** (branch-level setting, default 180s, 0 = off), applied to the session types the setting allows. Locking swaps the UI to the PIN screen; the shift stays open.
- "Lock screen" button in the POS header bar.
- Concurrent shift guard: before opening a shift, check for another open shift for the same staff on another terminal; offer Resume or Close instead of a silent second shift.
- Active revocation guard: re-check active status before voids, drawer opens and shift actions; when false, clear the local session and return to the login screen.
- Brute force: 5 failed PIN attempts locks PIN entry on that terminal for 5 minutes, tracked locally so it holds offline too.

## Technical notes

- A small migration is added only if the idempotency key needs a unique constraint, plus the new idle-timeout-in-seconds setting.
- All new failure paths route through `notifyError` for human-readable messages.
- Version bump on completion.