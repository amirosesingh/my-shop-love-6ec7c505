# Enterprise suite: local hardware lock, branch telemetry, analytics, roles and layout

## Audit findings (what already exists)

- Offline queue: `src/lib/sync-outbox.ts` holds every write as a queued op with status, attempts, branch and terminal stamps, plus a last-synced timestamp. `src/lib/db-router.ts` / `pos-db.ts` route reads and writes; `db-mode.ts` tracks online / local / failover.
- Telemetry parts exist but are scattered: `sync_metadata`, `terminal_tokens.last_seen_at`, `shift_sessions` (active staff per terminal), `offline_sync_audit_log`. There is no single admin view and no remote command channel.
- Hardware: `src/lib/receipt-printer.ts` keeps printer prefs in terminal `localStorage` only and talks to the Electron bridge for silent print and drawer pulse. No COM port or serial scale support yet, and no explicit "local only" lock/notice.
- Manager overrides: `src/lib/manager-gate.tsx` + `ManagerOverrideDialog.tsx` already exist; `src/components/admin/RoleManager.tsx` and `staff_roles` already provide custom roles. These need extending, not rebuilding.
- Reporting: `/reports` hub plus sales, items, payments, voids pages exist; profitability, inventory aging, cashier commissions and tender reconciliation are missing as dedicated views.
- Bookings: the general/racket booking refactor from the previous round is already in place (deposit breakdown, T&C gate, single-column racket intake, tabbed manage screen). Remaining gap: block "Collected" while a balance is due.

## What will be built

### 1. Local-only hardware lock (`/settings/hardware`)
- New Hardware page holding printer choice, print mode, drawer pin, COM port + baud rate, and serial scale settings — all stored on the terminal only, never in the cloud tables.
- The page reads as disabled with a clear notice on web/mobile: hardware is configurable only on the physical till.
- Remove hardware fields from any centrally-synced settings payload so an admin cannot push them remotely; the admin panel shows current hardware read-only.

### 2. Branch telemetry centre (`/admin/branch-telemetry`, read-only)
- One row per terminal: branch, device, database state (Online / Offline / Local storage active), pending unsynced count, last successful sync, storage engine (SQLite / IndexedDB / PWA), connection health and the signed-in cashier.
- Terminals publish a heartbeat with those counters on a timer and on sync events, into a new `branch_telemetry` table.
- Admin view is strictly read-only: no editing of any terminal setting from here.

### 3. Remote data commands with sync-priority guard
- New `terminal_commands` table; admin can queue `sync_now` and `refresh_catalog` for a terminal or a whole branch.
- The till polls with its heartbeat; before running any command it first drains the offline outbox to completion. If unsynced work remains or fails, the command stays pending and the reason is reported back — never a cache refresh over unsynced sales.

### 4. Retail analytics engine (under `/reports`)
- Profitability: COGS, net revenue, gross margin %, profit per SKU and category.
- Inventory velocity: turnover, top sellers, dead stock over 60 days, reorder forecast.
- Cashier performance: sales totals, average basket, voids, commission ledger with a configurable rate.
- Tender reconciliation: daily closure split across cash, card, transfer, vouchers and booking deposits.

### 5. Roles, PIN overrides and audit
- `/settings/staff-roles` gains a full permission matrix (voids, refunds, stock adjustments, report viewing, drawer, discount ceiling) on top of the existing role registry.
- `ManagerPinModal` reuses the existing manager gate and is wired to: discounts above the configured threshold, no-sale drawer kick, item void / cart cancel, and manual stock adjustment. Every approval and rejection writes to `audit_logs`.

### 6. Flexible layouts and unified settings cards
- Replace fixed `max-w-4xl` / `max-w-5xl` / hardcoded widths in the register, customer display, inventory and purchasing screens with fluid full-width grids.
- All settings pages adopt the Data & Sync card/tab shell so Receipt & Printer, Payment Methods, Integrations and Company Profile look and behave identically.

### 7. Integrations, branding and clusters
- Communications manager for WhatsApp Cloud API and SMS gateway: encrypted token storage plus a Test Connection button.
- Cluster rules for private catalog, private stock and branch price overrides; multi-company tenant switcher broadcast to other terminals.
- PNG logo upload used on receipts and on the customer display (idle hero and blurred watermark during a sale).

### 8. Transaction safety
- Confirm the checkout path never opens the drawer or prints before the sale write is confirmed, and that a retried checkout cannot mint a second bill number.
- Government voucher tenders require a serial number, stored in the payment metadata.
- Racket bookings cannot be marked Collected while a balance is outstanding.

## Technical notes

- One migration `supabase/migrations/20260816230000_enterprise_local_hardware_telemetry.sql` creating `branch_telemetry` and `terminal_commands` (grants, RLS, staff-write / admin-read policies, updated_at triggers) and extending `audit_logs`, `staff_roles` and `payment_types` where needed. `supabase/online_schema_fix_latest.sql` is refreshed to match.
- New modules: `src/lib/hardware-prefs.ts`, `src/lib/telemetry.ts` (+ `telemetry.functions.ts`), `src/lib/terminal-commands.ts`, `src/lib/reports-analytics.ts`, `src/components/pos/ManagerPinModal.tsx`, routes `settings.hardware.tsx`, `admin.branch-telemetry.tsx`, `settings.staff-roles.tsx` and four new report routes.
- Analytics aggregate in SQL views so no report pulls raw sale lines into the till.

## Delivery order

Phases 1-3 (hardware lock, telemetry, commands) first, then 4-5 (analytics, roles/PIN), then 6-8 (layout, integrations, safety). Each stage lands working before the next begins.
