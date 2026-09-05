# Fix the crash on the Approvals page

## What happens now

Opening Approvals shows "Cannot read properties of undefined (reading 'length')" and the page stops rendering.

## Cause (confirmed)

When the approvals list cannot be fetched — most commonly when the till session isn't recognised, which the recorded responses show as "Not signed in" — the reply comes back **without** the list of requests at all (the recorded reply carries only `ok`, `error`, `rules`). The page stores that missing value and then immediately asks it for its length, so the whole screen throws instead of showing the error message it already has ready.

A second, related fragility: the ticket preview inside a request assumes the saved ticket always contains a list of lines and numeric totals. A request saved without lines crashes the same way.

## The fix

1. `src/routes/approvals.tsx`
   - Only ever store an array: fall back to an empty list when the reply has no requests, and clear the list on a thrown error.
   - Guard the ticket preview: treat missing lines as empty, and don't format totals that aren't numbers.
   - When the list is empty and an error is present, show the error card rather than the "nothing waiting" card.
2. `src/lib/authorization.functions.ts` — make the failure reply always include `requests: []` and `rules: []` so any caller gets a consistent shape.
3. `src/lib/approval-centre.ts` — same defensive read for the notification centre, which consumes the same reply.
4. Add a test in `src/lib/__tests__` covering: failed reply renders the error and not a crash; a request whose saved ticket has no lines renders.
5. Bump the version with `node scripts/bump-version.cjs`.

Nothing is removed: the queue, filters, approve/reject/withdraw, ticket review and audit logging all stay exactly as they are.

## Note on the underlying "Not signed in"

The crash hides a second issue: the approvals call is being refused because the caller isn't recognised. After the crash fix the page will say so plainly. If it still refuses when you're signed in as a supervisor, that's a separate follow-up I'd trace next.

## The bill/receipt point

I need one clarification before touching that: which sending are you seeing fail — the WhatsApp bill to the customer, or the printed receipt — and what condition has to be "set" for it to work today?
