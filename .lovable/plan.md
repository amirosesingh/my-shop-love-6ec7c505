# POS navigation and Settings restructure

A presentation-only reorganisation. The Register screen, the selling flow, the database, sync, permissions and every existing page stay exactly as they are; what changes is how they are grouped, found and reached.

## What exists today (checked)

- The sidebar (`SidebarNav.tsx`) already collapses and already reads one navigation list (`nav-config.ts`) with six groups: Register & Selling, Bookings & Services, Inventory, People, Company, Reports. Groups link to landing pages; a collapsed sidebar opens a hover pop-out per group, and there is a menu search box.
- Section landing pages already exist (`SectionHub.tsx` renders any group as cards) at `/sales`, `/bookings`, `/inventory-hub`, `/customers`, `/admin`, `/reports`.
- Settings already has one catalog (`settings-catalog.tsx`, 41 pages in 8 categories), one navigation model (`use-settings-nav.ts`), a search box, a fixed "Quick access" strip of six hard-coded items, and per-page frames with save bars.
- Pins do not exist. `standaloneNavItems` is an empty placeholder.

## 1. Sidebar: top level only

The sidebar shows a pinned block, then seven items and nothing else:

```text
PINNED
  (whatever the user pinned)
──────────────
Register
Bookings
Inventory
People
Company
Reports
Settings
```

- Remove the hover pop-out submenus from the collapsed sidebar and the per-group item lists — no nested tree, no accordions, no per-group collapse.
- The one collapse control stays, and keeps using the existing `pos.nav.collapsed` preference.
- Collapsed: icons only, each with an accessible label and a tooltip; pinned items and all seven sections stay reachable.
- Selecting a section opens its existing landing page in the main area, where its options are already listed as cards. Settings opens the Settings home.

Nothing is hidden: every entry that used to be in a sidebar sub-list is already a card on its section page. Any that is not will be added to `nav-config.ts` so the count matches before and after.

## 2. Settings information architecture

The existing catalog stays the single source; only category assignment, labels and the landing page change. Ten categories:

| Category | Pages moved into it |
| --- | --- |
| Business | Business identity, Region & time, Tax & pricing, Bill numbering, Item numbering, Rules |
| Products & inventory | Catalog, Units, Stock numbering, SKU |
| Payments | Payment methods, Payment accounts, Payment behaviour, Vouchers, Customer QR |
| Receipts & printing | Printer, Receipt elements, Typography, Extra lines, QR, Receipt designer |
| Bookings & services | Booking rules, Services, Service charges, Booking slip |
| Terminal | This terminal, Terminal identity, Display, Hardware & drawer, Software updates, Sessions, Mobile terminals |
| Data & connectivity | Company connection, Database, Sync, Sync behaviour, Backup, Data comparison, Inheritance |
| Staff & security | Staff, Roles, Permissions, Authorization rules, Visibility, Emergency access |
| System health | System status, Database health, Logic health, Diagnostics, Security alerts, Notifications, Shift alerts, Branch telemetry |
| Messaging | WhatsApp and message delivery |

Settings home becomes: title, one-line purpose, search, a pinned/quick-access row (now user-controlled, see below), then the categories under four headings — Business, Sales & customer experience, Terminal, Security & administration.

Search keeps the existing matcher, extended to also match the category name and a small alias list, and each result shows its breadcrumb ("Settings → Receipts & printing"). Results open the existing page; no page is duplicated.

## 3. Scope labels and dangerous actions

Each settings page header gains a small scope chip — **Company**, **Branch — <name>**, or **This terminal** — driven by a scope field added to each catalog entry (a label only; the existing scope resolution logic is untouched).

Actions that change the connection, replace database configuration, repair or restore, reset or revoke the terminal, clear sync data or change security/emergency configuration get a consistent "Advanced action" confirmation before running. The existing authorisation checks stay in front of them; the confirmation is added, nothing is removed.

Data & connectivity gets an operational summary at the top — company server, local database, synchronization, last successful sync, with Test connection / Sync now / View sync status buttons that call the existing functions — and the technical configuration moves below an "Advanced" heading.

## 4. Pin to top

- Anyone can pin any navigation item or settings page they can already open. Pinning never grants access: pinned entries are filtered through the same permission, visibility, platform and branch rules as the original menu, and the target page keeps its own guards.
- An administrator can additionally pin **for everyone** (a company pin), and unpin company pins. A cashier can only add and remove their own.
- A pin stores only an identifier (route + optional section/tab, or the settings card id). No page, component, setting definition or route is duplicated, and a pinned page is not loaded until it is opened.
- Pins live centrally so they follow the person across terminals, with a local cache so the pinned list still renders offline. Adding a pin while offline queues through the existing outbox.
- Pin and unpin controls appear on section cards and settings rows (a small pin button), with the pinned state announced to screen readers.

## 5. Mobile and Android

The existing responsive behaviour is reused: on a phone the sidebar is the existing drawer, Settings shows the category list, tapping a category shows its pages, tapping a page opens it full-screen with a back link. The first-run connection flow on an unconfigured device is not touched.

## 6. Testing

Navigation (expanded, collapsed, all seven sections, every existing sub-page, direct URL, back/forward, refresh, phone), pins (add, remove, deep settings page, survives restart, opens the original page, a cashier cannot reach a page they lack rights to through a pin), every settings category opens and saves as before, and a regression pass over cashier login, Register, cart, checkout, payment, offline sale, sync, shifts, printing, emergency access and Electron start-up. The final report gives real PASS / FAIL / NOT TESTED per item, with anything needing real hardware marked as such.

## Technical notes

- Files: `src/platforms/web/components/pos/nav-config.ts`, `SidebarNav.tsx`, `AppShell.tsx`, `SectionHub.tsx`; `src/lib/settings-catalog.tsx`; `src/routes/settings.index.tsx`; `src/platforms/web/components/pos/settings/SettingsShell.tsx`, `SettingsFrame.tsx`, `use-settings-nav.ts`; a new `src/lib/nav-pins.ts` plus a small pin button component; new tests under `src/lib/__tests__/`.
- One migration creates `public.nav_pins` (owner user id, nullable for company pins, item kind, item key, sort order, timestamps) with grants, RLS allowing a person to read and write their own rows and read company rows, and administrator-only writes for company rows. No existing table, function or policy is altered.
- The Register route and its components are not edited. Route paths are unchanged; only the place a route is presented from changes.
- Version bump with `node scripts/bump-version.cjs` once the changes land.
