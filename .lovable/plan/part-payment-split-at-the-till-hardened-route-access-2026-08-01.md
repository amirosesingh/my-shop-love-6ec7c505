# Part-payment split at the till + hardened route access

## 1. Paying part in cash, the rest another way

Split tenders already exist in the payment dialog, but they sit behind an "Add tender" button that starts empty and gives no help with the maths. The flow becomes a first-class part-payment experience:

- The payment dialog shows a clear **Paid so far / Balance due** header that updates as each tender is entered.
- Quick amount chips on each tender line: **Half**, **Remaining**, and rounded cash notes, so "half cash, half card" is two taps.
- Adding a tender prefills the outstanding balance; editing an earlier line recalculates the rest instead of silently leaving a gap.
- Cash lines allow overpay and show change due; non-cash lines are capped at the outstanding balance.
- Card lines keep the required **Bank / card machine** field, now with recent-machine suggestions; wallet, bank transfer and points lines keep their reference field.
- The Complete button stays disabled with an inline reason ("Short by 12.50") instead of only failing on click.
- Receipt, customer display, bill history and the sales report read the tender breakdown and show a consistent one-line summary such as `Cash 20.00 + Card (HSBC) 15.00`.

## 2. Making every route secure

Today the gate is a redirect that runs *after* the page renders, admins bypass every check, and any path missing from the map is open to any signed-in user.

- Access is decided **before** the page body renders — no flash of protected data, and an "Access restricted" panel instead of a silent bounce to the register.
- **Deny by default**: any route without an explicit permission entry is treated as restricted rather than public. A test fails the build when a new route file has no entry.
- Fill the gaps: `/display`, `/reports/catalog`, `/reports/coupons`, `/reports/stock`, and each `/settings/*` page get their own entry.
- The admin shortcut stays, but is applied through the permission resolver so an admin with a deliberately reduced matrix is still respected.
- Server-side data stays protected by the existing staff-only database rules; the client gate is UI defence, not the only line.

## Technical notes

- `src/routes/index.tsx`: extract the tender editor into `src/components/pos/TenderSplit.tsx` (props: total, tenders, onChange, recent bank names) to keep the register file manageable; validation moves into a pure helper in `src/lib/pos-types.ts` (`validateTenders(total, tenders)` returning `{ paid, balance, error }`) so it is unit-testable and reused by the store's `checkout`.
- Recent bank/machine names persist in local settings alongside the other terminal preferences.
- `src/components/pos/AppShell.tsx`: replace the `useEffect` redirect with a `<RouteGuard>` wrapper around `{children}` that computes the longest-prefix match and renders the restricted panel; keep the existing `ROUTE_PERMISSIONS` map, extend it, and add an explicit public list (`/`, plus `/display` if it should stay open on a second screen).
- `src/lib/__tests__/route-guards.security.test.ts`: extend the existing test so every file in `src/routes` maps to either `ROUTE_PERMISSIONS` or the explicit public list.
- New unit tests for `validateTenders` (exact, short, overpay-cash, card missing bank name).