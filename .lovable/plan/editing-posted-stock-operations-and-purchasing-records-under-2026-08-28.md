# Editing posted Stock Operations and Purchasing records, under authorisation

## 1. What the code shows today

- **Stock Operations** (`/stock-operations`): a posted row shows a single "Edit" button, and that button already calls the authorisation gate with the action `edit_posted_stock`. If the gate says yes, the count dialog reopens with that record loaded. Other than the gate, a posted count is otherwise not reachable for editing.
- **Purchasing** (`/purchasing`): a received invoice in the history list shows an "Edit" button gated on `edit_posted_purchase`. If the gate says yes, an editable copy of the invoice opens; saving applies quantity deltas to stock and writes a before/after snapshot.
- **Authorisation (Task 6)**: both action keys already exist in the catalogue under "Records & edits", and both are configurable in the same Settings screen (POS rules → Authorisation) with mode `none / PIN / approval request / either`, allowed roles, named people, optional reason, per branch or globally. PIN checks and the audit log happen on the server.

So the "Edit exists and is gated" half is already in place. What is missing is everything that happens **around** an approval request, and a proper before/after record on the Stock Operations side.

## 2. Gaps this work closes

1. **Approval-request mode dead-ends.** If the person sends the edit for approval, the dialog closes and nothing brings them back — even after an approver says yes, the edit never opens. A `claimAuthorizationRequest` server function exists but no screen uses it.
2. **No pending-edit state.** While a request is waiting, the record looks exactly like any other posted record, so a second person can request or PIN-authorise an edit of the same record at the same time.
3. **No before/after audit for Stock Operations.** Purchasing snapshots old and new lines; a reopened stock count simply posts again, with no record of what it looked like before.
4. **Reposting a count double-counts nothing but explains nothing.** Reopening recalculates against current system quantities, so stock stays arithmetically right, but the record's own history is lost.

## 3. What will be built

### Edit entry points (unchanged in placement)
- Stock Operations: the existing "Edit" button on posted rows.
- Purchasing: the existing "Edit" button on received invoices.
- Editable once authorised — Stock Operations: counted quantities, reason, note (never the reference, branch or posted-by). Purchasing: supplier, invoice number, entry date, line quantity, cost, price, and line removal (line-level fields stay supervisor/admin only, as now).

### Authorisation wiring
- Both actions keep their existing keys and stay configured from the same Task 6 Settings screen. No new settings surface.
- When the branch rule is **PIN**, behaviour is as today: valid PIN from someone allowed to authorise, edit opens immediately, logged.
- When it is **approval request** (or the person picks that under "either"), the request is created with a payload naming the record, and the page now shows the record as **Pending edit**.
- When it is **either**, the person chooses on the spot.
- Admins continue to pass without a prompt, with the approval recorded server-side.

### While a request is pending
- The record stays **posted and locked** for everyone; nothing about its values or stock changes.
- It shows a "Pending edit" badge with who asked and when; the Edit button is disabled for others on that record.
- The requester sees "Waiting for approval" with a **Withdraw** action.
- Approvals page and the record list poll, so the badge clears on decision.

### Once approved
- The requester (or an approver on the same terminal) opens the record from the list; the page claims the approved request, which consumes the grant so it cannot be reused, and opens the editor.
- Saving applies immediately: Purchasing recalculates stock deltas as it does now; Stock Operations recomputes the adjustment against current system quantities and writes the resulting deltas.
- A before/after snapshot is written for both pages — old lines/quantities/reason vs new — into the authorisation audit log alongside the action, requester, authoriser, mode used and timestamp.

### If rejected or withdrawn
- The record stays exactly as posted; no fields change, no stock moves.
- The pending badge clears, the requester gets a toast/notification with the approver's note, and the rejection is written to the same audit log.
- An approved request that is never used expires (existing `expires_at`) and the record unlocks.

## 4. Risks to stock accuracy and reporting

- **Re-posting a count is relative, not absolute.** A reopened count compares counted quantities against *current* system stock, so sales made between the original post and the edit are not erased — correct behaviour, but the second adjustment will differ in size from the first. Reports that group adjustments by reference will show two movements for one reference; the plan keeps both visible rather than merging them.
- **Cost/valuation drift in Purchasing.** Changing a received cost after the fact changes item cost going forward but does not retro-price items already sold. This will be stated in the edit dialog.
- **Period-closed edits.** Editing a record dated in an already-reported period changes historical totals. Mitigation: the audit trail records the original values, so a report can be reconciled.
- **Concurrency.** The pending-edit lock plus single-use grants stop two people editing the same record at once.

## 5. Technical notes

- Migration (runnable file + applied): add `pending_edit_request_id`, `pending_edit_by`, `pending_edit_at` to `stock_count_drafts` and `purchase_orders`; add a `record_edits` audit table (record type, record id, reference, store, request id, authorised by, mode, before JSONB, after JSONB, created_at) with grants, RLS and staff-scoped policies.
- Offline parity in the same change: `electron/db/offline_sqlite_v2.sql`, `database/schema.sql`, `electron/db/cloud-columns.json`, `src/lib/central-schema.ts` — verified column-for-column against the migration before finishing.
- `src/lib/manager-gate.tsx`: expose the pending request id to callers (already returned) and add a small `useRecordEditGate` helper that resolves claim-on-open.
- `src/routes/stock-operations.tsx`, `src/components/pos/StockCountDialog.tsx`, `src/routes/purchasing.tsx`: pending badges, disabled Edit for others, claim-then-open, before/after capture on save.
- `src/routes/approvals.tsx`: show record payload details for these two actions.
- Version bumped with `scripts/bump-version.cjs`; typecheck and the full test suite run before finishing.
