# Electron parity: bill numbers, till status, schema healing, PO edits, cleanup, settings UI

## What I confirmed first
- Receipt numbers are generated in `src/lib/pos-store.tsx` (~line 746) as `PREFIX-000123` from a local counter — no branch/platform/date parts, and no uniqueness guard, so two devices in one branch can produce the same number.
- The till startup gate lives in `src/components/pos/AppShell.tsx` and shows a plain "Loading store data…" panel while `terminal.hydrating` is true, with no connection state and no timeout.
- "Could not find … in schema cache" is a PostgREST error already special-cased in a few places (`src/lib/pos-db.ts`, `src/lib/sync-engine.ts`, `src/lib/terminal-tokens.ts`) but there is no shared handling or cache-refresh path.
- Purchase Order editing already exists on `/purchasing` (Edit action on history rows, gated to admin/supervisor). What is missing is confirmation that stock and audit are retroactively adjusted on edit, which I will verify and complete rather than rebuild.
- Settings is a link hub of category groups (`src/routes/settings.index.tsx`) that navigates away to ~30 separate pages; there are no cards with in-place expansion or accordions.

## Task 1 — Collision-free bill numbers
- New `src/lib/bill-number.ts` producing `[BRANCH]-[PLATFORM][TERMINAL]-[YYYYMMDD]-[SEQ]` (e.g. `B101-PC01-20260811-0001`).
  - Branch from the active/terminal-bound store code; platform `PC` (Electron), `MB` (Capacitor), `WB` (browser); terminal index from the activated terminal record; date in the configured time zone; sequence per branch+device+day, persisted locally and seeded from the highest existing number for that day.
- Attach a `client_transaction_id` (UUID, generated once per checkout attempt) to the sale payload; before insert, look up an existing sale with that id (cloud, then local) and return it instead of inserting again, so retries and double-clicks cannot double-bill.
- Add unique indexes: cloud migration for `sales.bill_number` and `sales.client_transaction_id`; matching unique indexes in `electron/db/schema.sql`.
- Keep old-format numbers readable everywhere; only new sales use the new format.

## Task 2 — Network-aware till loader
- Extend the startup gate to render a status-aware loader driven by the existing health probe (`src/lib/connection-health.ts`) and sync phase (`src/lib/sync-status.ts`): green "Online", amber "Offline (local data)" with a badge, blue pulsing bar while syncing.
- Bound the gate: once hydration plus the first health check resolve, dismiss; add a hard timeout that drops into offline mode with a retry button instead of spinning forever.

## Task 3 — Schema cache errors when punching items
- Centralise detection of PGRST schema-cache / missing-column errors in one helper and use it from the write paths (products, sales, settings, transfers) instead of ad-hoc regexes.
- On that error: drop the client's cached column set, re-read the live table shape once, retry the write with only known columns, and log the mismatch to diagnostics.
- Run the local Electron schema migrations at boot (already invoked via `applySchema`) and add the missing/renamed columns the web version writes, so local and cloud shapes match; stale local cache files are invalidated on version change.

## Task 4 — Purchase Order post-punch editing
- Keep the existing edit dialog; complete it so an edit computes the delta against the stored invoice and applies it: stock quantity adjustments per line (add/remove/changed qty), cost/landed-cost recalculation, supplier change, and totals.
- Write an audit entry per edit showing before/after values, and record the stock delta as a stock adjustment so branch counts stay reconcilable.
- Route all of it through the existing durable gateway so edits work offline and sync later.

## Task 5 — Sync parity and housekeeping
- Make the Electron sync worker cover the same tables the web app writes (sales and sale items, purchase orders and items, stock adjustments, transfers, shifts, held orders, members) in dependency order, using stable ids so replays cannot duplicate.
- Add a small startup housekeeping pass in the Electron main process: delete orphaned temp/cache files, drop mirrored rows already confirmed in the cloud beyond the retention window, and vacuum. Never touch pending (unsynced) rows or active user data.
- No new dependencies.

## Task 6 — Settings redesign
- Rework `/settings` into top category cards (General, Terminal & display, Printing, Tax & billing, User permissions, Sync & network).
- Selecting a card expands its section directly beneath the cards instead of navigating away; existing settings pages remain reachable by URL.
- Inside dense groups (user permissions, printers, tax rules) use accordions built from the existing UI kit.
- Forms get inline validation and an auto-save indicator ("Saving…" / "Saved") per field group.

## Technical notes
- Web behaviour is the reference; every change is shared code so the browser build keeps working. Regression tests to add: bill-number format and per-day sequencing, duplicate-checkout idempotency, loader state transitions, PO edit stock delta, and schema-cache retry.
- Cloud migration required for the two unique indexes on `sales`; it will be presented for approval before any code depends on it.
