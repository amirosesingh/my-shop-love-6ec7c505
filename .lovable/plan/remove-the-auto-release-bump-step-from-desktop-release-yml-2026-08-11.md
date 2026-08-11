# Repair online sales, stock availability, and transfer branches

## Confirmed problems

1. **The first online write can use the wrong database configuration.** Terminal configuration is decrypted asynchronously, but browser sessions can reach the register before hydration finishes. Early sales, shift writes, and health probes may therefore use the default connection and cache a false offline result.
2. **Sales bypass the shared online-first router on Electron.** `commitSale` takes a local-only shortcut whenever the desktop bridge exists, instead of using the same cloud-first/fallback behavior as other writes.
3. **Cashier credentials race branch loading.** The encrypted cashier session is not loaded before `loadCloudState` decides whether the authenticated relay is available. On a fresh load, the central store directory is skipped and stale local stores are retained.
4. **Store reads are unnecessarily relay-only.** Signed-in staff sessions are not allowed to try the normal authenticated store query before fallback, starving inventory and transfer screens of branch metadata.
5. **The transfer destination selection does not recover.** If branches arrive after the page mounts, the dropdown options update but its selected branch can remain blank or stale.
6. **The configured central database currently contains products but zero store rows.** Code repairs can prevent races and stale state, but real destination branches cannot be displayed until the store directory contains actual branches. No fictional branches will be inserted.

## Implementation

### 1. Make startup identity and connection deterministic

- Gate trading UI on terminal-configuration hydration on every platform, not only desktop/Android.
- Add a defensive hydration wait in the database commit/health path so background jobs cannot query before the tenant override is ready.
- Reset the cached health result when terminal configuration changes.
- Hydrate encrypted cashier/session credentials before the initial cloud-state load and before deciding whether relay access is available.

### 2. Route every sale through the same online-first write gate

- Remove the Electron local-only shortcut from `commitSale`.
- In Online mode: write the sale, sale items, product stock, and member update to the central database first; return as soon as that succeeds; mirror locally in the background.
- On connection/timeout failure only: save locally and queue for synchronization.
- Preserve immediate errors for access, validation, foreign-key, or constraint failures instead of misreporting them as offline.
- Show “Database Connection Required” only when neither the central database nor local durable storage accepted the transaction.

### 3. Restore branch and per-store stock visibility

- Load stores through the normal authenticated client for staff/admin sessions, falling back to the authenticated relay only when the direct read is rejected or unavailable.
- For PIN sessions, await credential hydration and use the relay rather than silently returning `null`.
- Preserve the last valid store directory when a refresh fails, while surfacing an actionable setup state when the central directory is genuinely empty.
- Keep `stock_by_store` as the source of per-branch quantity; do not replace valid quantities with aggregate `stock_quantity`.
- Respect intentional private-stock and inventory-permission rules; only fix accidental data starvation.

### 4. Repair transfer destination behavior

- Revalidate the selected destination whenever the available branch list changes, automatically selecting the first valid non-current branch when needed.
- Distinguish “no other transfer-enabled branch” from “branch directory unavailable” so staff see the correct cause.
- Keep existing transfer approval, group scope, and branch-policy rules unchanged.

### 5. Verification

- Add regression coverage for delayed terminal hydration: no health check or write reaches the pre-hydration connection.
- Add online-sale tests for desktop cloud success with failed local mirroring, and cloud timeout with durable local fallback.
- Add credential-hydration tests proving a fresh PIN session loads the branch directory.
- Add transfer UI/state tests proving late-arriving branches populate and select a valid destination.
- Verify in the running app that inventory renders each known branch’s `stock_by_store` quantity.
- Verify branch-directory-empty handling separately. Actual branch rows must be created through Manage Locations using the business’s real branch names/codes before cross-store transfers can be offered.

## Technical files

- `src/components/pos/AppShell.tsx`
- `src/lib/terminal-tokens.ts`
- `src/lib/connection-health.ts`
- `src/lib/pos-credentials.ts`
- `src/lib/pos-db.ts`
- `src/lib/pos-store.tsx`
- `src/routes/transfers.tsx`
- Focused tests under `src/lib/__tests__/` and the existing route/component test setup

No database schema migration is required for these code defects. No sample branch data will be written to the live directory.
