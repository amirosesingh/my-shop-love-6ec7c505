# Shifts in the database, trading hours + reminders, register and display tweaks

## Why shifts look inconsistent today

Shifts are stored only in this browser/PC's local storage, and "is a shift open?" is answered from that local list. A different terminal, a cleared cache, or the Android app therefore sees a different answer - hence "shift already open" appearing sometimes and not others. Moving shifts to the backend gives one shared truth per store.

## 1. Shifts stored in the backend

New `shifts` table holding: store, terminal, opened-by (name, staff id, role), closed-by (name, staff id, role), opened at, closed at, opening float, counted cash, expected cash, note, overdue flag. Staff-only access, same as the other POS tables.

- Opening and closing a shift writes to the backend as well as local storage (offline still works; the change goes through the existing outbox and syncs when the connection returns).
- On load, the register reads the currently open shift for the selected store from the backend; the local copy is only a fallback when offline.
- Opening a shift when the store already has one open is blocked with a clear message showing who opened it, on which till, and when.

## 2. Who may close a shift

- A shift belongs to the terminal that opened it. Any signed-in cashier or admin on that same terminal can close it, so the morning cashier does not have to be the one closing at night and a mid-day handover still works.
- Someone signed in on a different PC cannot close it: "This shift is open on Till 2 - close it there." Admins and managers are the exception and can close any shift from any terminal.
- Opened by / closed by names and times are stored, shown on the shift row and printed on the Z report.

## 3. Trading hours in Settings

New "Trading hours" block in Settings, saved with the other POS settings:

- Day starts / day ends (e.g. 09:00 - 22:00)
- Maximum shift length in hours (default 12)
- Remind me this many minutes before the day ends (default 30)
- Leave the hours blank for 24h operation

## 4. Reminders and overdue shifts

A small watcher runs while the app is open:

- At the reminder time before closing, and every 15 minutes after the day-end time, a dialog appears: "Shift opened at 09:12 by Sarah is still open - close it now?" with buttons to go to Shifts or snooze 15 minutes.
- Once a shift passes the day-end time or the maximum length it is logged as overdue in the activity trail, and the Shifts page shows an "Overdue" badge with elapsed duration plus a list of shifts left open on previous days.
- Nothing is force-closed automatically.

## 5. Register page

Remove the "Scan barcode or search products..." text box above the product grid. Products are added by tapping a tile; the scan strip above the cart keeps handling barcodes and search. Category filters stay.

## 6. Customer display

The `/display` screen gets a header control: "Close" when it was opened as a popup window, otherwise "Back to register", so it can be exited when opened from the sidebar.

## Technical notes

- Migration: `public.shifts` with GRANTs for authenticated/service_role, RLS via `is_staff`, `updated_at` trigger; new columns on `pos_settings` for day start, day end, max shift hours and reminder lead time.
- `src/lib/pos-db.ts` gains shift row mapping; `openShift`/`closeShift` in `src/lib/pos-store.tsx` persist through the outbox and carry the acting user + terminal id.
- New `src/components/pos/ShiftReminder.tsx` mounted in `AppShell`; overdue and close-permission helpers in `src/lib/shift-hours.ts`.
- Edits to `CatalogPanel.tsx` (drop the search field and its props), `src/routes/index.tsx`, `src/routes/display.tsx`, `src/routes/shifts.tsx`, and the settings page.
- Patch version bump as usual.