# Held bills: audit findings and fix

Note on naming: there is no `held_bills` table. Held bills live in `held_orders` (cloud) plus a per-device localStorage list. The audit below uses the real table.

## Step-by-step audit

**1. Bill held on the terminal — mostly correct.**
`src/lib/register/use-held-orders.ts` builds the ticket with an id, `storeId`, `heldBy`, bill number, lines, discounts, member and coupon, then `addHeldOrder` writes it to localStorage and calls `persistHeldOrder` → `db.commitHeldOrder` (`src/lib/pos-db.ts:1998`). The local-first commit path and outbox are in place. Two gaps:
- The id is `H${Date.now()}` (and `C${Date.now()}` for cancelled bills), not a UUID — collision-prone across terminals since the cloud `id` is the primary key.
- `holdCancelledBill` in `src/lib/held-orders.ts` sets no `storeId`, so a cancelled-bill hold lands with an empty branch.

**2. Sync to cloud — correct.** The row goes through the same outbox/relay as every other table (`held_orders` is allow-listed in `src/lib/pos-relay.server.ts` and `src/lib/sync-engine.ts`, branch column `store_id` enforced in `src/lib/relay-policy.server.ts`), and is only marked synced on confirmation. Matches the evidence: the row reached the cloud correctly.

**3. RLS — correct and branch-scoped, one hole.** Single policy on `held_orders`, `FOR ALL TO authenticated`:

```
USING       (is_staff_now() AND store_visible(store_id))
WITH CHECK  (is_staff_now() AND store_visible(store_id))
```

`store_visible(_store_id)` returns true for supervisors, for all-branch users (`user_store_id() IS NULL`), or on exact branch match — and also **when the passed branch is blank**. So it is not `true`/role-only, read and write are equally scoped, and branch isolation holds for rows that carry a branch. The hole is rows with a blank/NULL `store_id` (produced by step 1's cancelled-bill path): those are visible to every branch.

**4. The app's held-bills query — THIS IS THE BUG.** Nothing in the UI ever queries the cloud. `useHeldOrders()` (`src/lib/held-orders.ts:124`) reads `localStorage["pos.held.orders"]` only. `db.listHeldOrders()` exists at `src/lib/pos-db.ts:2048` but is called from nowhere. `/holds` and the register both render the localStorage list. A bill held on the Electron till is therefore invisible on web/phone by construction, even though the row is in the cloud — exactly the reported symptom.

**5. Realtime — absent.** No `postgres_changes` subscription for `held_orders` anywhere.

**6. Shift close — reads a different source than the screen.** `assertShiftClosable` (`src/lib/pos-rules.functions.ts:230`) calls `heldOrderCountResult` → RPC `held_orders_open_count(_store_id)`, which counts **cloud** rows `WHERE cancelled_from IS NULL AND store_id = branch`. So close is blocked by cloud rows the screen never shows and no one can release — the only escape was deleting the row in the database. Two further mismatches: the client-side pre-check at `src/routes/index.tsx:3413` uses the localStorage list, and the RPC excludes cancelled-bill holds, which the screen does show.

**Broken steps: 4 and 5 (plus the id/branch gaps in 1, the blank-branch RLS hole from those, and the count/display mismatch in 6).**

## The fix

1. **Make held bills cloud-backed** — rewrite `src/lib/held-orders.ts` so the held list is loaded from `held_orders` for the current branch (`select` of list columns only: id, label, store_id, held_by, bill_no, total, lines, member_name, cancelled_from, held_at — no payment or customer contact data), with localStorage kept purely as an offline cache/merge layer so the till still works with no network. Release/discard continues to delete the cloud row.
2. **Add Realtime** — one `postgres_changes` channel on `held_orders` filtered by `store_id`, subscribed in a `useEffect` and torn down on unmount, so holds appear and disappear live on web and phone.
3. **Stamp branch and a real UUID at creation** — `crypto.randomUUID()` for the id, and `holdCancelledBill` takes the current branch, so no row can be created branch-less again.
4. **Align shift close with the screen** — the register pre-check uses the same branch-scoped cloud-backed list as the server RPC, and the RPC stops excluding cancelled-bill holds so both sides count the same rows. Closing stays blocked while a genuine hold exists and unblocks as soon as it is resumed or discarded through the app.
5. **Close the blank-branch RLS hole** — one migration: backfill any blank `store_id`, make `store_id` NOT NULL on `held_orders`, and tighten the policy so a blank branch is no longer treated as visible-to-all, while keeping `is_staff_now() AND` branch match for SELECT/INSERT/UPDATE/DELETE. No `true`, no role-only check, no temporary allow-all at any point.

## Verification before I call it done

- Branch A session lists only Branch A holds; a Branch B row is absent from both the list and the shift-close count — proved with a query run as each branch's role.
- Insert/update/delete of a Branch B hold from a Branch A session is refused.
- Hold offline on the till → reconnect → row appears live on web/phone for the right branch without refresh.
- Resume or discard it in the app → shift closes with no database edit.
- Version bumped via `node scripts/bump-version.cjs`.

## Technical notes

- No service-role key is involved on any client path; sync keeps going through the existing relay.
- Files touched: `src/lib/held-orders.ts`, `src/lib/register/use-held-orders.ts`, `src/routes/holds.tsx`, `src/routes/index.tsx` (pre-check only), plus one migration for `held_orders` policy/column and `held_orders_open_count`.
