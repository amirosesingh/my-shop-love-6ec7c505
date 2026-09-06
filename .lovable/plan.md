# Three production fixes: recount branch check, negative tender counts, stuck WhatsApp sending

Small, targeted upgrades to existing code. No new subsystems.

## 1. Recount can reach another branch's shift

`shift_recount_submit` in `supabase/schema.sql` loads the shift and checks its state, but never
checks that the shift belongs to a branch the user can see — unlike `shift_cash_count_submit`,
which does check right after loading the row. Because the routine runs with elevated rights, a
staff member with recount permission can recount another branch's drawer.

Fix: add the same branch check immediately after the "shift no longer exists" check, raising the
identical message `That shift belongs to another branch.`

## 2. Negative card / digital amounts accepted

Both `shift_cash_count_submit` and `shift_recount_submit` validate cash (`NULL` or below zero is
refused) but pass card and digital straight through to `shift_cash_counts` and on to
`shift_reconcile_now`. A negative figure silently distorts the variance.

Fix: in both routines, refuse card and digital when supplied and below zero, with clear messages.
`NULL` keeps its meaning of "this tender was not counted".

## 3. WhatsApp auto-send can leave the register stuck on "sending"

`sendSaleOnWhatsApp` in `src/lib/register/use-checkout.ts` (lines 107-120) turns the sending flag
on, awaits the send, then turns it off. If the send throws, the flag is never cleared — the button
stays disabled for the rest of the session — and because the automatic path calls it with `void`
(line 564), the failure escapes as an unhandled rejection.

Fix: wrap the body in try / catch / finally. The flag is cleared in `finally`; a thrown failure
shows the same style of error toast the failed-response branch already shows. Checkout stays
non-blocking; the fire-and-forget call can no longer produce an unhandled rejection.

## Tests

- New `src/lib/__tests__/shift-count-guards.test.ts`: asserts, against the checked-in schema text
  (the pattern `canonical-supabase-schema.test.ts` already uses), that the recount routine carries
  the branch check before any write, that the branch error text matches the cash-count routine, and
  that both routines refuse negative card and digital while still allowing null, zero and positive
  values. This is the regression proof that a non-supervisor with recount permission cannot reach
  another branch's shift.
- New `src/lib/__tests__/whatsapp-send-state.test.ts`: drives `sendSaleOnWhatsApp` with a rejecting
  sender and asserts the sending flag returns to off, an error toast is shown, and the
  fire-and-forget call settles without an unhandled rejection. Also covers the success path.

## Technical notes

- `supabase/schema.sql` is edited in place and a new timestamped file is added under
  `supabase/migrations/` containing only the two `CREATE OR REPLACE FUNCTION` statements, so both
  stay consistent. No already-applied migration is touched.
- The Lovable-managed Supabase files are not imported or registered; the existing
  `src/lib/external-supabase-config.ts` flow is untouched.
- Version bump via `node scripts/bump-version.cjs`.
- Validation run: `npm test`, `npm run lint`, `npm run logic:scan`, `npm run build`,
  `git diff --check`, each reported with status.
- Note on the request's last step: committing and opening a pull request is not something I can do
  here — git history is managed by the platform. Everything else is covered.
