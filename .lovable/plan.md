# Approval & Activity Centre — audit result and upgrade plan

## What already exists (reuse, do not rebuild)

| Requested capability | Already implemented | Where |
| --- | --- | --- |
| Authorisation rules, modes, thresholds, scoping | Yes — 20 action keys, modes `none/pin/request/either`, branch-over-global resolution, role/user allow-lists, `threshold`, `requireReason` | `src/lib/authorization.ts`, `authorization.server.ts` |
| Manager PIN approval, server-verified | Yes — PIN checked by database function, throttled, never in the browser | `authorization.functions.ts`, `manager-gate.tsx`, `AuthorizationDialog.tsx` |
| Grant tokens, expiry, single use | Yes — signed, 5-minute life, action-bound, consumed atomically | `pos-rules.server.ts`, `authorization.server.ts` (`consumeRequest`) |
| Approval request queue and decisions | Yes — `authorization_requests`, self-approval blocked, every decision logged | `src/routes/approvals.tsx`, `authorization_log` |
| Permanent audit trail | Yes | `authorization_log`, `activity_events`, `ticket-audit.ts` |
| Activity feed + WhatsApp fan-out | Yes | `activity-events.ts`, `ActivityBell.tsx`, `reports.notifications.tsx`, `whatsapp_queue` |
| Held tickets, resume, discard | Yes, with `row_version` revisioning | `held_orders`, `held-orders.ts`, `src/routes/holds.tsx` |
| Members on the ticket | Yes | `members`, register screen |

`src/routes/requests.*` is the stock-transfer feature and is unrelated; it will not be touched.

## What is genuinely missing

1. The approver sees only a flat key/value payload — no ticket review with lines, member and totals.
2. Nothing records the **requested** value beside the **approved** value; an approver can only accept or reject.
3. A queued request is not bound to a specific ticket revision, so the ticket can change while it waits.
4. Nothing links a finished bill back to the approval that permitted it.
5. A ticket cannot sit in "waiting for approval" while the cashier serves the next customer.
6. Approvals are not delivered live; the bell polls activity events only and does not show approvals at all.
7. The bell's read marker is device-local, with no "clear" that keeps the underlying record.

## The upgrade

**One centre, not a second system.** The existing bell becomes the Approval & Activity Centre with tabs: Waiting, Ready, Activity, Cleared. Approvers see requests they may decide; cashiers see their own requests and results. The decision screen at `/approvals` gains the real ticket review, rendered with the existing bill/line components.

**Flow.** The gate keeps deciding, from the branch rule and its threshold, whether an action is free, needs a PIN, or needs a request — no new thresholds and nothing hardcoded. When the cashier chooses "Send approval request", the ticket is snapshotted, parked as a held ticket marked waiting, and the request is created with that snapshot and revision. The cashier carries on with the next customer. The approver reviews the full ticket, then approves as requested, approves a different amount, or rejects. The result arrives live; the cashier's till also reconciles by polling, and the till never treats the live message as permission — it claims the approval from the server, which consumes it once and returns the grant. Resuming the ticket checks the stored revision; if the ticket changed, the approval is refused and must be requested again. The approved value, approver, time and request id are written onto the bill.

**Clearing** hides an entry for that person only; the request, the log and the activity event stay. Anything cleared can be reopened from the Cleared tab.

## Technical detail

- One migration, `supabase/migrations/<timestamp>_approval_centre.sql`:
  - `authorization_requests`: add `approved_payload jsonb`, `approved_amount numeric`, `bill_snapshot jsonb`, `held_order_id text`, `snapshot_version integer`, `notified_at timestamptz`.
  - `held_orders`: add `status text default 'held'` and `pending_request_id uuid`.
  - `sales`: add `authorization_request_id uuid`, `authorized_by text`, `authorized_at timestamptz`.
  - `activity_events`: add `cleared_by text[] default '{}'` for per-user clearing.
  - Publication: `ALTER PUBLICATION supabase_realtime ADD TABLE public.authorization_requests`.
  - Grants and policies follow the existing pattern for each table; writes stay on the service relay.
  - The same columns are mirrored in `database/schema.sql` for the local SQL Server / SQLite side, so drift detection stays clean.
- Server: extend `authorization.server.ts` / `authorization.functions.ts` with snapshot capture on create, `decideAuthorizationRequest` accepting an approved value, and claim verifying the snapshot revision. Approver identity and approved amount are always taken from the server session, never from the request body.
- Client: extend `activity-events.ts` with an approvals source and cleared state; extend `ActivityBell.tsx` into the tabbed centre; extend `AuthorizationDialog.tsx` with the "send for approval" path; extend `holds.tsx` and the held-order model with the waiting status; reuse the existing realtime channel helper in `sync-engine.ts` for the subscription, with the current 45s poll kept as reconciliation.
- One business-logic set shared by Web, Android and Electron; offline falls back to the existing queue and reconciles on reconnect.
- Tests extend `manager-gate.test.ts` and add `approval-centre.test.ts`: threshold below/above, PIN vs request path, request only on explicit send, ticket binding and changed-ticket refusal, requested vs approved values, single-use claim, hold/resume, live delivery plus poll reconciliation, clear without cancelling, reopen.
- Verification: typecheck, full vitest suite, web build, security scans, version bump. Android and Windows hardware restarts cannot be run in this environment and will be reported as untested.

## Not touched

Sales, printing, inventory, shifts, sync architecture, RLS model, stock transfer requests, emergency access, connection profile manager.
