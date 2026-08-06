# POS polish: camera/QR, charts, register layout, theming, security

## 1. Charts are colourless — confirmed cause
The analytics charts pass `hsl(var(--primary))` to Recharts, but the theme tokens in `src/styles.css` are raw `oklch(...)` values. Wrapping an oklch value in `hsl()` produces an invalid colour, so bars, lines and pie slices fall back to black/none.

Fix: add a proper chart palette (chart-1…chart-8 tokens defined for light and dark) and use those tokens everywhere in `/analytics` and the other report charts. Every pie, bar, stacked bar and trend line gets a distinct, readable colour in both themes.

## 2. Analytics error panel
When the board fails to load, replace the plain message with a panel that names the exact table or view that was refused (sales, sale_items, v_daily_store_sales, v_daily_item_sales), states whether it was a permission or a missing-object failure, and prints the exact SQL file to re-run (e.g. `supabase/sql/12_analytics_views.sql`, `04_register_sales.sql`) with a copy button and a retry button. Each source is probed separately so the panel can list more than one problem at once.

## 3. SQL re-run guards
Sweep `supabase/sql/*.sql` so every function that returns a table, or whose signature changed, is preceded by a matching `DROP FUNCTION IF EXISTS ...(argtypes)` — `verify_terminal_pin`, `verify_cashier_pin`, `current_app_user`, `list_app_users`, `list_cashiers`, `voucher_by_token`, `terminal_token_status` and anything else the sweep finds. Re-running any file, or `99_run_all.sql`, then never fails with "cannot change return type".

## 4. Camera, barcode and QR on Android
- Declare camera permission and the camera feature in the Capacitor Android config/manifest template so the generated project always requests it.
- Add an explicit runtime permission request with a clear prompt and a fallback message when the user denies it, shared by the register scan bar, the EAN-13 product scanner and the terminal pairing scanner.
- Make the scanning path consistent: MLKit on native, `html5-qrcode` on web, behind one wrapper so both surfaces behave the same.

## 5. Terminal pairing QR no longer crashes
Scanning a pairing QR currently throws to the error page and needs a refresh or cache clear. The pairing screen will parse the scanned payload defensively (plain token, URL or JSON), treat unknown/expired/used tokens as inline messages instead of thrown errors, always stop the camera before navigating, and route through the app router rather than a hard location change. A failed scan leaves you on the pairing screen with a retry button.

## 6. Register responsiveness
- Transaction actions (and the other right-column action cards) become a single vertical column at every width — the two-column container query is removed.
- Bill discount and per-line discount controls are laid out so the button can never slide behind or out of the totals row: label truncates, button is fixed-width and pinned right on one line, with no empty gap underneath.
- Product search and loyalty member search stay on one row sharing the width evenly; when space is tight they shrink and truncate instead of wrapping to two lines and breaking alignment.
- Cart lines, totals block and the action column are re-checked at narrow, tablet, laptop and wide widths so nothing overlaps or overflows.

## 7. Display settings: accent colour + manual font size
On the Display & text size page:
- A colour picker for the interface accent (the current yellow), with presets plus a custom colour, saved per device and applied through the theme tokens in both light and dark.
- A numeric font-size control (explicit values you can type or step through, e.g. 12–24) alongside the existing scale slider, so text size can be set exactly rather than only by multiplier.

## 8. Security and database review
Run the backend security scan and the database linter, review RLS coverage and grants on every public table (sales, sale_items, products, members, coupons, vouchers, settings, logs), confirm no anonymous role can read staff, terminal-token or supplier data, and fix what the scan flags. Intentional findings get recorded in security memory, and a short summary of what was checked and changed is reported back.

## 9. Editor-tooling references
Project-facing mentions of the builder (README, docs, package metadata, any user-visible strings) are cleaned up. Note: `src/lib/lovable-error-reporting.ts` and its hook in `__root.tsx` are what surface runtime errors in the preview — removing them blinds error reporting while you are still iterating. Recommendation is to keep that one file and strip everything else; say the word if you want it gone too.

## Technical notes
- Chart tokens added to `src/styles.css`; `PALETTE` in `src/routes/analytics.tsx` and fills in the other report routes switched to them.
- `src/lib/analytics-board.ts` returns per-source diagnostics instead of one thrown string; new error panel component under `src/components/pos/`.
- `capacitor.config.ts` plus the manifest handling in `scripts/mobile-build.cjs`; shared scanner wrapper alongside `CameraScanner.tsx` and `ScanBar.tsx`.
- Layout work stays in `src/routes/index.tsx`, `src/components/pos/CatalogPanel.tsx` and `ActionButton.tsx` presentation classes.
- Accent colour and font size stored with the existing UI-scale preferences in `src/lib/use-ui-scale.ts` and applied via CSS variables.