# One permissions screen, and toggles that actually take effect

## What I found

There are three layers deciding what a person sees, and they fight each other.

1. **Permission matrix** — 49 switches per person (Staff Management / Accounts), stored on the account.
2. **Screen visibility** — `/settings/visibility`, a second grid of switches per role (Cashier / Supervisor / Warehouse) covering 12 register elements plus 30 settings pages.
3. **A hidden third layer: role "tags"** — hard-coded in the code, invisible in any screen, and it silently overrules the other two.

### Why your cashier still cannot see stock and transfers

The sidebar filter runs, in order: the person's permission, then the visibility map, then the tag. The Inventory / Transfers / Stock entries derive the tag `inventory-access`, and that tag is coded as "warehouse, supervisor, admin only". So a cashier with **can_view_inventory** switched ON is still removed from the sidebar — the toggle you flipped can never win. Same story for reports (`reports-access` excludes cashier).

That layer is also inconsistent: it hides the sidebar link but the route guard does not apply it, so the page still opens if typed as a URL.

### Why everything asks for "Access POS settings"

The route guard maps the whole `/settings` tree to a single permission, `can_access_pos_settings`, with only Terminals / Sessions / Sync overriding it. On top of that, nearly every settings page in the visibility catalogue is tagged `admin-only`. So there is no way to give a cashier one settings page (say the printer) — it is all or nothing, and the tag blocks it anyway.

### Dead switches

Five visibility switches are not read by any screen, so flipping them does nothing:
`register.paymentExecution`, `sales.receiptHistory`, `sales.bookings`, `inventory.costColumns`, `inventory.stockValue`. Only 7 of the 12 register elements are wired.

## My recommendation on your design question

Yes — combine them. Keep **one** grid, but keep the two *meanings* as two columns rather than two screens, because they are genuinely different questions:

- **Allowed** — may this person do it (per person, tuned from their role preset).
- **Visible** — does it appear on screen for this role.

So: one page, per role, listing every feature once, with the permission switch and the "show on screen" switch side by side, plus a search box and a per-feature line saying exactly which screen/button it controls. The separate `/settings/visibility` page becomes a tab of it.

## The plan

### 1. Delete the hidden tag layer as a gate
Tags stop deciding visibility. They stay only as grouping labels in the UI. After this, the toggle you set is the only thing that decides — a cashier with "View inventory" ON sees Inventory, immediately.

### 2. Make the settings tree per-page
Replace the single `/settings → can_access_pos_settings` rule with a per-page rule: `can_access_pos_settings` is the door to the settings hub, and each settings page is then allowed or hidden per role through the visibility grid. Re-tag the pages so operational ones (printer, display, catalogue, SKU, booking services, shift alerts) can be granted to a cashier or supervisor, while dangerous ones (staff, terminals, sync, security, inheritance, identity, numbering, tax) stay owner-only and cannot be handed out by accident.

### 3. Sidebar and route guard always agree
The route guard runs exactly the same check as the sidebar, so a hidden screen also cannot be reached by typing its URL, and a granted screen never 403s after being shown.

### 4. Wire the five dead switches
Hook `register.paymentExecution`, bill history, bookings, cost/margin columns and stock-value totals into the screens they name, so every switch on the page does something.

### 5. One "Roles & access" screen
A single page with:
- role selector (Cashier / Supervisor / Warehouse / any custom role) or a single person,
- grouped, searchable list of every feature,
- **Allowed** and **Visible on screen** switches per row,
- a one-line plain description of what each row controls,
- "Reset to role default" and a badge when a person deviates from their role,
- administrators always see everything (no lock-out possible).

`/settings/visibility` and the permission matrix in Staff Management both point at this screen so there is only one place to change access.

### 6. Guard tests
Extend the existing security tests so the build fails if a route has no access entry, a permission key has no screen mapping, or a cashier/warehouse default gains a money/settings/staff switch.

## Technical notes

- `src/lib/permissions.ts`: keep `ROLE_PRESETS`, `PERMISSION_TAGS` demoted to display grouping; remove `roleHasTag` from gating paths.
- `src/components/pos/AppShell.tsx`: `canSee()` drops the tag test; `requiredPermission()` gains explicit entries for each settings page; guard reuses `canSee` logic for the current path.
- `src/lib/ui-visibility.ts`: element catalogue gains the screens for the 5 unwired keys and per-page settings entries; `isRouteVisibleFor` no longer short-circuits on tag.
- New `src/routes/settings.access.tsx` (Roles & access) reusing the existing matrix components; `settings.visibility.tsx` redirects to it.
- Consumers to wire: `src/routes/index.tsx` (payment execution deck), `receipts`/`sales` history, `bookings`, inventory tables (cost/margin, stock value).
- Tests in `src/lib/__tests__/permissions.security.test.ts` and `route-guards.security.test.ts`.
- No database or schema change: permissions stay JSONB on the account, the visibility map stays in POS settings.
