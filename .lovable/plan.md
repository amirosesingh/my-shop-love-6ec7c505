# Repair cashier shift opening and database recovery

## Confirmed diagnosis

- A cashier PIN session is not a database-auth session, so direct operational writes such as opening a shift are rejected by row security and must use the authenticated server relay.
- The relay currently reports that its central POS service key is absent in the deployed runtime. “Cloud direct” only confirms database reachability; it does not grant a cashier permission to write.
- Browser tills in Online mode rethrow that relay error before queueing. Android is intentionally Live Data Only and has no durable local queue, so it must stop when the relay is unavailable. The current “work is being queued” message is therefore inaccurate on both paths.
- The existing `dbRouter` is not yet the universal data layer: outside its tests, only a few modules call it, while operational modules still contain direct database writes.
- Deployment documentation describes an automatic deploy workflow, but `.github/workflows/deploy.yml` is absent. This makes runtime secret preservation/rebinding dependent on manual deployment setup.

## Implementation

### 1. Restore the deployed relay first

- Rebind the already-saved `POS_SUPABASE_SERVICE_ROLE_KEY` to the current Lovable Cloud runtime and verify `/api/public/sync-health` reports the key as present without exposing its value.
- Exercise a real cashier login and shift-open request. Confirm the request reaches `/api/public/sync`, caller verification succeeds, and the shift row is committed.
- Keep the existing SHA-256 session tokens, cashier-login endpoints, row security, and server-only key boundary unchanged.

### 2. Correct failover behavior and status wording

- Treat an unavailable relay as a recoverable target failure only on platforms that have a durable local queue.
- In browser local-capable modes, queue the confirmed local write and unlock the shift, marking sync as pending.
- In Android Live Data Only mode, do not claim a local queue exists; block safely with an accurate administrator-action message.
- Separate status into three independent signals: local durability, online database reachability, and privileged relay readiness. Do not label a cashier write path healthy merely because “Cloud direct” is reachable.

### 3. Make recovery controls truthful and useful

- Update Sync & Backup / System diagnostics to report which exact layer failed: local store, public database connection, cashier relay authorization, or missing runtime key.
- Keep pending operations retryable after relay recovery. Recovery must not discard or duplicate a shift/sale operation.
- Ensure retry/discard controls refresh their counts and show confirmation only after the outbox transition succeeds.

### 4. Consolidate operational writes behind one router incrementally

Route business writes through `dbRouter`/`commitOps`, preserving dedicated direct paths only for authentication and privileged server operations. Start with the high-risk workflows:

1. shifts and shift sessions;
2. sales, sale items, drawer events, and stock adjustments;
3. purchase orders/receiving, bookings/payments, transfers;
4. catalog metadata, campaigns, suppliers, and other settings writes.

Reads may remain direct where row security and offline-cache behavior are already correct; they should not be forced through a write queue.

### 5. Prevent recurrence during deployment

- Add/repair the documented deployment workflow so runtime variables survive releases and no private value is committed or printed.
- Add a post-deploy presence-only health check that fails deployment when the relay key binding is absent.
- Add regression tests for cashier shift opening in browser Online mode, browser local mode, Android Live Data Only, relay-key missing, relay restored, and duplicate retry/idempotency.

## Verification

- Cashier, staff, manager, and admin paths are tested separately.
- Cashier can open a shift using the terminal branch when the cashier profile has no branch.
- Browser local-capable mode opens from a durable local commit when online relay is down; Android blocks with truthful copy.
- Restoring the relay drains the pending operation once and updates its status to synced.
- No service key appears in browser bundles, logs, health payloads, repository files, or UI.
