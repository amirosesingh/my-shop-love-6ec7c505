# Voucher receipts, audit export filters, system status module, transfer approvals

## 1. Vouchers on receipts

When a voucher is applied to a sale, the printed receipt (and the reprint) gains a discount block showing:
- Voucher code / token
- Campaign name and discount applied to this bill
- Remaining voucher balance when the voucher is value-based and not fully consumed

Applies to the standard bill, the gift receipt and the reprint path, so a reprint shows exactly what was printed the first time.

## 2. Audit log export filters

The coupon audit log gets filters for shop, campaign, cashier/user and a date range (from/to). The CSV export honours the filters currently applied, so the export matches what is on screen. A row count and "clear filters" control sit above the table.

## 3. Top bar system health indicator

A status pill in the POS header showing:
- Green "Connected" — database reachable and the realtime socket is live
- Yellow "Degraded / Offline mode" — local data works, internet or realtime sync is down
- Red "Disconnected" — database unreachable or the API key is missing

Clicking it opens a popover listing each service with its own state and an "Open settings" button that jumps to the new system page.

## 4. System Status & Integrations settings page

New page at `/settings/system`, listed in the Settings hub (admin only).

Status dashboard for:
1. Central POS database (members & transactions)
2. Subdomain routing (member. and redeem. domains)
3. Realtime websocket listener
4. Cloudflare Pages / deployment sync

"Run diagnostics" pings all four and updates the results live, with latency and last-checked time.

Recovery actions, shown prominently when anything is degraded or disconnected:
- Force reconnect (retries realtime + database)
- Offline mode toggle (keeps the till selling from the local cache)
- Clear app cache & resync (flushes local storage/caches, re-fetches members and active coupon campaigns)
- View error logs — expandable panel with error code, timestamp and the failed endpoint

Configuration section:
- Member domain URL and redeem domain URL fields (defaults as today), saved with the other POS settings and used by the coupon link builder
- Read-only API gateway / database URL plus a key present/missing indicator (never the key itself)
- "Copy webhook & DNS instructions" modal with the Cloudflare records ready to copy

## 5. Welcome coupon becomes a manual choice

The member join flow stops auto-issuing a welcome voucher by default. The campaign carries an explicit "Issue automatically on signup" switch, off unless you turn it on; with it off, welcome vouchers are only granted from the backoffice issue dialog.

## 6. Remove the shift-left-open notification

The "Shift left open — running 7 hours" banner is removed from the app shell. The Shifts page keeps its overdue badge, so the information is still available without the nagging.

## 7. Bulk stock transfer / request by Excel

The transfers page gains an Excel/CSV import (same pattern as purchasing): download a template, drop a file, preview matched rows with a per-row error list, then create a single transfer or request from all lines. Unmatched barcodes and bad quantities are reported before anything is created.

## 8. Transfer approval workflow

- A new setting decides whether transfers and requests need approval before they move. When off, behaviour stays as today.
- When on, a new transfer sits in "Awaiting approval" and an Approve / Reject pair appears for anyone holding the approval permission (supervisor, warehouse or admin, driven by the permission matrix rather than hardcoded roles).
- Approver name and timestamp are recorded, shown on the transfer row and printed on the note; every approve/reject is written to the activity trail.
- A new `can_approve_transfer` toggle is added to the staff permission matrix so admins control exactly who can approve.

## Technical notes

- Receipt: extend the sale's voucher metadata through the `src/lib/pos-print.ts` templates (bill, gift, reprint).
- Audit: filter state + filtered CSV in `src/components/pos/CouponAuditLog.tsx`, reusing the existing `downloadCsv` helper.
- Health: new `src/lib/system-health.ts` (probe functions + shared hook), `src/components/pos/SystemStatusPill.tsx` mounted in both `AppShell` headers, new route `src/routes/settings.system.tsx`, entry added to `src/routes/settings.index.tsx`.
- Error log panel reuses `src/lib/sync-log.ts` and the error-capture buffer; offline toggle and domain overrides persist in POS settings and feed `src/lib/coupon-hosts.ts`.
- Welcome: campaign gains an auto-issue column; `member_welcome_claim` only fires when it is set — migration adds the column and updates the function.
- Remove the `ShiftReminder` usage from `src/components/pos/AppShell.tsx`.
- Transfers: bulk import component reusing SheetJS; `Transfer` type gains `approvedBy`/`approvedAt` and a pending status; `approveTransfer` in `src/lib/pos-store.tsx` gated by the new permission; migration for the new columns and the settings flag.
- Patch version bump as usual.