# Confirm-before-continue writes + scrollable racket booking

## Goal

No action moves on until its data is safely stored in at least one place — the cloud database when online, or the local/offline store when not. Only after that confirmation does the till print, clear the cart, close the dialog, or let the next action start. Plus: the racket booking window gets a proper scrollbar so long job cards are usable on small screens.

## 1. Durable write confirmation

Today most writes are "fire and forget": the code hands the change to the write queue and immediately continues, so the screen can move on before anything is actually stored.

Change:
- Add a `commit()` helper next to the existing write layer that returns a promise and only resolves once the change has landed in one of the three stores: the cloud database, the local desktop database bridge, or the offline queue on disk. If none of the three accepts it, it rejects with a plain-language error.
- Every write path reports which store accepted it, so the UI can say "Saved to cloud" or "Saved offline — will sync".

## 2. Gate the critical actions

Each of these awaits its commit before doing anything else, shows a busy state on its button, and blocks repeat clicks while pending. On failure nothing is cleared and an error toast explains what happened:

- Completing a sale (sale + line items + payments) — receipt printing, drawer kick, and cart clear happen only after the save confirms.
- Opening and closing a shift.
- Creating a booking / racket job card, and booking payments.
- Manual cash drawer opens.
- Holding, reopening, voiding, and discarding tickets.
- Stock transfers and transfer approvals/receipts.
- Purchase orders and stock adjustments.
- Member creation and voucher claim/redeem.

Also: while a commit is pending, the register blocks starting another transaction so two events can't interleave.

## 3. Save confirmation feedback

A short inline confirmation after each save ("Saved" / "Saved offline") next to the action, plus the existing status pill continues to show pending sync count.

## 4. Racket booking window scrollbar

The booking dialog gets a fixed maximum height with the body area scrolling, header and footer buttons pinned. Same treatment for the standard "Book & pay later" dialog so long forms never push the confirm button off-screen.

## Technical notes

- New `commitWrite` path in `src/lib/pos-db.ts` wrapping `queue()`, returning `Promise<{ store: "cloud" | "local" | "outbox" }>`; `enqueue` in `src/lib/sync-outbox.ts` is treated as durable once written to `localStorage` (verified read-back), not merely appended in memory.
- Add a small `useCommit()` hook for the pending/error/busy state used by action buttons.
- Callers updated: `src/routes/index.tsx`, `holds.tsx`, `bookings.tsx`, `transfers.tsx`, `purchasing.tsx`, `receipts.tsx`, drawer and shift helpers.
- Dialog fix: `max-h-[85vh]` with `overflow-y-auto` on the scroll body in the booking dialogs of `src/routes/index.tsx`.
