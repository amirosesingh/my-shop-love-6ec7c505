# Settings as one card + bottom-sheet workspace, sidebar cleanup, SQL pruning

## 1. What is wrong today (audit findings)

- **Settings live in three overlapping places.** The sidebar "System & Settings" group links to `/settings`, `/settings/hardware` and `/settings/branch-telemetry`; the hub page lists those same pages again; and the "Diagnostics & maintenance" group re-lists `/settings/diagnostics`, `/settings/logic-health`, `/settings/data-sync`, `/settings/inheritance` and `/settings/security-alerts`, which are already tabs inside `/settings/system`. Same option, up to three doors.
- **Two different grouping systems disagree.** `src/lib/settings-groups.ts` groups settings as POS rules / Receipts / Booking rules / System, while `src/routes/settings.index.tsx` groups them as Terminal / Printing / Business / Access / Payments / Data / Diagnostics. A page can sit in a category on the hub and a different tab strip on the page itself.
- **Only 6 areas open in place.** `quick-cards.ts` has panels for branding, telemetry, hardware, payment methods, integrations and staff. Every other area (tax, printer, rules, catalog, booking rules, region, visibility, accounts, notifications…) navigates away to a full page and loses your place.
- **Staff sits in Settings and in the sidebar.** `StaffSecurityPanel` is a settings quick card while Staff Management also lives under Staff & Admin.
- **Panel bodies are trapped inside route files.** Most `settings.*.tsx` define their form inline, so nothing can mount them in a drawer without extraction.
- **Booking slip is deliberately shared by two groups; everything else duplicated is accidental** and the existing `settingsDuplicates()` check does not catch it because the two grouping lists are separate.
- **Dead/ambiguous SQL.** 30 numbered `supabase/schema*.sql` files, `schema_final.sql`, `online_setup_fix.sql`, `online_schema_fix_latest.sql`, `supabase/sql/online_schema_v2.sql` and 44 numbered scripts in `supabase/sql/` all predate the single canonical `supabase/schema.sql`. Four user-facing error strings and two docs still tell people to run `schema10/12/15/19/20.sql`.

## 2. Navigation: settings leave the sidebar

- Delete the whole "System & Settings" sidebar group. Point Rules moves back where it belongs (Customers & Marketing → Promotions), Terminal Hardware and Branch Telemetry become settings cards only.
- Keep **Staff & Admin** in the sidebar (Staff Management, Audit Logs & Activity) — the only admin area that stays outside settings.
- Settings become reachable from a single gear button in the app header (and from the mobile status sheet), which opens `/settings`. Sidebar search still finds a settings area and opens it directly as a sheet.
- Remove the staff quick card and `StaffSecurityPanel` from settings, so Staff exists in exactly one place.

## 3. Settings hub: cards that open in a bottom / half window

`/settings` becomes the single settings workspace:

- A **category strip** across the top: Terminal & display, Printing & receipts, Business & pricing, Payments & messaging, Data & sync, Diagnostics & health, Access & visibility. Selecting a category filters the cards below — no navigation.
- Each option is a **card**; clicking it opens a **bottom sheet at half height** over the current screen, with a drag/expand control to go full height and a link to open it as a full page. On phones the sheet is full-width bottom; on desktop it is a bottom docked panel so the card grid stays visible behind it.
- The open card is written to the URL (`/settings?cat=printing&card=printer`) so deep links, back button and the existing legacy `?section=` redirects keep working.
- Both grouping sources collapse into **one registry** (`src/lib/settings-catalog.ts`): id, label, blurb, icon, category, panel component, deep-link route, and role/cloud-only flags. The hub, the search, the sheet and `SettingsTabs` all read from it, so a page can never again appear in two categories by accident.
- Diagnostics cards (Database health, Logic health, Security alerts, Data sync, Inheritance, System status) become cards in the Diagnostics category that mount the existing panels; the legacy standalone routes stay as redirects.

## 4. Panel extraction

Every `settings.*.tsx` route keeps its `head()` and route definition but moves its body into `src/components/pos/settings/panels/<Name>Panel.tsx`. The route renders `<SettingsFrame><Panel/></SettingsFrame>`; the sheet renders the panel alone. `SettingsFrame` gains an `embedded` mode so panels shown in the sheet skip `AppShell`, the back link and the duplicate save bar, and use the sheet's own footer save bar instead. Around 30 panels: printer, elements, type, lines, qr, booking-slip, tax, identity, rules, sku, numbering, catalog, region, visibility, payment, accounts, services, booking-rules, whatsapp, sync, shift-alerts, notifications, display, updates, terminals, mobile-terminals, sessions, database-explorer, diagnostics.

## 5. SQL cleanup

Delete (superseded by `supabase/schema.sql`, which already contains all 52 tables, RLS, grants and routines):

- `supabase/schema7.sql` … `schema33.sql` (30 files), `supabase/schema_final.sql`, `supabase/external-full-schema.sql`, `supabase/online_setup_fix.sql`, `supabase/online_schema_fix_latest.sql`
- `supabase/sql/` in full (44 numbered scripts + `online_schema_v2.sql` + README), replaced by the single canonical file

Keep: `supabase/schema.sql` (cloud), `database/schema.sql` (SQL Server master, applied by `electron/db/pool.cjs`), `db/offline/pos-offline-sqlserver.sql`, `db/offline/pos-offline-sync-metadata.sql`, `electron/db/offline_sqlite_v2.sql`.

Then fix the references: error strings in `src/lib/terminal-tokens.ts`, `src/components/pos/TerminalTokens.tsx`, `src/routes/coupons.tsx` and the comment in `src/lib/pos-db.ts` all say "run schemaNN.sql" — they become "run `supabase/schema.sql`". `docs/windows-desktop.md` and `db/offline/README.md` updated the same way.

## 6. Technical notes

- New `src/lib/settings-catalog.ts` replaces the `GROUPS` array in `settings.index.tsx` and the page lists in `settings-groups.ts`; `SYSTEM_TAB_IDS`, `groupForRoute` and `settingsDuplicates()` are re-implemented on top of it so the Logic Health duplicate check now covers every settings area, not just the four hub groups.
- The half-height sheet uses the existing shadcn `Sheet` with `side="bottom"`, `h-[55vh]` default and an expand toggle to `h-[92vh]`; safe-area padding preserved for Android.
- `SettingsDrawer.tsx` is generalised from the 6 quick cards to any catalog entry and gains the expand control plus the save bar footer.
- Panel extraction is mechanical (cut body, export component, import into route) — no behaviour or business-logic change; each route keeps its metadata so SEO and deep links are unchanged.
- Sidebar edits are confined to `src/components/pos/nav-config.ts` and `SidebarNav.tsx`; the header gear is added in `AppShell.tsx`.
