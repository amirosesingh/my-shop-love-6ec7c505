# Fix: activation token creation fails on location reference

## What's happening

The token generator's Location dropdown lists the locations held in the POS app state (`usePos().stores`), which on most installs come from local storage or the built-in seed list. The cloud `terminal_tokens` table requires `location_id` to match a row in the central `stores` table. If the selected location was never written into that central table — which happens when the app was used before the stores table existed, or when the queued "save location" sync never completed — the insert is rejected by the database's reference check.

Verified from the code: `stores` is loaded from local state first and only pushed to the cloud table opportunistically (`upsertStores` runs only when the cloud table returned zero rows, via the offline queue).

## Fix

1. **Ensure the location exists before issuing a token.** In the token issue path, upsert the selected location (id, code, name, address, phone) into the central `stores` table first, then insert the token row. This makes issuing self-healing regardless of prior sync state.
2. **Backfill on open.** When the Terminal Activation screen loads, reconcile the app's location list into the central table (bulk upsert, ignore duplicates) so the dropdown and the database agree.
3. **Show the real reason on failure.** Replace the generic "could not create tokens" toast with the database message, plus a friendly hint when it is a missing-location error.
4. **Guard the form.** Disable "Generate Activation Token" when no location is selected or the device name is blank.

## Technical notes

- Files touched: `src/lib/terminal-tokens.ts` (upsert-before-insert + error passthrough), `src/components/pos/TerminalTokens.tsx` (backfill on mount, error surfacing, button guard).
- No schema change required; `schema10.sql` stays as is. The upsert uses `onConflict: id` so re-running is safe.
- Central store writes require a staff-role session, which the admin issuing tokens already has.
