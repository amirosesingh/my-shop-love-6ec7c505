# Edit a staff member's role

Add a role editor in Staff Management that can move anyone between Cashier, Warehouse, Supervisor and Admin — including across the two account kinds (PIN cashiers vs email/password staff).

## What the admin sees

On the selected person's **Profile details** tab, the Role field becomes editable for everyone (today cashiers show a read-only "Cashier (PIN login)" box).

- Picking a role that stays in the same family (Warehouse / Supervisor / Admin) just updates the dropdown; nothing else changes until "Save profile".
- Picking a role that crosses the boundary opens a **Change role** dialog:
  - Cashier → Warehouse/Supervisor/Admin: asks for **email + password** for the new login.
  - Anything → Cashier: asks for a **username + 6-digit PIN**.
  The dialog explains that their old login stops working and the previous record is removed once the new one is created.

## Permissions on a role change

Saving a role change shows a short confirm step with two choices:
- **Use the new role's defaults** — applies the preset for that role (cashier / warehouse / full).
- **Keep current toggles** — leaves the 19 switches exactly as they are.

Either way every switch stays editable afterwards in the Permission matrix tab.

## Conversion behaviour

- The new record is created first; only after it succeeds is the old one deleted, so a failure never loses the person.
- Profile fields carried over: full name, assigned store, active flag, and the chosen permission matrix.
- If creation fails (email already used, username taken), the dialog stays open with the error and nothing is changed.
- Sales, shifts and audit history stay attached to the old identifier — the plan does not rewrite historical rows.

## Technical notes

- `src/routes/staff.tsx`:
  - Replace the read-only cashier Role input with the same `Select`, now listing all four `STAFF_ROLES`.
  - New `ChangeRoleDialog` component holding credentials input + the "defaults vs keep" choice.
  - New `convertRole(row, targetRole, creds, permsMode)` handler:
    - to cashier: `createCashier` / `upsertCashier` (username, PIN, store, name) → `setCashierPermissions` → delete the `app_users` row via the existing removal path.
    - from cashier: `createStaffAccount({ email, password, role, storeId })` from `@/lib/pos-users`, then `set_app_user_profile` + `set_app_user_permissions`, then `deleteCashier`.
  - Refresh the list and reselect the new `user_id` after conversion.
- Same-family changes keep using the existing `set_app_user_profile` path in `saveProfile`, plus a `set_app_user_permissions` call when "use new defaults" is chosen.
- `rolePermissions(role)` from `src/lib/permissions.ts` supplies the presets; no schema change is needed since both tables already exist.
