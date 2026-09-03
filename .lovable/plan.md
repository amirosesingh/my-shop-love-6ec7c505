# Sidebar regrouping + Windows-style Settings

Two separate pieces of work: the main sidebar only gets its items regrouped and reordered, and the Settings area gets a new responsive presentation layer on top of the existing pages.

## Part 1 — Main sidebar regrouping

Only the group definitions change. Layout, width, icons, colours, search, collapse behaviour, badges and permission flags stay exactly as they are.

New groups and order:

1. **Register & Selling** — Register, Sales, Holds, Shifts, Receipts (Bill Search), Customer Display, Promotions, Coupon Campaigns, Point Rules
2. **Bookings & Services** — Bookings / Pay Later, General Booking, Racket Service
3. **Inventory** — Inventory Catalog, Inventory Hub, Stock Operations, Purchasing, Goods Receiving, Stock Requests, Stock Transfers, Suppliers, Verification Log, Pending Approvals
4. **People** — Customers, Member Directory, Staff Management, Admin
5. **Company** — Locations / Warehouses, All Shops Panel, Live Dashboard, Live Business Board, Audit Logs
6. **Reports** — the existing report pages only (Sales, Items, Stock, Payments, Voids, History, Activity, Business, Catalog, Analytics, Notifications, Coupons)

Notes on decisions already taken:

- Claim, C-Token and Join stay out of the sidebar — they are public customer links built per campaign/token.
- Every existing sidebar item is kept; items not named in the brief are placed in the nearest new group (shown above).
- Register stays pinned at the top of the sidebar as it is today; Dashboard and Business Board move into Company so the pinned area is just Register.
- No report pages are created or duplicated.

## Part 2 — Settings redesign

Keeps every existing settings route, component, permission check, icon and label. Only presentation and navigation change.

### Structure

- One shared navigation config drives desktop and mobile, built from the existing settings catalogue so nothing can go missing.
- Categories are the existing ones, renamed/regrouped to match the requested vocabulary where an equivalent already exists: System & Diagnostics, Terminal & Devices, Connectivity & Data, Printing, Payments & Messaging, POS & Business, Bookings, Access & Security, Personalisation (display), Backup & Recovery, About/Updates. No category is created unless real pages fall into it.
- Emergency Codes stays hidden exactly as today; recovery/emergency logic is untouched.

### Desktop / Electron

Two-panel layout under `/settings`:

- Left rail: search box, category list with existing icons and active state, filtered by the existing role/visibility rules.
- Right pane: the selected category's setting rows, or the selected settings page rendered full-height. Single vertical scroll in the right pane, no nested scrollbars.
- Setting rows show icon, name, short description and a chevron; toggles/selects are not introduced where a page exists today.

### Mobile / Android

Same routes, different presentation at small widths:

- Settings home: full-screen list with title, description, sticky compact search, and category rows.
- Tapping a category pushes a full-screen category page with a back button and `‹ Settings / Category` context.
- Tapping a setting opens its existing route full screen with the same back affordance.
- Back button, browser back and Android back all use normal router history, so scroll position and history depth behave normally.

### Behaviour changes

- The half-window sheet is removed; cards and rows navigate to the real `/settings/*` route. The `card=` search param keeps working by redirecting to that route so old links don't break.
- Quick Access becomes a compact horizontal strip with the scrollbar hidden but still scrollable by touch, wheel and keyboard.
- Search matches category, page name, blurb and keywords, and each result shows `Setting → Category` before navigating to the real route.
- Long pages keep the existing collapsible sections; expansion stays in place.

### Not changing

Business logic, database, sync, printing, payments, terminal activation, emergency access, permissions, and every screen outside Settings and the sidebar grouping.

## Technical notes

- `src/platforms/web/components/pos/nav-config.ts` — regroup `navGroups`/`standaloneNavItems` only.
- `src/lib/settings-catalog.tsx` — recategorise cards, keep every entry; category list updated.
- `src/lib/settings-groups.ts` — kept as the ordering/coverage source; Logic-health duplicate and coverage checks continue to pass.
- New `SettingsLayout` (left rail + content) used by `settings.index.tsx` and by `SettingsFrame`, so every existing settings route renders inside the same shell.
- `SettingsSheet` and the `embed` context are retired once no route depends on them.
- Verify with typecheck, lint, tests and a build; fix only regressions introduced here.
