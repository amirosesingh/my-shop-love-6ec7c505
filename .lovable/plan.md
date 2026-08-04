# Shift sign-in times in the database, a live clock, and grouped settings

## 1. Shift times recorded in the database

Opening and closing a shift already writes to the backend `shifts` table (opened at, closed at, opening float, counted cash, who opened / closed). What is only stored on this PC today is **who signed in during the shift** — that log lives in local storage and disappears when the cache is cleared.

New `shift_sessions` table so every sign-in and sign-out is recorded centrally:

- Shift, store, terminal, staff id, staff name, role, signed in at, signed out at.
- A row is written the moment a cashier signs in while a shift is open, and stamped with the sign-out time when they lock or sign out (or when the shift closes).
- Works offline: the write goes through the existing outbox and syncs when the connection returns.
- The Shifts page shows, per shift, the exact open time, close time, duration, and the list of people who signed in with their times.

Also shipped: `supabase/schema16.sql` — a standalone script containing the `shifts` and `shift_sessions` tables (plus grants, access rules and the updated-at trigger) so a self-hosted or fresh install can create the shift tables in one run. The matching tables are added to the local Windows SQL Server script (`electron/db/schema.sql`) too.

## 2. Current date and time in one place

A live clock in the top header (visible on every screen, desktop and mobile): full date and time, ticking every second, e.g. `Tue 4 Aug 2026 · 22:41:07`. Next to it, when a shift is open, the elapsed shift time so the cashier always sees how long the till has been running.

## 3. Live Dashboard above Register POS

In the sidebar, Live Dashboard moves to the very top pinned position, above Register POS, with Register POS directly beneath it.

## 4. Settings regrouped by category

The System & Settings hub currently lists thirteen flat cards. It becomes grouped sections, each with a heading:

- **Terminal & display** — Display & text size, Software updates, Terminal activation
- **Printing & receipts** — Receipt printer, Receipt elements (paper size), Receipt typography, Receipt extra lines, Receipt QR code
- **Business & pricing** — Business identity, Tax & pricing, Trading hours & shifts
- **Payments & messaging** — Bank transfer details, WhatsApp bills
- **Data & sync** — Sync & backup

Printer hardware settings (port, encoding, margins, drawer pin) move out of the Display page onto their own "Receipt printer" page under Printing & receipts, so printer options are all in one category instead of sitting under display scaling.

## Technical notes

- Migration: `public.shift_sessions` (shift_id, store_id, terminal_id, staff_id, staff_name, role, signed_in_at, signed_out_at) with GRANTs for authenticated/service_role, RLS via `is_staff`, updated-at trigger.
- `src/lib/shift-attendance.ts` keeps the local log as the offline cache and gains database mirroring through a new writer in `src/lib/pos-db.ts`; sign-in/sign-out hooks in `src/lib/pos-auth.tsx`.
- New `src/components/pos/LiveClock.tsx` mounted in both headers of `src/components/pos/AppShell.tsx`.
- `standaloneNavItems` in `src/components/pos/nav-config.ts` reordered; `src/routes/settings.index.tsx` PAGES restructured into groups; new route `src/routes/settings.printer.tsx` hosting `ReceiptPrinterSettings`, removed from `settings.display.tsx`.
- `src/routes/shifts.tsx` gains the per-shift sign-in list and duration column.
- Patch version bump as usual.