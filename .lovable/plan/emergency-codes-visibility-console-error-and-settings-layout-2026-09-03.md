# Emergency codes visibility, console error, and settings layout

## What I checked

- The console error `Cannot read properties of undefined (reading 'startTime')` at `reportAllChanges` comes from the preview's own performance-measurement script (web-vitals). Nothing in this project imports or uses web-vitals, so it is not an app bug and it does not affect the POS.
- The Emergency codes page exists (`/settings/emergency-codes`) and works, but it is **not listed in the settings catalogue**, so it never appears as a card or in settings search — the only way in is by typing the address.
- The terminal list is empty because the backend currently has **zero registered terminals** (the terminal registry table has 0 rows). A till only appears after it is activated, and its code only becomes readable after that till has been online once and lodged its recovery secret. Until then the per-terminal "Show code" cannot work by design.

## What to change

### 1. Make Emergency codes reachable
- Add an `emergency-codes` card to the settings catalogue under the Terminal group, next to Terminal activation, so it shows in the workspace and in search.
- Add it to the "System & general"/terminal grouping ordering so it is not an orphan page.

### 2. Make the empty state explain itself
Instead of a bare "No registered terminals yet", the page will show:
- a clear line explaining that tills appear here once activated, with a link to Terminal activation;
- the **company master code** panel promoted to the top, always usable — this is the code to read out for a till that has never been online, which is exactly the situation today;
- for a listed-but-not-yet-escrowed till, an explicit "waiting for this till to come online once" note instead of a disabled button with no reason.

### 3. Smaller buttons and cards
Tighten the settings UI so it reads well on both a phone and a till:
- settings cards: smaller padding, smaller icon, tighter text, more columns on wide screens;
- category buttons and in-page action buttons reduced to the compact size;
- the emergency-code row buttons reduced to icon-sized compact controls.
No behaviour changes, styling only.

### 4. Page inventory for you to regroup
Below is every page in the app. Reply with the grouping you want (which pages under which group name) and I will rebuild the settings workspace groups to match.

**Register & selling:** index (register), sales, holds, shifts, receipts, display, promotions, coupons, claim, c/:token

**Bookings & services:** bookings, pos.general-booking, pos.racket-service

**Inventory:** inventory, inventory-hub, stock-operations, purchasing, receiving, requests, transfers, suppliers, verifications, approvals

**People:** customers, members, join, staff, admin

**Company:** stores, all-shops, dashboard, analytics, audit

**Reports:** sales, items, stock, payments, voids, history, activity, business, catalog, analytics, notifications, coupons

**Settings — terminal:** display, updates, hardware, terminals (activation), mobile-terminals, sessions, emergency-codes (currently hidden), recovery (emergency access screen)

**Settings — printing:** printer, elements, type, lines, receipt-designer, qr

**Settings — business:** identity, tax, rules, sku, numbering, stock-numbering, catalog, region

**Settings — payments:** payment-methods, payment, accounts, whatsapp

**Settings — bookings:** booking-rules, services, booking-slip

**Settings — data & sync:** sync, database, data-sync, shift-alerts, notifications, branch-telemetry

**Settings — diagnostics:** system, database-health, logic-health, security-alerts, data-comparison, inheritance, database-explorer

**Settings — access:** access (roles, permissions, screen visibility)

## Open question

You mentioned making "the VCSS and the other one" buttons smaller — tell me which screen those two buttons are on (or send a screenshot) and I will size exactly those as well; otherwise I will apply the compact sizing across the settings workspace as described above.

## Technical notes

- Catalogue entry in `src/lib/settings-catalog.tsx` plus ordering in `src/lib/settings-groups.ts`.
- Empty-state and compact controls in `EmergencyCodesPanel.tsx`; card sizing in `src/routes/settings.index.tsx`.
- No change to code derivation, escrow, HMAC, or the recovery flow.
