# Held bills: verified audit and end-to-end fix

## Important database distinction

The live preview network is using the app’s externally configured central database, while the database inspection tool is connected to the Lovable Cloud mirror. Therefore, the policy text found in the mirror is useful architecture evidence but **not proof of the live external database policy**. The implementation will first inspect the live database through the existing secured server relay and will not alter a policy until its exact production definition has been captured.

The real table name in this codebase is `held_orders`, not `held_bills`.

## Current audit: steps 1–6

### 1. Creation on Electron — partially correct

Current creation flow:

```text
Register currentStore.id
  → useRegisterHeldOrders({ storeId: currentStore.id })
  → order.storeId = storeId
  → addHeldOrder(order)
  → persistHeldOrder(order)
  → db.commitHeldOrder({ storeId: order.storeId, ... })
  → local SQL held_orders.store_id
```

The terminal’s registered branch is available from `TerminalConfig.locationId`. Activation writes it in `writeTerminalConfig(config)`, which Electron mirrors into its OS-encrypted terminal config. `activeBranchId()` resolves in this order:

```text
readTerminalConfig().locationId
→ persisted terminal_branch_id
→ branch currently in view
→ desktop local branch mirror
→ sole known branch
```

`pos-store.tsx` normally turns this into `currentStore.id`, so the normal register path generally receives the terminal branch. However, held-order creation does **not call the authoritative resolver at the moment of creation**; it trusts the derived `currentStore.id`. This does not satisfy the stricter requirement and leaves a stale/fallback path.

Additional schema gaps confirmed in both `database/schema.sql` and the central schema definition:

```text
id              NVARCHAR/text generated as H${Date.now()} (not UUID)
store_id        present but nullable
terminal_id     missing
status          missing
created_by      represented only by held_by name, no immutable actor id
created_at      present
is_synced       local only, defaults false
lines           present
```

The cancelled-receipt path is worse: `holdCancelledBill()` currently supplies no `storeId`, producing a branch-less hold.

**Verdict: broken.** The physical terminal binding exists and is uniquely persisted from the claimed activation token, but creation must resolve it directly and fail closed if an activated Electron terminal has no branch.

### 2. Offline sync — correct confirmation semantics; row contract incomplete

The desktop worker reads only `is_synced = 0`, sends the stored row, and executes:

```text
await cloudUpsert(table, payload)
await repo.markSynced(table, ids)
```

Failures call `markFailed`, persist the error/attempt count, retry, and eventually quarantine. No optimistic synced flag was found.

The secured relay does not silently trust or overwrite a normal till’s branch from the request body. For `held_orders`, `pinToStore()` compares the submitted `store_id` to the branch from the verified cashier/terminal session and rejects a mismatch; if omitted, it stamps the verified branch. This is a useful second defence, but the local record still must capture the terminal branch correctly at creation.

Because `terminal_id` and `status` do not exist in the current row contract, they cannot currently be pushed.

**Verdict: transport/retry is correct; payload contract is incomplete.**

### 3. RLS — mirror policy is scoped; live policy still needs direct verification

Mirror policy currently reads:

```sql
FOR ALL TO authenticated
USING      (is_staff_now() AND store_visible(store_id))
WITH CHECK (is_staff_now() AND store_visible(store_id))
```

It is not creator-scoped and applies to SELECT/INSERT/UPDATE/DELETE. `store_id` is text on both sides. However, `store_visible('')` currently permits blank branches, which is unsafe, and this mirror policy cannot be assumed to equal the live external policy.

**Verdict: live production policy unconfirmed; blank-branch behavior is unsafe in the inspected definition.** The first implementation step is to retrieve and record exact live policies/grants/types using a protected server-only diagnostic authenticated against the configured central database.

### 4. Web/phone query — primary visibility bug confirmed

There is no cloud query in the UI. The exact current read is:

```ts
const raw = window.localStorage.getItem("pos.held.orders")
```

`db.listHeldOrders()` exists and performs `.from("held_orders").select("*").order("held_at")`, but nothing calls it. `/holds`, the register hold menu and the client close pre-check all render a device-local list. There is no branch/status query because `status` does not exist.

**Verdict: broken and directly explains why a synced Electron hold is invisible on web/phone.**

### 5. Realtime — missing

No `postgres_changes` subscription exists for `held_orders`, and the table is not present in the checked Realtime publication migration.

**Verdict: broken.**

### 6. Shift close — authoritative count and UI use different sources

Server close check:

```sql
SELECT count(*)
FROM held_orders h
WHERE h.cancelled_from IS NULL
  AND h.store_id = requested_branch;
```

It is called through `held_orders_open_count(_store_id)` and fails closed if the count cannot be read. The register pre-check instead uses the localStorage list. The server also excludes cancelled-receipt holds while the UI includes them.

**Verdict: broken source/filter parity.** It explains a cloud hold blocking close while remaining impossible to release from the device-local UI.

## Confirmed broken areas

- Step 1: creation does not directly resolve the live terminal registration; ids are not UUIDs; branch can be null; required terminal/status/creator fields are absent.
- Step 2: delivery semantics are correct, but the schema cannot carry all required fields.
- Step 3: live external RLS has not yet been inspected; blank-branch behavior in the mirror is unsafe.
- Step 4: UI is localStorage-only — the main visibility bug.
- Step 5: Realtime is absent.
- Step 6: display and shift-close use different sources and filters.

## Implementation plan

### A. Diagnose the live configured database first

- Add a temporary **server-only, supervisor-protected diagnostic** through the existing secured relay to return only `held_orders` columns, grants, policy expressions and Realtime publication membership from the configured external database; never return credentials or row contents.
- Capture exact live policy text and compare `store_id`/`terminal_id` types before preparing SQL.
- Remove the diagnostic after verification; no debug bypass remains.

### B. Establish one held-order contract everywhere

Add to central and all local schema definitions/migrations:

```text
id UUID-shaped client id (central may remain text for compatibility, validated as UUID)
store_id NOT NULL
terminal_id NOT NULL for registered tills
status: held | released | cancelled
created_by actor id (nullable only for legacy rows)
held_by display name
created_at / held_at
lines and existing ticket context
local is_synced / sync_status fields remain local-only
```

- Generate ids with `crypto.randomUUID()`.
- At hold time, hydrate/read the terminal registration and resolve `store_id` with `requireBranchId()` so `TerminalConfig.locationId` wins; never use a user profile or global default for an activated till.
- Stamp `terminal_id` from the unique activation token id and `created_by` from the authenticated/cashier identity.
- Fix cancelled-receipt creation to pass the same branch, terminal and actor context.
- Preserve legacy rows; no business-data deletion. Backfill only where a branch can be determined unambiguously, otherwise quarantine/report legacy orphan rows rather than exposing them.

### C. Keep sync behavior, extend only its payload

- Add the new cloud columns to the authoritative contract and local-to-cloud allow-list.
- Preserve the existing `cloudUpsert → markSynced` ordering, retry/backoff and persistent failure logs.
- Keep relay branch pinning: a non-supervisor payload whose stored `store_id` differs from the verified terminal/session branch is rejected, not rewritten into another branch. Missing branch is rejected at creation before entering the queue.

### D. Replace device-only display with branch-scoped cloud + offline cache

Use one shared active-held predicate everywhere:

```sql
SELECT id, label, store_id, terminal_id, status, held_by,
       total, lines, member_name, held_at, bill_no,
       cart_discount, cart_discount_type, exchange_ref, coupon, note
FROM held_orders
WHERE store_id = :current_terminal_branch
  AND status = 'held'
ORDER BY held_at DESC;
```

- No `created_by`, terminal, date-range or current-user filter.
- Do not select payment data, customer contact data, or unrelated columns.
- Electron merges this branch-scoped result with its local unsynced holds; web/phone uses the central result. localStorage becomes an offline cache only, never the authoritative cross-device list.
- Releasing/resuming updates `status` away from `held` (rather than requiring manual deletion), preserving the record and auditability.

### E. Add branch-filtered Realtime safely

- Add `held_orders` to the Realtime publication once.
- Subscribe inside `useEffect` to INSERT/UPDATE/DELETE filtered by the current `store_id`; refetch the restricted projection on relevant events and remove the channel on cleanup/branch change.
- RLS remains the final boundary; the client filter is not treated as authorization.

### F. Make shift close use the identical predicate

- Update `held_orders_open_count` to count `store_id = branch AND status = 'held'` with no cancelled/creator/terminal discrepancy.
- Keep the server check authoritative and fail-closed.
- Make the client pre-check consume the same cloud-backed branch list, so any blocking ticket is visible and releasable.
- Once resumed/released/cancelled in the app, the status changes and both the list and server count clear without database deletion.

### G. Tighten live RLS without widening access

After exact live inspection, install separate explicit policies (or equivalent combined policies) for SELECT/INSERT/UPDATE/DELETE:

```text
is_staff_now()
AND store_id is nonblank
AND (supervisor/all-branch privilege OR store_id = verified user/terminal branch)
```

- No `USING (true)`, `1=1`, authenticated-role-only or creator-only policy.
- `WITH CHECK` prevents inserting or moving a row into another branch.
- The secured PIN-terminal relay continues to validate branch from its signed/verified caller before any elevated write; no service credential enters Electron, web, phone, local storage or a client bundle.

## Verification gate

Before calling the work complete:

1. Create Branch A and Branch B test holds through the real write path.
2. Branch A authenticated read returns only Branch A active holds; Branch B row is absent.
3. Branch A direct SELECT/UPDATE/DELETE against Branch B is denied/returns no row; cross-branch INSERT is rejected by `WITH CHECK` or relay pinning.
4. Inspect final policies and prove none contains allow-all, role-only or creator-only scoping.
5. Hold offline on Electron A, verify local row has UUID, terminal A id, Branch A id, `status='held'`, `is_synced=0`; reconnect, verify cloud confirmation precedes `is_synced=1`.
6. Open web/phone on Branch A and verify the row appears live without refresh; Branch B does not receive it.
7. Shift close on Branch A is blocked while the row is `held`; resume/release it through the app; Realtime removes it and close succeeds without database edits.
8. Run focused held-order, relay branch-isolation and shift-close tests; run backend linter; remove the diagnostic endpoint; scan for credentials and debug bypasses.
9. Bump the version with `node scripts/bump-version.cjs`.

## Expected touched areas

- Held-order model/hooks and register/receipts call sites.
- Local SQL Server + SQLite authoritative schemas and migrations.
- Central schema contract and cloud column mapping.
- One central migration for columns, constraints, policies, RPC predicate and Realtime publication.
- Focused tests for terminal stamping, cross-branch access, cloud display/Realtime and shift-close parity.
