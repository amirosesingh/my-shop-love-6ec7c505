# Supervisors: all-stores or single-store assignment

Admins always see every branch. Supervisors should be assignable either way — "All stores" (they oversee every branch) or one specific branch — chosen per supervisor in Staff Management.

## What changes

- Creating a supervisor: the "Assigned store" dropdown gains an **All stores** choice alongside the individual branches. Editing an existing supervisor already offers it; both places will behave consistently.
- A supervisor set to **All stores** gets the branch switcher in the sidebar (desktop and mobile) and can move between branches like an admin.
- A supervisor assigned to **one branch** is pinned to that branch: no switcher, data filtered to their store — same as a cashier's isolation, but keeping their supervisor permissions.
- Admins are unchanged (always all stores). Cashiers are unchanged (always single store).

## Technical notes

- `src/lib/pos-auth.tsx`: today any account with a supervisor role is collapsed into `role: "admin"` with `storeId: null`. Change it so supervisors keep their own `store_id` from `app_users`, and expose a derived `canSwitchStores` = admin OR (supervisor AND `storeId == null`). Supervisor permissions continue to come from their permission matrix; only true admins keep the blanket full-permission shortcut.
- `src/components/pos/AppShell.tsx`: drive the store picker and the "pin to assigned store" effect off `canSwitchStores` instead of `isAdmin`. Screen access (`ADMIN_PATHS`, `adminOnly` nav items) stays on the existing supervisor/admin check, unaffected by store scope.
- `src/routes/staff.tsx`: add an `All stores` option (value `none` → stored as `null`) to the create-account store dropdown; show it only when the selected role is supervisor or admin, not cashier.
- No database or schema changes needed — `app_users.store_id` is already nullable.
