# Phase 2 — Roles, permissions and tag-based settings

Permissions and screen visibility already exist but live in two disconnected places: the permission matrix (`src/lib/permissions.ts`, enforced by the route guard in `AppShell.tsx`) and the admin visibility map (`src/lib/ui-visibility.ts`, only covering 12 register/inventory elements). Settings pages have no per-role control at all, so anyone with "Access POS settings" sees every settings tab. Phase 2 joins the two behind one tag layer.

## 1. One source of truth for role presets

- Publish an explicit preset per built-in level (Owner/Admin, Supervisor, Cashier, Warehouse) in `src/lib/permissions.ts`, so the same map drives account creation, the Accounts screen preset picker and custom-role base levels. Today cashier and warehouse presets exist while supervisor/admin silently fall through to "everything".
- Add a supervisor preset (everything except staff management, terminals, sync/backup and settings) instead of granting full rights.
- Existing accounts keep their stored matrix; presets only apply to new accounts and to the "Reset to role default" action.

## 2. Tags over the existing matrix

- Each tag is a named bundle of permissions plus the roles it applies to: `cashier-visible`, `supervisor-only`, `reports-access`, `inventory-access`, `admin-only`.
- Every settings page, sidebar item and register card declares its tag alongside its existing permission flag. Nothing loses its permission gate — the tag decides visibility, the permission still decides what may be done.
- The settings hub, sidebar groups and section hubs filter cards by tag + the admin visibility map, so revoking a tag hides the tab, its buttons and its route in one move.

## 3. Settings pages become hideable

- Extend the visibility catalogue with a "Settings pages" group listing every settings route (Tax, Printer, Numbering, Rules, Sync, Terminals, Region, WhatsApp, Identity, Security alerts, …), so an administrator can hide a whole settings tab from cashiers or supervisors from `/settings/visibility`.
- The settings hub and the settings sidebar read the same map, and the route guard denies a hidden page instead of only removing the link.

## 4. Route guard and hiding always agree

- The route guard keeps the permission check and gains the tag/visibility check, so a hidden screen cannot be reached by typing its URL.
- Administrators are never hidden from anything, so a bad toggle cannot lock the owner out.
- The security test suite is extended so the build fails when a route exists with no guard entry, a permission key has no tag, or a cashier/warehouse preset gains a money, settings or staff-control toggle.

## Technical notes

- `src/lib/permissions.ts`: add `SUPERVISOR_PERMISSIONS`, a `ROLE_PRESETS` map, `PERMISSION_TAGS` (tag → permission keys → roles) and `tagsFor(subject)`.
- `src/lib/ui-visibility.ts`: add the settings-page elements and a `useVisibility().visibleRoute(path)` helper that combines the hidden map with tags.
- `src/components/pos/nav-config.ts`: add an optional `tag` to `NavItem`/`NavGroup`; `SidebarNav.tsx`, `settings.index.tsx` and the section hubs filter on it.
- `src/components/pos/AppShell.tsx`: `requiredPermission()` gains a companion visibility/tag check before rendering.
- Tests extended in `src/lib/__tests__/permissions.security.test.ts` and `route-guards.security.test.ts`.
- No database or schema change: permissions stay JSONB on the staff record and the visibility map stays in POS settings.
