# Auth, roles, permissions and terminal PIN authorisation

Four connected changes: sessions that end themselves when the server says the token is dead, admin-managed custom roles, a per-branch "needs a manager PIN" list, and a PIN prompt that admins skip.

## 1. Session ends when the token is rejected

- Every call to the central database and every server function passes through one shared response check.
- A 401 or 403 answer (token missing, revoked, or no longer matching the database) clears the saved session and local sign-in data and returns the terminal to the login screen with a short "Your session ended, please sign in again" note.
- Timeouts, offline moments and 5xx server errors never sign anyone out. They raise the existing connectivity warning banner and the till keeps working.
- Terminal activation stays untouched — a revoked *terminal* still uses today's kill-switch.

## 2. Roles and staff management

- Built-in roles stay: Cashier, Warehouse Supervisor, Admin (plus the existing Supervisor). These cannot be deleted or renamed.
- New **Role Management** panel inside Staff Management: create a custom role with a name, a base level (Cashier / Warehouse / Supervisor) and its own default permission checklist; delete custom roles only. Deleting is blocked while staff are still assigned to that role.
- The permission checklist covers all existing capability groups (drawer & shift, sales approvals, sales, inventory, members, reports, system).
- Smart presets: choosing a role ticks that role's default boxes; the moment any single box is changed by hand the assignment label switches to "Custom permissions", and a "Reset to role defaults" button puts it back.
- Staff create and edit forms gain a **Manager PIN** field (4-6 digits) for every account. It is sent to the server and stored hashed — never held in the browser, never shown back. Editing shows "PIN set" with a "Change PIN" action.

## 3. Feature security settings

- New **Manager PIN requirements** section in the admin security settings, listing sensitive actions: refunds, voids / cart void, line delete, quantity reduce, manual discounts, price override, no-sale drawer open, stock adjustment, shift close, tender edit.
- Each has a Require Manager PIN switch saved in the database, per branch, following the existing Global to Cluster to Branch inheritance used by the current rules page.
- The legacy toggles already on the rules page (refund PIN, drawer PIN) fold into this list so there is one place to look.

## 4. Authorisation flow

- Toggle OFF: the action runs straight away if the user's own permissions allow it.
- Toggle ON and the user is an Admin: no prompt, the action runs and is still written to the override audit log as "auto-approved (admin)".
- Toggle ON and the user is not an Admin: the Manager Authorisation PIN modal appears. The PIN is checked on the server against manager and admin accounts only; a wrong PIN is rejected with an attempt recorded.

## Technical notes

- Database: `staff_roles` table (slug, name, base level, default permissions JSONB, is_core flag) with grants + RLS, admin-write / staff-read; `pin_hash` already exists on `app_users` and `cashiers` so the Manager PIN reuses it via the existing upsert routines. Feature toggles are added as boolean keys on the existing `pos_rules` scoped rows, so branch inheritance comes for free.
- `src/integrations/supabase/external-client.ts`: wrap the shared `fetch` to detect 401/403 and dispatch a single `session-expired` event; a listener in `src/lib/pos-auth.tsx` performs sign-out + redirect. Server-function calls get the same treatment through a client middleware in `src/start.ts`. 5xx and timeouts route to the existing connectivity alert instead.
- `src/lib/permissions.ts`: replace the hardcoded `STAFF_ROLES` array with a role registry loaded from the database, keeping the current presets as the core-role seed and `toDbRole` mapping from the role's base level.
- `src/lib/pos-rules.ts` / `pos-rules.server.ts`: add the `require_pin_*` keys, and a `requireManagerAuth(action)` helper used by the register that resolves toggle to admin bypass to `ManagerOverrideDialog`, replacing the ad-hoc checks now scattered across the till.
- `src/routes/staff.tsx`: Role Management tab, PIN field, preset/custom classification. `src/routes/settings.rules.tsx` (or a new security section) renders the new toggle list.