# Settings and Health Logic fixes

The Health Logic scan now inspects published RPC signatures through the authenticated server metadata route. It no longer executes heartbeat, transfer or voucher operations with dummy arguments or fetches the protected REST root directly in the browser. Metadata success verifies the signature, not business execution or caller permissions.

## Original five critical and two warning findings

- `saleArgs` in the checkout test: scanner incorrectly absorbed a following function into an expression-bodied helper; test files are now excluded and function boundaries use the TypeScript parser.
- `recordNoSale`: awaited failures propagate to its caller; absence of a local catch alone does not establish data loss.
- `applyStockDeltaBatch`: validates inputs and requires a complete, matching applied/duplicate response before reporting success.
- `saveDraftInner`: propagates failures to its caller; the scanner now recognizes protected local calls.
- `applyLineToStock`: removed duplicate receiving stock adjustment. Receiving commits own stock movements; pricing updates do not write absolute quantities. Corrections append movement differences with stable retry IDs.
- Two Android native HTTP warnings: the scanner mistook feature-detection regular expressions for placeholder code.

Unproven failure-propagation checks remain visible as informational findings, not critical errors. A clean scanner is not a guarantee that every runtime path has been tested.

## Settings behavior

- Global, Cluster, Branch, Terminal and Private scopes use the existing settings tables and lock rules. Registered terminal IDs identify Terminal settings across platforms.
- Settings refresh on realtime notifications, focus, reconnect and a 60-second fallback poll. Pending local writes are protected against stale refreshes. Editing waits for the selected scope to load successfully.
- Receipt printer and display profiles use shared scoped settings. Device-local preferences remain a fallback until a shared profile exists.
- POS Rules exposes screen lock timing and branch/global server idle defaults. Staff Management exposes per-person server idle limits. Saved server limits apply to new sessions.
- Printer options include 30 mm, 58 mm, 80 mm, A4 and Letter. Hardware must support the selected width; physical output still needs testing on each printer.
- Presets cover suitable numeric settings, with custom values where supported. SKU and stock reference digit counts use finite dropdowns. Printer calibration and display sizing can collapse.

## Validation

712 automated tests passed; TypeScript and production build passed; dependency audit found zero vulnerabilities. The scanner reported zero critical, zero warnings and 207 informational findings. ESLint has one pre-existing explicit-any warning at the untyped Electron CommonJS module boundary.

Physical Windows/Android devices, printer output and two-device live synchronization still require acceptance testing after deployment. Existing GitHub workflows own Cloudflare deployment and Windows/Android release builds.
