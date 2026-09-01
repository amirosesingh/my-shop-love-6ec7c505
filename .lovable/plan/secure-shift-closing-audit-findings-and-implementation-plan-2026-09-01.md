# Secure Shift Closing — Audit Findings and Implementation Plan

## Part A — What exists today (verified by reading the code and the database)

Shift lifecycle
- `src/lib/pos-store.tsx` — `openShift()` (line 768) and `closeShift()` (line 850). Close is a single client-side step: it builds the closed row, writes it, ends sessions, logs activity, dispatches the day-end summary.
- `src/components/pos/ShiftGuard.tsx` — terminal lock when no OPEN shift; `can_bypass_shift_lock` skips it.
- `src/lib/shift-close.ts` — all reconciliation maths (`expectedDrawer`, `tenderSales`, `reconcileShift`, `varianceNeedsPin`, `closeScreenView`) runs **in the browser**.
- `src/lib/shift-hours.ts`, `shift-sessions.ts`, `shift-attendance.ts` — duration, overdue, sign-in sessions.
- `src/lib/shift-alerts.ts` — day-end summary, delivery channels stored in **localStorage** per device.
- Two independent close dialogs: `src/routes/index.tsx` (~line 3357) and `src/routes/shifts.tsx` (~line 600). The register dialog counts cash only; the Shifts dialog also counts card/digital and writes the variance columns.
- Database: `public.shifts` has 31 columns; `status` is only `OPEN`/`CLOSED`. `expected_cash`, `variance_*`, `counted_*` are all written by the client. RPCs present: `shift_open`, `shift_active_for_branch`, `shifts_sync_status`. There is **no** server-side close or reconciliation function.

## Part B — Security loopholes confirmed

1. **RLS lets any staff rewrite any shift.** The `Branch staff update shifts` policy allows UPDATE on every column for any staff member in a visible branch — including `status`, `counted_cash`, `expected_cash` and every `variance_*` column. A cashier can reopen a closed shift or edit their own count.
2. **Expected cash is client-computed.** `expectedDrawer()` sums the local sales cache, so "blind count" only hides a number the client already holds and can read in devtools. There is no authoritative server figure.
3. **Variance is client-supplied.** Whatever the browser calculates is what gets stored; the server never checks it.
4. **No closing state.** There is no `CLOSING_STARTED`; the till stays fully usable until the moment the close write succeeds, so sales, refunds and voids can be rung after counting begins. Another terminal can also keep selling on the same shift.
5. **Blind mode is a display toggle only** (`closeScreenView`), overridable in settings by non-admins depending on granted flags.
6. **No closing reason** is captured; `note` is free-text and optional.
7. **Count is mutable** — closing twice or a later UPDATE simply overwrites `counted_cash`.
8. **Variance alerts are device-local** (localStorage recipients, dispatched from the closing browser). If that device is offline or the send fails, nothing durable records it; the cashier's own device decides whether managers get told.
9. **Permissions are coarse** — only `can_open_shift`, `can_close_shift`, `can_bypass_shift_lock`. No recount, variance-view, expected-cash-view or reopen permissions.
10. **Generic sync push accepts `shifts` rows** (`src/lib/sync-relay.ts` allow-list), so a queued offline payload can set any shift field, including status.
11. **No immutable shift audit** — closing writes go to the general activity log, which is not a financial trail.

## Part C — Code proposed for removal (NOT removed — awaiting your approval)

| File / symbol | What it does | Why it becomes unnecessary | Depends on it | Risk | Recommendation |
|---|---|---|---|---|---|
| `src/routes/index.tsx` close-shift dialog (~3357–3500) | Second, simpler close dialog on the register | Replaced by the new guided closing flow | Register header button | Low | Replace with a link into the new flow |
| `src/lib/shift-close.ts` → `expectedDrawer`, `tenderSales`, `expectedFor`, `reconcileShift`, `closeScreenView.expected/showVariance` | Client-side expected cash + variance | Server becomes the only authority | Both dialogs, `shifts.tsx` history | Medium — history view also reads it | Keep display helpers, delete the calculation exports |
| `rules.enable_blind_cash_count`, `show_expected_totals_at_close`, `show_live_variance_at_close`, `show_itemized_tender_breakdown` | Toggles that reveal expected figures | Blindness becomes permission-driven, not a toggle | Settings → Rules page | Low | Retire the toggles, keep columns |
| `shift-alerts.ts` local dispatch of the closing summary | Sends day-end message from the closing device | Superseded by backend variance alerts | Shift alert settings page | Medium — also used for the normal Z summary | Keep summary, move variance alerting to backend |

I will not delete anything from this table until you confirm each row.

## Part D — Implementation (after your approval of Part C)

Stage 1 — Database and authority
- Extend `shifts` with `close_reason`, `closing_started_at`, `state` (`ACTIVE`, `CLOSING_STARTED`, `CASH_COUNT_REQUIRED`, `CASH_COUNT_SUBMITTED`, `RECONCILIATION`, `VARIANCE_REVIEW_REQUIRED`, `CLOSED`), `final_counted_cash`, `variance_status`.
- New immutable tables: `shift_cash_counts` (every count, original + recounts, never updated) and `shift_close_events` (append-only audit) plus `shift_variance_alerts` with delivery attempts and retry state.
- Replace the blanket UPDATE policy on `shifts` with column-safe, function-only writes: cashier clients get SELECT of non-financial columns only; `expected_cash`/`variance_*` are revoked from `authenticated` and returned only through a permission-checked function.
- Security-definer functions: `shift_close_start(reason)`, `shift_cash_count_submit(amount)`, `shift_recount_submit(amount, reason)`, `shift_variance_approve()`. Each validates state transitions, permission, terminal/outlet, and rejects duplicates. Expected cash and variance are computed **inside** these functions from `sales`.

Stage 2 — Closing workflow UI (shared by Web, Desktop, Android)
- One flow component: reason screen (mandatory, non-blank, no dropdown) → Continue → server transitions to `CLOSING_STARTED` → cash-count screen with no Back/Cancel → Submit → server reconciles → neutral confirmation. The cashier never sees expected cash, variance, or any notification status.
- The register is hard-locked once the shift leaves `ACTIVE`: guard blocks sale, refund, void, discount, payout and drop, and the server rejects the same operations for that shift from any terminal.

Stage 3 — Permissions
- Add `SHIFT_CLOSE`, `SHIFT_CASH_COUNT`, `SHIFT_CASH_RECOUNT`, `SHIFT_VARIANCE_VIEW`, `SHIFT_EXPECTED_CASH_VIEW`, `SHIFT_VARIANCE_APPROVE`, `SHIFT_REOPEN`, `SHIFT_CLOSURE_OVERRIDE` to the permission catalogue and role editor, each enforced server-side rather than inferred from role.

Stage 4 — Variance review and recount
- Manager view on `/shifts`: variance list (permission-gated), Perform Recount with mandatory reason, showing original count and every recount side by side. Original rows are never mutated; the latest authorised count becomes the accepted figure and closes the shift.

Stage 5 — Alerts and offline
- Variance alerts are created by the backend, with recipients configured centrally by role/user, and delivery attempts logged with retry and de-duplication; the financial record stands regardless of delivery.
- Offline: only the reason and the counted amount queue; state never rolls back to ACTIVE; on reconnect the operation is revalidated centrally with an idempotency key, and the shift sits in a pending reconciliation state until the server answers.

Stage 6 — Verification
- Tests for the state machine, blank/whitespace reason, count immutability, duplicate submission, unauthorised recount, permission gates and offline replay; plus a final sweep across routes, sync endpoints, relay tables and Electron IPC to confirm no remaining path can rewrite a shift, read expected cash, or resume selling after closing starts.

## Notes
- No second financial ledger: expected cash is derived from the existing `sales` data inside the server functions; local databases stay a cache only.
- Every stage ends with a version bump per project convention.
- Given the size, I will deliver these stages one at a time and report after each.
