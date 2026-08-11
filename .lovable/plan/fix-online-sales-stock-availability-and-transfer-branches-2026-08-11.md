# Fix online sales, stock availability, and transfer branches

## Confirmed causes

1. **Early writes can use the wrong connection.** Terminal configuration is decrypted asynchronously, but browser sessions can reach the register before hydration finishes. The first sale, shift write, or health probe can hit the default connection and cache a false offline result.
2. **Desktop sales bypass online-first routing.** `commitSale` takes a local-only shortcut whenever the Electron database bridge exists instead of using the shared cloud-first write gate.
3. **Cashier credentials race branch loading.** The encrypted PIN session is not loaded before the app decides whether its authenticated relay is available. On a fresh load, the branch directory is skipped and stale local branches remain.
4. **Branch reads are unnecessarily relay-only.** Signed-in staff do not get a normal authenticated store query before fallback, so inventory and transfer screens lose the branch metadata needed to display `stock_by_store` quantities.
5. **Transfer selection stays stale.** If branches arrive after the page mounts, options update but the selected destination can remain blank.
6. **The configured central database currently has products but no store rows.** Code fixes will stop races and stale state, but real destinations require actual branches created in Manage Locations. No fictional branches will be inserted.

## Changes

### 1. Stabilize startup identity

- Gate the trading UI on terminal-configuration hydration on browser, desktop, and Android.
- Add a defensive hydration wait before health probes and database commits so background jobs cannot race the connection override.
- Reset cached health whenever terminal configuration changes.
- Hydrate encrypted cashier/session credentials before initial data loading and before deciding whether relay access is available.

### 2. Route all sales through online-first persistence

- Remove the Electron local-only shortcut from `commitSale`.
- In Online mode, save the sale, sale items, stock changes, and member update centrally first; return after central confirmation and mirror locally in the background.
- Fall back to durable local storage and queue synchronization only for connection or timeout failures.
- Surface permission, validation, foreign-key, and constraint failures directly rather than calling them offline errors.
- Show “Database Connection Required” only when neither central nor local storage accepted the transaction.

### 3. Restore branch and quantity visibility

- For authenticated staff/admin sessions, try the normal protected store-directory query first and use the authenticated relay as fallback.
- For PIN sessions, await credential hydration and then use the relay instead of silently returning no store data.
- Preserve the last valid branch directory when refresh fails, but show a clear setup state when the central directory is genuinely empty.
- Continue using each product’s `stock_by_store` values for branch quantities; do not replace them with aggregate stock.
- Preserve intentional private-stock and permission restrictions.

### 4. Repair transfer destinations

- Revalidate the selected destination whenever available branches change and select the first valid non-current branch when necessary.
- Distinguish “no other transfer-enabled branch” from “branch directory unavailable.”
- Keep existing approval, cluster scope, and branch-policy rules unchanged.

### 5. Verification

- Add a delayed-terminal-hydration regression test proving no probe/write reaches the pre-hydration connection.
- Test desktop Online mode with central success plus failed local mirroring, and central timeout plus durable local fallback.
- Test fresh PIN-session credential hydration and branch loading.
- Test that late-arriving branches populate a valid transfer destination.
- Verify the running inventory UI displays each known branch’s `stock_by_store` quantity.
- Verify the empty-directory state separately; real branch records must then be added through Manage Locations with the business’s correct names and codes.

## Main files

- `src/components/pos/AppShell.tsx`
- `src/lib/terminal-tokens.ts`
- `src/lib/connection-health.ts`
- `src/lib/pos-credentials.ts`
- `src/lib/pos-db.ts`
- `src/lib/pos-store.tsx`
- `src/routes/transfers.tsx`
- Focused tests under `src/lib/__tests__/` and the existing UI test setup

No schema migration is required for these code defects, and no sample branch data will be written to the live database.
