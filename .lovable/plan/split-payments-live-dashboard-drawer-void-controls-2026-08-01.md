# Split payments, live dashboard, drawer & void controls

## 1. Multi-payment split at checkout

A bill can be settled with any mix of tenders instead of one method.

- Payment dialog gains a tender list: add a line, pick Cash / Card / Wallet / Bank transfer / Points, enter an amount.
- Running **Paid so far** and **Balance due** update live; the sale completes only when the balance reaches zero (cash overpay still produces change).
- Card lines capture a free-text **Bank / card machine** field (e.g. "HSBC terminal", "Visa - CIMB"), remembered as recent suggestions for fast re-entry.
- Multiple card lines allowed, each with its own bank name and amount.
- The sale stores a `payments[]` breakdown; the legacy single `method` is set to the largest tender so existing reports and receipt code keep working.
- Receipts, customer display, bill history and the sales report show the full tender breakdown including bank names.

## 2. Real-time dashboard (`/dashboard`, in side pannel )

New page in the nav , gated by the sales-report permission.

- Today KPIs: revenue, transactions, average basket, gross profit and margin % (selling minus cost price), refunds, discounts.
- Revenue by hour bar chart with the peak hour highlighted.
- Profit-margin trend across the last 7 days.
- Tender mix donut (cash / each card bank / wallet / transfer).
- Top products and per-cashier takings for the day.
- Store scope: current store for staff, all-stores toggle for admins. Updates live from the POS store, no manual reload.

## 3. Cash drawer controls (no-sale logging)

- Every drawer open not tied to a sale is recorded as a **no-sale** event with timestamp, employee name and ID, role, store, terminal and a required short reason.
- A no-sale open requires the drawer permission, otherwise it prompts the existing supervisor override.
- The Register Activity report and a drawer section on the dashboard list no-sale opens per cashier per day.

## 4. Permission-gated sales approvals

Approvals are driven from the permission tab rather than hardcoded.

- The staff permission matrix keeps its existing sales flags and adds ones that are currently implicit: line delete, quantity reduce, manual bill discount, price override at the till, cart void, no-sale drawer open, split-payment tender edit.
- Turning a flag **off** for a cashier means that action prompts the manager PIN dialog (existing supervisor override, admin/manager only) instead of being silently blocked.
- Every override records who approved it, which action, and the affected line/amount.

## 5. Suspicious behaviour flagging

- New settings block with editable thresholds: voids per day, refund count and value per day, no-sale opens per day, manual discount as % of sales.
- The daily report flags a cashier when any threshold is exceeded **and** when their void/refund rate is a clear outlier versus other cashiers at the store that day.
- Flags surface as a "Requires review" panel on the dashboard and a column in the Register Activity report, with drill-down to the underlying events.

## 6. Audit trail completeness

- Permanent timeline entries for: price change (old to new), inventory adjustment, manual discount (line and bill), void, refund, no-sale drawer open, split-payment composition, supervisor override.
- Each entry carries timestamp, employee, role, store, terminal and before/after values, and syncs to the cloud audit log like the current trail.

## Technical notes

- Types: add `Payment { id, method, amount, bankName?, ref? }` and `payments: Payment[]` to `Sale` in `src/lib/pos-types.ts`; keep `method`/`paid`/`change` populated for backwards compatibility.
- Store: `checkout` in `src/lib/pos-store.tsx` accepts a tender array; the tenders-equal-total validation lives in the store, not only in the dialog.
- No-sale drawer events use the existing offline-first local-then-sync pattern from `src/lib/audit-log.ts`.
- Permissions: extend the `PermissionFlag` union, labels and groups in `src/lib/permissions.ts`; call sites reuse `requirePermission` so the supervisor PIN dialog is unchanged.
- Dashboard at `src/routes/dashboard.tsx` with its own `head()` metadata, registered in the reports group of `src/components/pos/nav-config.ts`; charts via the recharts setup already used in reports.
- Suspicious thresholds stored in the existing app settings so they sync with other POS settings.
- Cloud: a migration adds `payments jsonb` on `sales`, a `drawer_events` table and threshold columns on `pos_settings`, each with grants and staff-only access rules matching the current tables.