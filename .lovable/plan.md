# Give supervisors all-store access

Today only admins can see every branch. A supervisor account (role `manager` in the staff table) that signs in without the `supervisor` metadata tag gets treated like a cashier: pinned to one store, no store switcher, and management screens redirect back to the register.

## What changes

- Supervisors get the branch switcher in the sidebar (desktop and mobile drawer), same as admins, so they can view and work across every store.
- Supervisors are no longer force-pinned to a single assigned branch.
- Supervisors keep access to the management screens (Settings, Staff, Locations, Promotions, Audit) instead of being bounced to the register.
- Cashiers are unaffected: still locked to their assigned branch, still hidden from management screens.
- Admin remains the only role that can be created/edited freely; supervisor permissions still come from their permission matrix, not blanket full access.

## Technical notes

- `src/lib/pos-auth.tsx`: recognise supervisors from all sources — `metaRole === "supervisor"`, `roles.includes("manager")`, and `appUser.role === "manager"` — and expose a single `isSupervisor` (true for admin too). Supervisors resolve with `storeId: null` (all stores) while keeping their granular permissions; only true admins keep the full-permission shortcut.
- `src/components/pos/AppShell.tsx`: replace the `isAdmin` checks driving the store picker, the store-pinning effect, the `ADMIN_PATHS` redirect and `canSee` (adminOnly nav items) with `isSupervisor`.
- `src/routes/staff.tsx`, `stores.tsx`, `promotions.tsx`, `audit.tsx`, `settings.tsx`, `shifts.tsx`: swap the `isAdmin` gate for `isSupervisor` so supervisors reach the same management views. Staff management stays admin-only for editing admin accounts.
- No database or schema changes needed.
