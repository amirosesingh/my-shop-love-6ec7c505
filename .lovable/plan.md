# Staff management overhaul + fixing the "till could not prove who it is" error

## Part A — Staff, roles and permissions

### 1. Add New Staff workflow
The Staff screen already has an "Add staff" dialog. Changes:
- Role dropdown in the create dialog lists **every** role (built-in Cashier, Warehouse Supervisor, Supervisor, Admin **and** custom roles created in Role Management), not just the four base levels.
- The default selection stays **Cashier** so nobody is created as an admin by accident.
- Picking a custom role creates the account at that role's base level and stores the role slug plus its permission preset on the new record.
- Optional **Manager PIN** (4-6 digits) field in the create form, saved with the record right after creation instead of only being settable later.

### 2. Staff table columns
Replace the current narrow master list with a proper table:

| Name | Email / Username | Assigned role | Access category | Manager PIN | Status / Actions |

- **Assigned role** shows the role name (built-in or custom), or "Custom permissions" when the toggles no longer match the preset.
- **Access category** is derived: Cashier and Warehouse -> "Operational staff"; Supervisor and Admin -> "Admin / Supervisor".
- **Manager PIN** shows Set / Not set.
- **Status / Actions** keeps the active toggle, select-to-edit and remove.
- Search and the existing detail panel stay; the table replaces the list column and rows stay clickable.

### 3. Role preset auto-assignment
- Selecting a role (create form or detail panel) ticks that role's whole permission checklist automatically.
- Manually flipping any single toggle immediately relabels the person as **Custom permissions**, shown in the table too.
- Admins can always re-pick a role to reset back to the preset, or change it later.

## Part B — "This till could not prove who it is"

Confirmed cause in the code: after a cashier signs in with username + PIN, the signed session token is saved in `sessionStorage` under `pos-terminal-token-v1`. The sync path sends it correctly as `cashierToken`, but `getPosCallerAuth()` — used by every other privileged server call — sends the same value as **`terminalToken`**. The server then tries to look it up as an activation token id in `terminal_tokens`, finds nothing, and throws that message. Cashiers therefore hit the error on saves even though they are signed in.

Fixes:
1. **Correct the credential shape** — `getPosCallerAuth()` returns `cashierToken` for a signed cashier session and `terminalToken` only for a real activation token id; every server function taking caller credentials accepts all three (`cashierToken`, `terminalToken`, `accessToken`).
2. **Survive restarts** — persist the cashier/terminal token where it outlives a relaunch (localStorage on web, the existing secure device store on Electron/Android) instead of `sessionStorage` only.
3. **Re-validate on boot and before mutations** — a lightweight session check on app launch/resume and before privileged saves; if the token is dead, sign out cleanly instead of failing mid-save.
4. **Global interceptor** — the existing `session-expiry` inspector already distinguishes dead tokens from connectivity problems; wire the privileged server-function path into it so a genuine 401/invalid-token clears stored session state and redirects to Sign In with an explanatory message, while timeouts and 5xx only raise the temporary connectivity warning.
5. **Database grants** — a new SQL file re-asserting `SECURITY DEFINER` + `GRANT EXECUTE ... TO authenticated` on the permission helpers (`is_staff`, `is_staff_now`, `is_supervisor_now`, `is_app_supervisor`, `has_role`, `has_perm`) so save actions never fail on a permission-denied check. Grants only, nothing dropped.

## Technical notes
- Files: `src/routes/staff.tsx` (table, create dialog, role presets), `src/lib/pos-caller-auth.ts` (token shape and durable storage), `src/lib/pos-auth.tsx` (store/clear tokens, boot re-validation), `src/lib/sync-relay.ts` (share the same reader), the server functions that take caller credentials, and a new `supabase/schema28.sql` for the grants.
- Manager PIN status needs `list_app_users` / `list_cashiers` to return a boolean `pin_set`; added in the same SQL file — no PIN hashes are ever returned.
- No table drops, no seeding, no data deletion.