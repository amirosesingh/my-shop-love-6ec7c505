# POS system audit — 17 Aug 2026

Scope: full read of `src/`, `electron/`, route tree, database schema and test suite,
after the general-booking change (cart-driven booking, no service fee, single slip layout).

## 1. What changed in this pass

| Area | Change |
| --- | --- |
| General booking | Service picker and service-fee box removed. Booking total = cart total only. |
| General booking | Items being booked are listed inside the dialog with qty +/- and a scan bar + catalogue search, driving the same `lines` state as the register ticket. |
| Booking slip | `serviceTermsBlock()` and the "accepted at intake" line are no longer gated on `booking.job`, so a general booking prints exactly the same terms + signature layout as a racket job. |
| Racket service | Untouched — it remains the only flow with a labour/service charge. |

New file: `src/components/pos/booking/BookingCartPanel.tsx`.

## 2. Blocking issues (fix first)

1. **Route-guard tests fail (5 failures, pre-existing).** `bunx vitest run`:
   - `route-guards.security.test.ts` — 7 route files do not render inside `AppShell`:
     `pos.general-booking.tsx`, `pos.racket-service.tsx`, `settings.data-sync.tsx`,
     `settings.diagnostics.tsx`, `settings.inheritance.tsx`, `settings.logic-health.tsx`,
     `settings.security-alerts.tsx`. The two `pos.*` files are redirect-only stubs and
     should be whitelisted in the test; the five `settings.*` files are now rendered as
     panels inside the settings sheet and should either be deleted or wrapped.
   - `route-guards.security.test.ts` — `/pos`, `/stock-operations`, `/verifications`
     have no entry in the route permission map. Real gap: `/stock-operations` and
     `/verifications` are reachable without a declared permission.
   - `permissions.security.test.ts` — the cashier preset now carries
     `can_collect_booking` and `can_create_booking` beyond the documented till floor.
     Decide whether that is intended and update the test, or tighten the preset.
   - `own-database.security.test.ts` — `src/lib/branch-settings.ts` imports the managed
     database client, which the ownership rule forbids.
   - `db-mode.test.ts` — a till now defaults to `online` where the test expects `local`.
     Offline-first behaviour on desktop needs confirming.

2. **`scripts/logic-scan.cjs`: 3 critical "no failure handling" findings** in
   `src/components/pos/settings/panels/PaymentMethodsPanel.tsx` (lines 27, 47, 59):
   load, save and delete all `await` without `try/catch`, so a dropped connection
   silently leaves the UI showing stale payment types.

## 3. Should fix

- **Redirect-only routes.** `/pos/general-booking` and `/pos/racket-service` only
  `throw redirect({ to: "/" })`. They are dead weight unless something external links to
  them; either give them real pages or drop them and update any docs/plans referencing them.
- **`useServiceTypes` setting.** With the fee removed from general bookings, the
  "use service types" switch in Settings → Services now only affects the racket flow.
  The copy on that settings page still implies it applies to all bookings.
- **`serviceFee` / `serviceName` on `Booking`.** Still written by the racket flow and read
  by `chargesBlock()`; for general bookings they are now always undefined. Historical rows
  keep printing correctly, so no migration is needed, but the columns are effectively
  racket-only and should be documented as such.
- **Prettier drift.** `bunx eslint src/routes/index.tsx` reports ~485 formatting-only
  errors, all auto-fixable. Run `bunx eslint --fix` on the routes folder in a dedicated
  commit so real lint errors stop being buried.
- **`src/routes/index.tsx` is 4.1k lines.** The racket intake, tender flow and canvas
  wiring all live in it. Continue the extraction started with `BookingCartPanel` —
  next candidates: the racket intake body and the tender/checkout block.

## 4. Verified working

- Every `to="/..."` link in routes and components resolves to a real route file
  (`/`, `/holds`, `/reports`, `/reports/notifications`, `/settings`, `/settings/data-sync`,
  `/settings/notifications`, `/settings/security-alerts`, `/settings/system`, `/stores`,
  `/transfers`) — no broken navigation targets.
- Typecheck passes clean (`tsgo --noEmit`).
- Booking write path: `bookAndPayLater` → `createBooking` → `commitBooking`; drawer and
  print only run after the write resolves.
- Deposit rules (minimum deposit, allowed timings, terms acceptance) are enforced before
  the write, not after.
- Booking slip and part-payment receipt both read the same receipt profile, so branch
  overrides apply to both.

## 5. Suggested test pass (manual)

1. Open a shift, scan an item, open **Book & pay later** — the item appears in the dialog list.
2. Scan a second barcode from inside the dialog — it lands in the same list and the total updates.
3. Reduce a qty to zero inside the dialog — the manager-approval gate fires.
4. Take a deposit below the branch minimum — save is refused with the required amount.
5. Save without ticking the terms box — refused.
6. Save and print — slip shows items, totals, deposit, balance, collect-by, terms, signature rule.
7. Repeat for a racket job — same slip layout plus the job block and labour charge.
