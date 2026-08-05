# Compact UI, quick discounts, mobile terminal registration & branch stock tables

Four separate pieces. Web and Windows behaviour stays intact; Android keeps its live-only rules.

## 1. Space-aware buttons everywhere

Toolbars and action rows currently push their labels out of the frame and overlap on narrow windows. Introduce one shared `ActionButton` that:

- shows icon + label when there is room, collapses to icon-only below the breakpoint, and always exposes the full label as a tooltip (and as `aria-label`, so nothing is lost for screen readers or keyboard users);
- uses the grid + `min-w-0` + `shrink-0` + `truncate` pattern so a long product or member name shrinks instead of shoving neighbours off screen.

Applied across the register action bar, cart rows, catalog panel header, inventory, purchasing, transfers, receipts and the settings frames.

## 2. Discount pad on the cart

- The moment a line lands in the cart, that row shows a **Discount** button (only when the signed-in user has the discount permission, or after a manager override — the existing rule is unchanged).
- A **Bill discount** button sits above the totals.
- Tapping either opens a calculator-style pad: preset percentages in steps of five (5, 10, 15, 20 … 50), a **Custom %** entry and a **Custom amount** entry, a live preview of the resulting price, plus **Clear discount**.
- The line pad writes to that line; the bill pad writes the ticket-level discount. Both keep writing to the existing audit trail.

## 3. Terminal registration on Android + PC-terminal management

- **Android registers first.** On start-up the phone shows the activation screen before anything else. It registers as its own device type (`mobile`), so it never consumes a till token and never appears in the PC terminal list.
- **QR at registration on the PC.** The Windows/desktop activation screen displays the machine's pending registration as a QR code. From the phone (already registered and signed in as an admin) you scan that QR to approve and activate the till — no copying and pasting a token. Pasting the code stays available as the fallback.
- **Manage terminals from the phone.** A mobile-friendly terminal manager lists every PC terminal with location, status and last seen, and lets an admin issue, re-issue, revoke or delete a token. Mobile devices are filtered out of that list.
- **Production-grade scanning** (shared by the register scanner and the activation scanner): explicit camera-permission request with a clear denied state and guidance to re-enable it, 700 ms debounce so one barcode can't fire twice, a confirmation step showing what was scanned before it is applied, torch toggle where supported, and a manual search/entry fallback whenever the camera is unavailable or a scan finds nothing.


## Technical notes

- New SQL script `supabase/schema23.sql`: the three branch tables with staff-only access rules matching the existing tables, plus `terminal_tokens.device_type` and the approve-by-QR RPC. Existing branch settings in the JSON blob are migrated into rows on first load.
- New files: `src/components/pos/ActionButton.tsx`, `src/components/pos/DiscountPad.tsx`, `src/components/pos/CameraScanner.tsx`, `src/components/pos/MobileTerminalManager.tsx`, `src/lib/branch-tables.ts`.
- Touched: `src/routes/index.tsx` (register), `ScanBar.tsx`, `TerminalActivation.tsx`, `TerminalTokens.tsx`, `terminal-tokens.ts`, `branch-policy.ts`, `BranchSettings.tsx`, `pos-db.ts`, `sync-engine.ts`, `electron/db/schema.sql`, `electron/db/repo.cjs`.
- Version set to **1.1.0** for this release, and from here on each future update steps the last number (1.1.1, 1.1.2, …) instead of the old 1.0.x line.
- The usual typecheck / lint / test run at the end.