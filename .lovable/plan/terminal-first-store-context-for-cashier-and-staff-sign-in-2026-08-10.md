# Terminal-first store context for cashier and staff sign-in

## What you see today

After a cashier signs in, the register shows **"Selling is locked at No branch yet. Open a shift to ring up sales."** even though a shift is open. Both halves of that banner come from the same missing piece: the app has not resolved which branch this till is trading in.

Confirmed from the code:

- The banner text lives in the register's catalogue panel and prints the current store's name. When the store directory is empty (or the current store id is not in it), the app falls back to a placeholder branch literally named **"No branch yet"**.
- Cashier PIN sign-in deliberately sets the user's store to `null` ("the till decides it"), so nothing on the user record supplies a branch.
- The open-shift lookup queries by that same unresolved branch id, so an open shift for the real branch is never matched — hence "locked".

What is *not* yet confirmed is why the store directory comes back empty on these devices (most likely the PIN session has no central-database session and the store read is filtered out). Step 1 below verifies that before anything else, so the fix targets the real cause.

## The fix

1. **Verify** branch resolution on a signed-in cashier till: what the terminal claim holds, what the store directory returns, and which branch id the shift lookup uses. This confirms the diagnosis above before changing behaviour.

2. **Terminal-first branch resolution.** One shared resolver, used everywhere the "current branch" is read, in strict order:
   - the branch stored in this terminal's activation claim,
   - the branch on the signed-in user's record,
   - the only active branch, when exactly one exists.

3. **Bind on sign-in.** As soon as a cashier's PIN or a staff login succeeds, the resolved branch is written into the app state (and local storage) before the register mounts, so the register never renders against an unresolved branch.

4. **Never show "No branch yet" when the terminal knows its branch.** When the store directory has not loaded, the placeholder branch is built from the terminal claim's own location id and name, so the banner, headers and shift lookup all use the real branch.

5. **Unblock the register.** With the branch resolved, the open-shift lookup matches the existing open shift, the lock banner clears, and the cashier can open a shift and sell without an admin assigning them a store.

## Technical notes

- `src/lib/active-branch.ts` stays the single resolver: `activeBranchId(inView)` keeps its terminal-first order and gains "the only active store" as the last step.
- `src/lib/pos-store.tsx`: the `currentStore` placeholder is built from `readTerminalConfig()` (`locationId` / `locationName`) instead of the hardcoded `"No branch yet"`; the branch-pinning effect drops the `s.stores.some(...)` guard so a terminal branch pins even before the directory loads.
- `src/lib/pos-auth.tsx`: `cashierLogin` resolves `storeId` via `activeBranchId(null)` instead of hardcoding `null`, including the offline cached-PIN path. PIN verification, token minting and session logic are untouched.
- `src/components/pos/AppShell.tsx`: the existing pin effect keeps `terminalStoreId` first and additionally accepts the single-store fallback.
- No database, RLS, migration, purchasing, product-deletion, shift-locking or layout changes.