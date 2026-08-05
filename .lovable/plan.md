# v1.1.6 — Icon UI everywhere, racket job cards, mobile terminals page, group transfers

## What I checked (current state)

- **Icon buttons**: `ActionButton` (icon + long-press tooltip) exists but is used in **one file only** (`src/routes/index.tsx`). Every other screen — transfers, bookings, inventory, receipts, staff, settings — uses plain text buttons, so in a small Windows window they wrap and overlap.
- **Racket stringing**: a booking only carries a service name, fee and payment timing. There is **no** racket model, string type, tension, ready date, job status or job ticket.
- **Bookings are not in the database** — they live only in local state and the offline snapshot, so a racket job raised on one till is invisible elsewhere.
- **Mobile terminals**: one terminals page; it hides the phone's own token but has no separate mobile list.
- **Inter-group transfers**: scope logic, warning banner, badge and the cross-cluster receive routine all exist. What is missing is visibility — the log only lists notes where your current branch is sender or receiver, there are no intra/inter tabs, and the destination picker shows no cluster. (Transfers between two separate databases are not supported and are out of scope.)

## 1. One button language on Windows and phone

- Make `ActionButton` the single primitive for page actions, with a compact mode for narrow windows.
- Give every action an icon and convert the toolbars on transfers, bookings, inventory, purchasing, receipts, suppliers, stores, staff, shifts, coupons and the settings pages.
- Labels collapse to icon-only on narrow screens and small Electron windows; hover or a 450 ms long-press reveals the label.
- Fix overlap with the responsive header rule (grid header, `min-w-0` text blocks, `shrink-0` icons, truncating titles). Wide tables fall back to stacked cards on phones.

## 2. Racket stringing job card (bookings)

A "Job card" section in the booking dialog and on the bookings page, saved with the booking:

- **Racket & string**: racket brand/model, string type/brand, tension main + cross (lb/kg), grommet/grip notes, free-text extras.
- **Timing**: dropped off at, promised ready date and time, collect by.
- **Customer**: name, phone, member link, "notify on WhatsApp when ready".
- **Status**: received → strung → ready → collected, recording who changed it and when.
- **Printing**: a job tag to tie to the racket (ref, customer, racket, string, tension, ready date, barcode) alongside the existing booking slip.

The bookings page gains status filters and a "ready today / overdue" view.

## 3. Bookings stored in the database

Add `bookings` and `booking_payments` tables (with grants and staff-scoped access rules) so job cards, payments and status changes sync across tills like sales do; the local snapshot stays as the offline mirror.

## 4. Mobile terminals page

A new **Settings → Mobile terminals** page listing phone and tablet terminals only — device name, location, last seen, paired at — with pair-by-QR, rename and revoke. The existing terminals page becomes PC-only. Terminals are tagged with their platform at activation, and a device can never revoke itself.

## 5. Inter-group / intra-group transfers made visible

- Tabs on the transfers page: **Intra-group · Inter-group · All branches** (all-branches view for admins and supervisors, so cross-cluster notes show even when your branch is not a party).
- Destination picker grouped by cluster, with the group name beside each branch and a clear inter-group callout.
- Group column, scope badge and group filter in the transfer log.
- Stores page: pick the cluster from existing groups (with "new group") instead of free text, so branches don't all silently sit in `default`.

## Technical notes

- `src/components/pos/ActionButton.tsx` becomes the shared primitive; page toolbars refactored onto it.
- Booking type extended in `src/lib/pos-types.ts` (job-card block + job status), mapped in `src/lib/pos-db.ts`, actions in `src/lib/pos-store.tsx`, job tag printing in `src/lib/pos-print.ts`.
- Migration: `bookings`, `booking_payments`, plus a `platform` column on `terminal_tokens` for the PC/mobile split.
- Transfers: scope tabs and all-branch listing via `src/lib/stock-transfers.ts` (`loadTransfers` already returns every note).
- Version bumped to **1.1.6** in `src/version.ts` and `package.json`.