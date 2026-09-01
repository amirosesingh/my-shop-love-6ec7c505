# Stage 3 — Stock Requests, end to end

Requests already exist as a kind of stock transfer, numbered REQ-. What they cannot do
today is record how much was actually approved, sent and received — the quantity asked
for is the only number in the system — and the "Require Stock Transfer Approval" switch
lives on the terminal, so a till could ignore it.

This stage keeps one workflow and the existing tables, and fills those two gaps.

## How a request will behave

```text
Branch B asks Branch A for 5
   │
   ├─ approval required  → waiting for approver → approved (5, or fewer)
   └─ approval not required → straight to Branch A
                                   │
                              dispatched 4  ← the request closes here
                                   │
                              received 3 or 4 at Branch B
                                   │
                              completed · 1 never fulfilled
```

Dispatch closes the request against the quantity actually sent. The shortfall is
recorded, not carried: if Branch B still needs the last one, it raises a new request.
The original keeps every quantity, name, time, status change and reason.

## Approval that the terminal cannot skip

Today the switch is read on the terminal and passed along with the new request. Instead:

- The setting is stored centrally, per branch, with a group-wide default.
- A database rule decides the opening status when a request is saved. A till that
  claims a request is already approved is overruled — the request goes to the approver.
- The same rule refuses invalid jumps (going straight from asked to received, receiving
  more than was sent, approving your own request without the permission) and stamps who
  approved and when. Terminals keep working offline; the rule applies when the row
  reaches the central database, and the till mirrors it locally.

## Quantities

Each line will carry: requested, approved, dispatched, received. The screen shows all
four side by side with the shortfall spelled out, so "5 asked, 4 sent, 3 arrived, 1
short, 1 missing in transit" is readable at a glance rather than inferred.

Stock moves on the real numbers: what leaves the sending branch is what was dispatched;
what lands is what was received. A difference between the two is flagged as goods
missing in transit rather than silently absorbed.

## Screens

One request screen, as now, with the extra steps in place:

- Raise — pick the branch and the products, say how many of each and why.
- Approve or reject — the approver can trim quantities line by line; a rejection needs a
  reason.
- Dispatch — the sending branch confirms what is actually going, which closes the request.
- Receive — the destination confirms what arrived, line by line.
- History — the same read-only timeline added in Stage 2, on every request.

## Records and recovery

Every step writes a status-history entry and a business event: who, what changed, why,
which branch, which terminal, when. The new columns join the sync contract and the
restore set, so a rebuilt terminal gets its requests back with all four quantities and
the full trail intact.

## Technical notes

- `stock_transfer_items` gains `quantity_approved` and `quantity_dispatched`
  (`quantity_received` exists). `stock_transfers` gains `dispatched_by`, `dispatched_at`,
  `closed_at`, `fulfilment` (`full` / `partial` / `none`) and keeps `rejected_reason`.
- `TransferStatus` gains `dispatched` and `completed`; `requested` splits into
  `awaiting_approval` and `approved` so the setting's effect is visible in the record.
- Central enforcement: a `stock_transfer_approval_required(store_id)` SQL function reading
  the scoped setting, plus a `BEFORE INSERT OR UPDATE` trigger on `stock_transfers`
  validating the transition graph, the actor's permission and the quantity ceilings.
  Grants and RLS follow the existing branch-visibility pattern.
- Same columns mirrored into the guarded `database/schema.sql`, registered for push,
  scoped pull and restore in `electron/db/repo.cjs`.
- `src/lib/stock-transfers.ts` gains `approveTransfer`, `dispatchTransfer` and a widened
  `receiveTransferInDb`; `applyTransferDelta` switches from requested to dispatched and
  received quantities. `src/routes/transfers.tsx` gets the per-line quantity editors.
- `trackTransition` fires on each step; `src/lib/feature-schema.ts` and
  `src/lib/sync-coverage.ts` updated for the new columns.
