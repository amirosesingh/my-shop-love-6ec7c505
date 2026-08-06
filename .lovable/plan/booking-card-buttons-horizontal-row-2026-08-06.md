# Booking card buttons: horizontal row

## Problem
On each booking / "book & pay later" job card, the action buttons (Print slip, Job tag, Part payment, Collect, Cancel, Delete job) are stacked in a vertical column, making the card very tall.

## Change
In `src/routes/bookings.tsx`, inside each booking card's right-hand column:

- Replace the vertical `grid w-full gap-1.5` action stack with a horizontal wrapping row: `flex flex-wrap items-center justify-end gap-1.5`.
- Keep each `ActionButton` compact (`size="sm"`, `layout="inline"`) so all buttons stay small and sit on one line where width allows, wrapping only on narrow screens.
- Loosen the right column from the fixed `sm:w-56` to a fluid width (`sm:w-auto sm:min-w-56 sm:max-w-full`, `min-w-0`) so the row has room to fit on one line instead of forcing wrap.
- Keep the price/balance block right-aligned above the button row, and leave the job-status chip row unchanged.

No behaviour, permission, or data changes — layout only.
