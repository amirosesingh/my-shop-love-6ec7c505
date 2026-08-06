# Fix analytics access, SQL script error, bookings buttons and register layout

## 1. Analytics board cannot load ("permission denied for sale_items")

The board reads through the managed backend client, while every other POS screen
reads through your own database client. Signed-in staff exist only in your
database, so the board's request arrives as an anonymous visitor and is refused.

- Point the analytics data loader at the same database client the rest of the app
  uses, so the request carries the signed-in staff session.
- Show a clear, friendly message on the board when the reporting views are missing
  or access is refused, instead of a raw database error.
- Note in the SQL README that `12_analytics_views.sql` must be run on your own
  database for the board to have data.

## 2. SQL error: "cannot change return type of existing function"

`verify_terminal_pin` (and any other routine whose returned columns changed)
cannot be replaced in place on a database that already has an older version.

- Add explicit `DROP FUNCTION IF EXISTS ...` lines before the affected routines in
  `supabase/sql/02_staff_and_access.sql` (verify_terminal_pin, verify_cashier_pin,
  current_app_user, list_app_users, list_cashiers) so the file re-runs cleanly on
  both fresh and existing databases.
- Same treatment for any routine in the other feature files whose output columns
  changed, so `99_run_all.sql` stays safe to re-run.

## 3. Bookings / job cards: crowded buttons + delete a job

- Move every action (print slip, job tag, status change, collect, pay, delete)
  into a single right-hand column of the card, stacked vertically under the
  amount, with the job status badge directly above them. On narrow screens the
  column drops below the details as a full-width row of icon buttons.
- Add a **Delete job** action:
  - Already completed/collected: simple confirmation.
  - Deleted before completion: a typed reason is required before deleting.
  - Every delete is written to the activity log with who, when and the reason.
- Also fixes the console warning about a badge nested inside a paragraph here.

## 4. Register right column: transaction actions and device panel

- "Transaction actions" and "Device & printing" switch from a fixed 2-column grid
  to a container-query layout: a single vertical stack when the panel is narrow,
  two columns only when there is real room.
- Buttons keep full labels when wide and collapse to icon + tooltip when narrow,
  matching the adaptive buttons used elsewhere.

## 5. Discount button and cart alignment

- The discount control returns to the same line as the promotion row using a
  two-column grid with a shrinkable text side, so it can no longer float over the
  promotions text.
- Cart line rows get proper minimum-width and truncation so long product names and
  the quantity/price controls stay inside the card at every window width.

## Technical notes

- `src/lib/analytics-board.ts`: swap `@/integrations/supabase/client` for
  `supabaseExternal`; surface a typed "reporting views missing" result.
- `src/routes/analytics.tsx`: empty/permission state instead of a thrown error.
- `supabase/sql/02_staff_and_access.sql`: guarded `DROP FUNCTION IF EXISTS` before
  the changed routines; no data is touched.
- `src/routes/bookings.tsx`: restructure each list item into
  `grid-cols-[minmax(0,1fr)_auto]` with an action column; delete dialog with
  reason capture logged through the existing audit helper; `<p>` wrappers holding
  badges become `<div>`.
- `src/routes/index.tsx`: container-query classes on the action/device grids,
  `ActionButton` for collapsing labels, grid fix for the discount row, and
  `min-w-0` / `truncate` on cart line text.