# Let a shift close on whatever cash was counted

## What is happening today (confirmed)

The till already accepts any amount the cashier types. Nothing compares the typed
amount to the expected amount in the screen or in the till code. The counted
amount is stored exactly as entered.

The blockage is one line in the database routine that reconciles the drawer
(`shift_reconcile_now`). After it works out the difference it decides:

```text
difference is zero, or within the "variance limit"  ->  SHIFT CLOSED
anything else                                        ->  VARIANCE_REVIEW_REQUIRED
```

That second state leaves the shift open until a supervisor presses
"Approve & close". Because the branch's variance limit is currently zero, a
one-cent difference is enough to hold the shift open, and the closing screen
shows "This shift needs a supervisor before it can finish closing."

So the cashier is not rejected — but the shift genuinely does not close, which
is the behaviour described in the request.

## What already exists and will be reused

- The expected-cash calculation (opening float + cash sales, refunds excluded).
  It is correct and stays untouched.
- `shift_reconciliations` already stores expected, counted, and the difference
  for cash, card and digital, rounded to cents.
- `shift_variance_alerts` already records every non-zero difference, once per
  reconciliation, with an acknowledge field for admins.
- The activity notification feed (`activity_events`) already powers the header
  bell and the notifications report, already works offline by parking the row in
  the till's own database and pushing it later, and already refuses duplicates
  through a unique event id.
- Both tables are already mirrored to the till database and already carried by
  the sync worker.

No new tables, no new notification system, no new shift system.

## The change

1. **Close the shift regardless of the difference.** In the reconcile routine,
   the closing state becomes `CLOSED` in every case. Everything else it writes
   — expected, counted, difference, over/short label, closing time — is
   unchanged.

2. **Keep the alert, drop the block.** The non-zero-difference alert row is
   still written (any amount, no minimum), and now carries the cashier name,
   terminal, expected, counted and the difference so the message can be built
   from it. A supervisor still acknowledges it; acknowledging no longer has to
   happen for the shift to finish.

3. **Raise one admin notification per shift with a difference.** Added to the
   existing feed as a new event type "Shift cash over/short", grouped under
   "Shifts & cash" so it can be switched on or off like every other event and
   goes out on the same channels. Message follows the requested wording:
   cashier, branch, terminal, expected, counted, difference, shortage or
   overage, shift. Its event id is fixed as `shift:<shift id>:cash_variance`, so
   a retry or a re-sync can never create a second copy. Zero difference raises
   nothing extra; the ordinary "Shift closed" event continues as before.

4. **Closing screen.** The "needs a supervisor" step disappears for the cashier;
   the shift closes, the Z report prints and the drawer opens as normal. A
   supervisor who is allowed to see the numbers still sees expected, counted and
   over/short on the shift record. A cashier still never sees the expected
   figure — blind counting is preserved.

5. **Offline.** The count already parks locally and replays; the notification
   already parks in the till database and pushes with the sync worker. Since the
   notification is raised from the closing path with the fixed event id, an
   offline close records everything locally and the admin receives exactly one
   notification when the line returns.

## Technical notes

- Migration: replace `public.shift_reconcile_now` so `v_state` is always
  `'CLOSED'`; keep `variance_status` (`NO_VARIANCE` / `OVER` / `SHORT`) and the
  `shift_variance_alerts` insert with its `ON CONFLICT (reconciliation_id)`
  guard. Severity keeps using `variance_pin_threshold` to distinguish warning
  from critical — the threshold no longer gates closure.
  `shift_variance_approve` stays as the acknowledge action.
- `src/lib/shift-closing.ts`: `submitCashCount` returns the state as today; no
  behaviour change needed beyond the new state being `CLOSED`.
- `src/platforms/web/components/pos/ShiftCloseDialog.tsx`: the `review` step
  becomes reachable only for a shift already parked in
  `VARIANCE_REVIEW_REQUIRED` from before the change (backwards compatibility);
  the normal path goes straight to `finish()`.
- `src/lib/pos-store.tsx` `closeShift`: after the existing `shift_close`
  activity event, raise the variance event when the reconciliation reports a
  non-zero difference, with `clientEventId = shift:<id>:cash_variance`.
- `src/lib/activity-events.ts`: add `shift_cash_variance` to `EVENT_CATALOG`
  under "Shifts & cash"; allow `recordActivity` to take an explicit
  `clientEventId` (it currently always mints a UUID) so the idempotency key can
  be supplied.
- `src/lib/activity-events.functions.ts` / server insert: confirm the upsert
  path uses `client_event_id` conflict handling; the unique index already
  exists.
- No change to shift opening, float, sales, refunds, cash in/out, reports,
  audit logs, sync coverage or the admin notification UI.

## Tests

New cases in the shift test suite covering expected 500 against counted 500,
499, 499.50, 100, 500.50 and 1000: each closes, each records the exact counted
amount and the correct signed difference, and only the non-zero ones raise the
variance notification. Plus: offline close parks both the count and the
notification; a replay of the same close produces one notification, not two;
and a reload after an offline close still shows the closed shift with its
difference intact.

Version bumped on completion.
