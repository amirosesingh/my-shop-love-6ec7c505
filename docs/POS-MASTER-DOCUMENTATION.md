# POS Software — Complete Technical Architecture, Codebase & Maintenance Documentation

| Field | Value |
| --- | --- |
| Project name | Lovable POS (package `tanstack_start_ts`, desktop product name `LovablePOS`) |
| Documentation version | 1.0 |
| Date of audit | 2026-08-20 |
| Application version at audit | 1.3.13 (`src/version.ts`, `package.json`) |
| Technology stack | React 19 · TanStack Start/Router v1 · Vite 7 · Tailwind v4 · Supabase (Postgres) · Electron + MS SQL Server + SQLite · Capacitor (Android) |
| Documentation status | CONFIRMED for everything marked as such; audit is read-only — no code was changed |
| Verification | 15 test files / 107 tests passing at time of audit |

## How to read the classification tags

| Tag | Meaning |
| --- | --- |
| **CONFIRMED** | Verified directly in the code or by querying the live database during this audit |
| **PARTIAL** | Implementation exists but is incomplete or has an unimplemented dependency |
| **NOT IMPLEMENTED** | Searched for and not present |
| **UNKNOWN** | Cannot be determined from the repository (runtime/native/host-dependent) |

This is the single master reference. All future changes update **this file** — do not create new documentation files.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Technology Stack](#2-technology-stack)
3. [Project Structure](#3-project-structure)
4. [Architecture](#4-architecture)
5. [Module Documentation](#5-module-documentation)
6. [File-by-File Documentation](#6-file-by-file-documentation)
7. [Feature Documentation](#7-feature-documentation)
8. [Frontend](#8-frontend)
9. [Backend](#9-backend)
10. [API](#10-api)
11. [Database](#11-database)
12. [Authentication](#12-authentication)
13. [POS / Register](#13-pos--register)
14. [Inventory](#14-inventory)
15. [Products](#15-products)
16. [Customers / Members](#16-customers--members)
17. [Suppliers](#17-suppliers)
18. [Purchasing](#18-purchasing)
19. [Payments](#19-payments)
20. [Refunds / Returns / Exchanges](#20-refunds--returns--exchanges)
21. [Receipts / Printing / Hardware](#21-receipts--printing--hardware)
22. [Reports](#22-reports)
23. [Settings](#23-settings)
24. [Business Rules](#24-business-rules)
25. [State Management](#25-state-management)
26. [Dependencies](#26-dependencies)
27. [Function Index](#27-function-index)
28. [Database Query Index](#28-database-query-index)
29. [Error Handling](#29-error-handling)
30. [Security Audit](#30-security-audit)
31. [Performance Audit](#31-performance-audit)
32. [Code Quality / Technical Debt](#32-code-quality--technical-debt)
33. [Bugs / Risks](#33-bugs--risks)
34. [Missing Features](#34-missing-features)
35. [Change Impact Analysis](#35-change-impact-analysis)
36. [Testing](#36-testing)
37. [Troubleshooting](#37-troubleshooting)
38. [Safe Modification Guide](#38-safe-modification-guide)
39. [Master Module Index](#39-master-module-index)
40. [Master File Index](#40-master-file-index)
41. [Master Database Index](#41-master-database-index)
42. [Architecture Diagrams](#42-architecture-diagrams)
43. [Where Do I Look?](#43-where-do-i-look)
44. [Future Maintenance Rule](#44-future-maintenance-rule)
45. [Final Audit Summary](#45-final-audit-summary)

---

## 1. Executive Summary

**CONFIRMED.** The product is a multi-branch, offline-capable retail POS with a racket-service (job card) vertical, shipped in three shells from one codebase:

- **Web** (TanStack Start SSR app served from the edge worker) — full back office and register.
- **Windows desktop** (Electron) — same UI plus a local MS SQL Server operational database, an embedded SQLite mirror/outbox, silent ESC/POS printing and cash-drawer kick.
- **Android** (Capacitor) — live-only terminal (`isLiveOnly()`), camera barcode scanning, APK OTA updates.

Scale at audit: 92,344 lines across `src/` + `electron/`, 83 route files, ~150 components, 175 modules in `src/lib`, 52 Postgres tables, 3 views, ~80 database functions, 15 test files (107 tests, all passing).

Key architectural decisions found in the code:

1. **One write gateway.** Every write goes through `dbRouter.write` → `commitOps` (`src/lib/pos-db.ts:1315`), which resolves only when the data is durable somewhere (cloud, local SQL, or outbox).
2. **Relative stock, never absolute over the wire.** `withRelativeStock()` strips stock columns from product upserts and replays them as idempotent `stock_apply_delta` movements keyed on the movement id.
3. **Server-side authority.** Manager PIN checks, cashier sign-in, staff provisioning and the sync relay run in server functions / server routes with a service key that never reaches the browser (`src/lib/pos-relay.server.ts`, `relay-policy.server.ts`).
4. **Branch isolation everywhere.** RLS uses `is_staff_now()` + `store_visible()` / `user_has_store_access()`; the relay re-resolves the caller's branch server-side on every request.

The two most significant findings of this audit are in [§33 Bugs / Risks](#33-bugs--risks): the **POS rules / manager-override RPCs and the `pos_store_settings` table do not exist in the database**, and **`product_delete_guard` does not exist**, so those features silently degrade to defaults.

---

## 2. Technology Stack

**CONFIRMED** from `package.json`, `vite.config.ts`, `capacitor.config.ts`, `wrangler.jsonc`.

| Layer | Technology |
| --- | --- |
| UI | React 19.2, Tailwind CSS v4 (`src/styles.css`), shadcn/Radix primitives (`src/components/ui/*`), lucide-react icons, recharts |
| Routing / SSR | `@tanstack/react-router` 1.170, `@tanstack/react-start` 1.168, generated `src/routeTree.gen.ts` |
| Server runtime | Cloudflare Worker (`wrangler.jsonc`), TanStack server functions + file-route `server.handlers` |
| Data (central) | Supabase Postgres, `@supabase/supabase-js` 2.111 |
| Data (desktop) | MS SQL Server via `mssql` 11 (`electron/db/pool.cjs`), SQLite mirror (`electron/db/sqlite.cjs`) |
| Desktop shell | Electron + `electron-updater`, `electron-builder`/`electron-packager` |
| Mobile shell | Capacitor 8 (`@capacitor-mlkit/barcode-scanning`, `filesystem`, `preferences`, `file-opener`) |
| Forms / validation | react-hook-form, `@hookform/resolvers`, zod |
| Layout editor | `react-grid-layout` 2.2 |
| Barcodes / QR | `html5-qrcode`, `qrcode-generator`, in-house `barcodeSvg`/`qrSvg` in `src/lib/pos-print.ts` |
| Tests | Vitest (`vitest.config.ts`), 15 suites |
| Tooling | ESLint 9 flat config, Prettier, `scripts/logic-scan.cjs`, `scripts/bump-version.cjs` |

---

## 3. Project Structure

**CONFIRMED** (actual tree, abbreviated at leaf level):

```text
/
├── src/
│   ├── routes/                 83 route files (file-based routing)
│   │   ├── __root.tsx          providers, head, error/404, boot gates
│   │   ├── index.tsx           the Register (4,156 lines — largest file)
│   │   ├── api/                server routes (HTTP)
│   │   │   ├── public/         unauthenticated endpoints (sync, cashier-login, health…)
│   │   │   ├── settings*.ts    scoped settings read/write/sync-batch
│   │   │   └── v1/pos/sync.ts  canonical write relay
│   │   ├── reports.*.tsx       12 report screens
│   │   └── settings.*.tsx      40 settings screens
│   ├── components/
│   │   ├── pos/                ~75 POS components (+ layout/, settings/, sync/, booking/)
│   │   ├── admin/              StaffManager, RoleManager
│   │   ├── auth/               CashierPinLogin
│   │   ├── database/           SSMS-style explorer + connection wizard
│   │   ├── mobile/             OfflineGate
│   │   └── ui/                 47 shadcn primitives
│   ├── lib/                    175 modules: domain logic, server fns, hooks, adapters
│   │   └── __tests__/          15 vitest suites
│   ├── integrations/supabase/  generated client, admin client, auth middleware/attachers, types
│   ├── utils/syncResolver.ts
│   ├── start.ts                middleware registration (CSRF, auth attachers, session expiry)
│   ├── router.tsx  server.ts   router + worker entry
│   └── styles.css              Tailwind v4 theme tokens
├── electron/
│   ├── main.cjs (1,159)        window, IPC, printing, updates, sync worker boot
│   ├── preload.cjs             the only renderer surface: window.pos / electronAPI / sqlAdmin
│   ├── db/
│   │   ├── pool.cjs (716)      operational MS SQL pool + connection ladder
│   │   ├── admin-pool.cjs      separate SSMS-style admin pool (cancellable)
│   │   ├── repo.cjs (737)      table-generic upsert/update/delete, outbox, watermarks
│   │   ├── sqlite.cjs (628)    embedded mirror + queue + audit ledger
│   │   ├── discover.cjs        instance discovery (registry + UDP browser + loopback)
│   │   └── offline_sqlite_v2.sql   40 mirror tables
│   ├── sync/worker.cjs         background push/pull
│   ├── *-store.cjs             encrypted config/branding/db-config/terminal stores
│   ├── health.cjs recovery.*   boot health, safe mode, rollback
│   └── updater.cjs             electron-updater wiring
├── capacitor-shell/  capacitor.config.ts  scripts/  .github/workflows/
├── db/offline/                 SQL for offline sync metadata
├── docs/                       this file + operational guides
└── supabase/config.toml
```

Folder responsibilities:

| Folder | Purpose | Depends on | Depended on by |
| --- | --- | --- | --- |
| `src/routes` | Screens + HTTP endpoints | `src/lib`, `src/components` | router (generated tree) |
| `src/lib` | All domain logic, no JSX except providers | supabase client, electron bridges | routes, components |
| `src/lib/*.server.ts` | Server-only; may read `process.env` | service key, node:crypto | `*.functions.ts`, api routes |
| `src/lib/*.functions.ts` | `createServerFn` RPC wrappers (client-safe imports) | `*.server.ts` (dynamic) | components/routes |
| `src/components/pos` | POS-specific UI | `src/lib` | routes |
| `electron/` | Desktop main process; no React | mssql, sqlite, electron | renderer via preload |

---

## 4. Architecture

### 4.1 High level

```text
                    ┌──────────────────────── Clients ────────────────────────┐
                    │  Browser (SSR)   Electron/Windows      Android/Capacitor │
                    └───────┬───────────────┬────────────────────┬────────────┘
                            │               │                    │
                     React 19 UI (identical route tree, platform gates)
                            │               │                    │
                 ┌──────────▼───────────────▼────────────────────▼──────────┐
                 │ src/lib/db-router.ts  →  pos-db.commitOps (single gate)  │
                 └──────┬───────────────┬────────────────────────┬──────────┘
                        │               │                        │
              supabase-js (RLS)   window.pos (IPC)          outbox (queued)
                        │               │                        │
        ┌───────────────▼───┐  ┌────────▼─────────┐   ┌──────────▼─────────┐
        │ Supabase Postgres │  │ MS SQL (branch)  │   │ localStorage/SQLite│
        │  + RPC + RLS      │  │ + SQLite mirror  │   │  retry with backoff│
        └───────────────────┘  └──────────────────┘   └────────────────────┘
                 ▲                       │
                 └── /api/v1/pos/sync ───┘  (service-key relay, server-verified caller)
```

### 4.2 Data flow (write)

`UI action → domain helper in src/lib → dbRouter.insert/upsert/update → commitOps(context, ops)`
→ `hydrateTerminalConfig()` → `withRelativeStock()` → platform branch:

| Platform | Order of attempts | Fallback |
| --- | --- | --- |
| Android (`isLiveOnly()`) | cloud only | throws `AllTargetsFailed` |
| Electron with local bridge | cloud first, mirror to local in background | on **connection-class** failure only → local SQL write → `"local"` |
| Browser | cloud only | throws `AllTargetsFailed`; nothing business-critical parked in browser storage |

Validation/permission errors are re-thrown, never swallowed into the offline path (`pos-db.ts:1353`). **CONFIRMED.**

### 4.3 Read flow

`dbRouter.query(table, options)` → `routedQueryWithSource` (`src/lib/db-query.ts`): central first when online and the device prefers cloud, otherwise the local mirror; the source is surfaced to the UI (`OfflineDataNotice`, `SystemStatusPill`).

### 4.4 Auth flow

```text
Supervisor/office:  Supabase email+password  → session JWT → RLS as authenticated
Till staff (PIN):   CashierPinLogin → POST /api/public/cashier-login
                     → cashierLoginServer (service key) → verify_terminal_pin RPC
                     → signed cashier session token (HMAC, session-token.server.ts)
                     → attached as bearer on /api/v1/pos/sync
Terminal device:    activation token (AES-256-GCM, terminal-crypto.ts)
                     → terminal_token_claim / heartbeat → kill switch on revoke
```

### 4.5 Sale flow

See [§7](#7-feature-documentation) and [§13](#13-pos--register).

---

## 5. Module Documentation

| Module | UI entry | Core files | Tables | Key permissions |
| --- | --- | --- | --- | --- |
| Register / Sale | `/` (`src/routes/index.tsx`) | `pos-store.tsx`, `pos-types.ts`, `pos-db.ts`, `pos-print.ts`, `pos-promotions.ts` | sales, sale_items, payment_transactions, item_activity_logs, products, members | `can_process_sale`, `can_give_discount`, `can_void_item` |
| Shifts / Drawer | `/shifts` | `shift-close.ts`, `shift-hours.ts`, `shift-sessions.ts`, `shift-alerts.ts`, `drawer-events.ts` | shifts, shift_sessions, drawer_events | `can_open_shift`, `can_close_shift`, `can_no_sale_open` |
| Inventory | `/inventory`, `/inventory-hub`, `/stock-operations` | `locations.ts`, `product-lookup.ts`, `sku.ts`, `catalog-meta.ts` | products, item_activity_logs, stock_adjustments, product_barcodes | `can_view_inventory`, `can_adjust_stock` |
| Transfers | `/transfers` | `stock-transfers.ts` | stock_transfers, stock_transfer_items | `can_create_transfer`, `can_receive_transfer`, `can_approve_transfer` |
| Purchasing | `/purchasing`, `/suppliers` | `suppliers.ts`, `pos-db.ts` (PO helpers) | purchase_orders, purchase_order_items, suppliers | `can_receive_purchase_order` |
| Members / Loyalty | `/members`, `/customers`, `/join` | `pos-promotions.ts`, `verification.functions.ts` | members, membership_tiers, member_verifications | `can_add_member`, `can_edit_member_points` |
| Coupons / Vouchers | `/coupons`, `/claim/$slug`, `/c/$token` | `coupons.ts`, `coupon-hosts.ts`, `public-flags.ts` | coupon_campaigns, issued_vouchers, coupon_events | `can_manage_promotions` |
| Bookings / Racket service | `/bookings`, `/pos/racket-service`, `/pos/general-booking` | `bookings-db.ts`, `booking-charges.ts` | bookings, booking_payments | `can_manage_bookings`, `can_collect_booking` |
| Payments | checkout + `/settings/payment-methods` | `payment-types.ts`, `pos-types.ts` (`validateTenders`), `TenderSplit.tsx` | payment_types, payment_transactions | `can_edit_tenders` |
| Printing / Hardware | everywhere | `pos-print.ts`, `escpos.ts`, `receipt-printer.ts`, `receipt-template.ts`, `customer-display.ts` | pos_settings (receipt design) | — |
| Reports | `/reports/*`, `/analytics`, `/dashboard` | `sales-analytics.ts`, `analytics-board.ts`, `profit.ts`, `report-kit.tsx` | sales, sale_items, views | `can_view_sales_reports`, `can_export_reports` |
| Settings | `/settings/*` (40 screens) | `settings-catalog.tsx`, `settings-scope.*`, `settings-sections.ts`, `branch-settings.ts` | pos_settings, settings_overrides, settings_locks, secure_settings | `can_access_pos_settings` |
| Staff / RBAC | `/staff`, `/admin` | `permissions.ts`, `staff-admin.*`, `staff-roles.ts`, `pos-auth.tsx`, `pos-permissions.tsx` | app_users, user_roles, staff_roles, cashiers | `can_manage_staff` |
| Terminals | `/settings/terminals`, `/settings/mobile-terminals` | `terminal-tokens.ts`, `terminal-crypto.ts`, `terminal-commands.ts` | terminal_tokens, terminal_commands, branch_telemetry | `can_manage_terminals` |
| Sync & Health | `/settings/sync`, `/settings/data-sync`, `/settings/diagnostics` | `sync-engine.ts`, `sync-outbox.ts`, `sync-relay.ts`, `db-health.ts`, `health-scan.ts`, `feature-schema.ts` | sync_metadata, offline_sync_audit_log | `can_manage_sync_backup` |
| Audit | `/audit`, `/reports/activity` | `audit-log.ts`, `activity-events.ts`, `system-audit.*`, `ticket-audit.ts` | audit_logs, activity_events, system_audit_logs, item_activity_logs | `can_view_audit_trail` |
| Local database (desktop) | `/settings/database-explorer` | `sql-admin.ts`, `local-db.ts`, `DatabaseExplorer.tsx`, `SqlConnectionModal.tsx` | MS SQL (external) | admin only |

---

## 6. File-by-File Documentation

Deep entries for the load-bearing files; every remaining file is listed with purpose in [§40](#40-master-file-index).

### `src/lib/pos-db.ts` (2,002 lines) — cloud data access + commit gateway
- **Type:** TypeScript service module. **CONFIRMED.**
- **Purpose:** Row↔domain mappers, cloud loaders, and the single commit path.
- **Key functions:**
  - `rowToProduct(r)` / `productToRow(p)`, `rowToStore` / `storeToRow` — mapping between snake_case DB rows and camelCase domain types.
  - `loadCloudState(): Promise<CloudSlice>` — bulk hydrate products, stores, members, promotions, settings on boot.
  - `loadActiveShift(storeId)` / `openShiftOnServer(shift)` — use `shift_active_for_branch` and `shift_open` RPCs.
  - `loadSalesPage`, `loadShiftSessions`, `loadReceivingInvoices`, `invoiceNumberTaken`, `loadProductsByIds` — paged/filtered reads.
  - `withRelativeStock(ops)` *(private)* — removes `stock_quantity`/`stock_by_store` from product writes when movement rows are present.
  - `applyStockDeltas(deltas)` *(private)* — calls `stock_apply_delta` RPC per movement; failures are logged to the sync log, never thrown.
  - `commitOps(context, ops): Promise<CommitTarget>` — **the** write gateway (see §4.2).
  - `mirrorToLocal(context, ops)` — background copy to the desktop database; failures only logged.
  - `db.commitSale(sale, products, member)` — idempotency check via `saleAttemptExists(clientTxnId)`, then builds the op batch: sales → sale_items → payment_transactions → item_activity_logs → products → members → exchange back-link.
  - `db.commitShift`, `db.shiftExists`, `db.commitDrawerEvent`, `db.commitShiftSession`, `db.commitProducts`, `db.commitMember`, `db.commitProduct`, `db.commitPromotion`, `db.commitHeldOrder`, PO helpers.
- **Depends on:** `@/integrations/supabase/client`, `sync-engine.runOpLive`, `sync-outbox`, `db-mode`, `local-db`, `live-mode`, `pos-auth-route`, `terminal-tokens`.
- **Used by:** `db-router.ts`, `pos-store.tsx`, most routes.
- **Modification risk:** **CRITICAL.** Any change to `commitOps` affects every write in the product — offline durability, double-charge protection and stock correctness all live here.

### `src/lib/pos-store.tsx` (2,165 lines) — global POS state
- **Type:** React context provider. **CONFIRMED.**
- **Purpose:** Holds `PosState` (products, stores, members, cart, shifts, bookings, transfers, settings), persists to `localStorage` key `pos-state-v2`, merges cloud slices, exposes ~100 actions.
- **Key exports:** `PosProvider`, `usePos()`, `usePosOptional()`, `stockAt`, `reservedAt`, `availableAt`, `cartTotals`, `money`, `NewBooking`, `NewBookingJob`.
- **Notable internals:** `applyCloud(state, cloud)` merge, `bump(product, storeId, delta)` per-branch stock adjust, terminal-bound branch resolution (`terminal.locationId` wins over `state.currentStoreId`), resume/pull timers.
- **Modification risk:** **CRITICAL** — every screen consumes it; state-shape changes require a migration of the persisted key.

### `src/routes/index.tsx` (4,156 lines) — the Register
- **Type:** Route component `Register()`. **CONFIRMED.**
- **Purpose:** Scanning, cart, discounts, member attach, promotions, split tender, checkout, hold/recall, exchange, booking intake, receipt/print triggers, drawer kick, customizable layout host.
- **Risk:** **CRITICAL and oversized** — see [§32](#32-code-quality--technical-debt).

### `src/lib/pos-types.ts` (1,035 lines) — domain types + pure money rules
- `r2(n)` — 2-dp rounding used by every money calculation.
- `lineUnitDiscount(line)` — percent or amount, per unit.
- `paymentsTotal`, `validateTenders(total, tenders)` — tender validation rules (see §24).
- `bookingBalance`, `racketSummary`, `resolvePaymentQr`, `whatsappLink`, `bookingRulesOf`, plus every settings/booking/receipt type.
- **Risk:** HIGH — shared by UI, DB mappers and tests.

### `src/lib/permissions.ts` (560 lines) — RBAC catalogue
- 7 permission groups / ~50 keys, role presets (`cashier`, `warehouse`, `supervisor`, `admin`), `resolvePermission`, `normalizePermissions`, `hasPermission/hasAnyPermission/hasAllPermissions`, `getEffectivePermissions`, custom-role cache, permission tags.
- **Risk:** HIGH — mirrored by DB triggers `enforce_*_permissions`; changing a key name here without the DB desynchronises enforcement.

### `src/lib/pos-auth.tsx` (905 lines) — authentication context
- `AuthProvider`, `useAuth()`, `useAuthOptional()`; models `PosUser`, `StaffMember`, `TerminalUser`, `AppUserProfile`; handles Supabase session, PIN sessions, terminal sessions, revocation checks, sign-out.

### `src/lib/sync-engine.ts` (714 lines) — background convergence
- `runOpLive(context, op)` — one op against the cloud; routes through the relay when the table is relay-preferred or a direct write was refused.
- `drainOutbox()` — ordered push with backoff, quarantine after `MAX_ATTEMPTS`; skipped when offline, disabled, or terminal revoked.
- `pullDelta()` — watermark-based pull per table into memory/mirror.
- `pushLocalPending()` / `pullIntoLocal()` — desktop mirror convergence.
- `runExclusive(reason)`, `startSyncEngine()` — 15s loop, single-flight.

### `src/lib/relay-policy.server.ts` (540 lines) — server-side authorisation for the relay
- `resolveRelayScope(caller)` → `RelayScope` (branch, role, permissions, supervisor flag).
- `authorizeRelayOp(op, scope, batchIds)` → allow/deny with codes `STORE_FORBIDDEN`, `PERMISSION_DENIED`, `SCOPE_MISSING`, `SCOPE_STALE`.
- `RELAY_WRITABLE_TABLES` whitelist; `batchInsertIds(ops)` lets child rows through for parents created in the same push.

### `src/lib/pos-relay.server.ts` (323 lines) — service-key REST relay
- `serviceKey()`, `hasServiceKey()`, `serviceRest(path, init)`, `runRelayOp`, `runRelayRead`, `verifyRelayCaller(body)`.

### `src/lib/sync-endpoint.server.ts` (185 lines) — the sync handler
- Zod-validated body, bearer promotion, service-key presence check (503 `NO_SERVICE_KEY`), caller verification + branch existence, per-op authorisation, structured refusal logging that never logs tokens or row contents.

### `electron/db/pool.cjs` (716) / `admin-pool.cjs` (491)
- Connection ladder with `LADDER_BUDGET_MS` (25s) and `ATTEMPT_TIMEOUT_MS` (8s), failure `stage` tracking (`port|instance_lookup|driver|tls|login|database|write`), advisory-only TCP probe for named instances, `verifyWrite()` rollback probe, cancellable admin handshake with a 30s hard release.

### `electron/db/repo.cjs` (737)
- Table-generic `upsertRow/updateRows/deleteRows/applyOp` with column caching and `assertTable` whitelisting; outbox (`pendingRows`, `markSynced`, `markFailed`, `retryErrored`, `retryRow`, `discardRow`, `queueRows`); `mergeFromCloud`; watermarks (`getWatermark`/`setWatermark`); `createSale` transactional path; `housekeep({retentionDays})`.

### `electron/preload.cjs`
- The complete renderer surface: `window.pos` (writes, connect/test/reset, schema, scan, print/printRaw/listPrinters, push/pull, backup, queue controls, updates, terminal config, settings, config store, local mirror + audit, branding, window controls, health), `window.electronAPI` (createSale, getProducts, pending count, branch), `window.sqlAdmin` (connect, cancel, probePort, lock, databases, tables, columns, query, disconnect, status).

---

## 7. Feature Documentation

### 7.1 Create sale (CONFIRMED)

```text
Register screen  src/routes/index.tsx (Register)
  ↓ scan / search       ScanBar.tsx · ProductSearchDialog.tsx · product-lookup.ts (resolveByBarcode)
  ↓ add line            usePos().addLine  (src/lib/pos-store.tsx)
  ↓ qty / discount      DiscountPad.tsx → lineUnitDiscount() → cartTotals()
  ↓ member attach       QuickMemberDialog.tsx → members
  ↓ promotions          pos-promotions.evaluatePromotions()
  ↓ tender              TenderSplit.tsx → validateTenders(total, tenders)
  ↓ gates               manager-gate.tsx → pos-rules.functions.verifyManagerPin (see §33 R-01)
  ↓ commit              db.commitSale() → commitOps()
        ├── sales                (insert, client_transaction_id idempotency)
        ├── sale_items           (insert)
        ├── payment_transactions (insert, one row per tender)
        ├── item_activity_logs   (insert → stock_apply_delta RPC)
        ├── products             (upsert without stock columns)
        └── members              (upsert points/total_spent)
  ↓ receipt             pos-print.printSaleReceipt() → escpos / silentPrint
  ↓ drawer              pos-print.openCashDrawer() → receipt-printer.rawPulse()
  ↓ display             customer-display.publishDisplay()
  ↓ WhatsApp (opt)      whatsapp.sendBillOnWhatsApp() / whatsapp-queue
  ↓ UI                  cart cleared, bill number advanced (bill-number.nextBillNumber)
```

### 7.2 Open / close shift (CONFIRMED)

```text
/shifts → ShiftGuard.tsx → openShiftOnServer() [RPC shift_open] → db.shiftExists() confirm
   ↓ selling gated by ShiftGuard while no active shift (can_bypass_shift_lock exempts)
close → shift-close.reconcileShift(shift, sales, counted)
   ↓ expectedDrawer = opening_float + cash sales; variance per tender
   ↓ variance over threshold → varianceNeedsPin → manager gate
   ↓ db.commitShift() → shifts row (counted_*, expected_*, variance_*)
   ↓ printShiftReport() (X/Z report)
```

### 7.3 Stock movement (CONFIRMED)

Every quantity change writes an `item_activity_logs` row (`quantity_delta`, `stock_before`, `stock_after`, actor) and the central figure is applied by `stock_apply_delta(_movement_id,...)`, which records the movement in `stock_delta_applied` so a replay cannot deduct twice.

### 7.4 Purchase receiving, transfers, bookings, coupons

| Feature | Path |
| --- | --- |
| Receive PO | `/purchasing` → `pos-db` PO helpers → `purchase_orders` + `purchase_order_items` + product cost/stock update + `item_activity_logs` |
| Transfer | `/transfers` → `stock-transfers.saveTransfer/setTransferStatus/receiveTransferInDb` → RPC `stock_transfer_receive` (deducts source, adds destination) |
| Booking | `/bookings`, `/pos/racket-service` → `bookings-db.commitBooking` → `bookings` (+ `booking_payments`, guarded by trigger `booking_payment_within_total`) |
| Coupon claim | `/claim/$campaignSlug` → RPC `coupon_claim` → `issued_vouchers` + `coupon_events`; redeem at `/c/$tokenSlug` → RPC `voucher_redeem` |

---

## 8. Frontend

- **Routing:** file-based; `__root.tsx` composes `ThemeProvider → PosProvider → AuthProvider → PermissionsProvider → PosRulesProvider → ManagerGateProvider` plus `Toaster`, `ErrorNotifier`, `AuditTracker`, `TelemetryAgent`, `TerminalActivation`, `FirstRunSetup`, `NativeBoot`, `OfflineGate`, `AndroidUpdateBanner`.
- **Shell:** `AppShell.tsx` (header with clock, sync badge, activity bell, security bell, update button, settings gear, window controls), `SidebarNav.tsx` + `nav-config.ts`, `SectionHub.tsx`.
- **Visibility:** `ui-visibility.ts` maps roles → routes/elements (`isRouteVisibleFor`, `useVisibility`); `PermissionGate.tsx` wraps privileged UI.
- **Register layout editor:** `register-layout.ts` + `RegisterWorkspace.tsx` + `FeaturePalette.tsx` — drag/drop grid, custom buttons, canvas aspect, per-platform persisted layouts.
- **Design system:** Tailwind v4 tokens in `src/styles.css`; theme in `theme.tsx` with `themeBootScript`; accent presets in `accent.ts`; UI scale/density in `use-ui-scale.ts`.

---

## 9. Backend

Three backend surfaces. **CONFIRMED.**

1. **Server functions** (`src/lib/*.functions.ts`, `createServerFn`): activity events, idle timeout, POS rules, POS session issuance, secure settings, session verification, scoped settings, staff admin, system audit, terminal account, user sessions, verification (OTP), WhatsApp.
2. **Server routes** (`src/routes/api/**`): see §10.
3. **Electron main process**: IPC handlers listed in §6 (`preload.cjs`).

Server-only helpers (`*.server.ts`) read `process.env` inside handlers only: `POS_SUPABASE_SERVICE_ROLE_KEY`, `SETTINGS_ENCRYPTION_KEY`, `POS_SUPABASE_URL`, `POS_SUPABASE_PUBLISHABLE_KEY` (documented in `docs/secrets.md`).

Middleware (`src/start.ts`): `attachSupabaseAuth`, `attachExternalSupabaseAuth`, `sessionExpiryMiddleware` (function middleware); `errorMiddleware`, `createCsrfMiddleware` filtered to `serverFn` (request middleware).

---

## 10. API

| Endpoint | Method | Auth | Purpose | DB impact |
| --- | --- | --- | --- | --- |
| `/api/v1/pos/sync` | POST | signed cashier session / terminal token / staff access token (bearer or body) | Canonical write relay + reads (`activeShift`, `stores`) | Any table in `RELAY_WRITABLE_TABLES`, scope-filtered |
| `/api/public/sync` | POST | same | Legacy path for shipped tills; identical handler | same |
| `/api/public/cashier-login` | POST | none (PIN is the credential) | Username+PIN sign-in, returns signed session | reads `app_users` via `verify_terminal_pin` |
| `/api/cashier-login` | POST | none | Authenticated-origin variant of the same handler | same |
| `/api/public/terminal-staff` | POST/GET | terminal token | Staff list for the till login screen (`terminal_staff_list`) | read-only |
| `/api/public/sync-health` | GET | none | Relay reachability / service-key presence | none |
| `/api/public/health-metadata` | GET | none | Build/version metadata for health checks | none |
| `/api/public/security-alerts` | POST | shared verification inside handler | Ingest scanner findings (`security_report_findings`) | `security_findings` |
| `/api/settings` | GET | staff session | Read scoped settings | `pos_settings`, `settings_overrides` |
| `/api/settings/upsert` | POST | staff session | Write one scoped setting | same |
| `/api/settings/sync-batch` | POST | staff session | Batch push of settings | same |

Failure codes returned by the relay: `NO_SERVICE_KEY` (503), `SESSION_INVALID` (401), `BRANCH_MISSING` (401), `STORE_FORBIDDEN` / `PERMISSION_DENIED` / `SCOPE_MISSING` / `SCOPE_STALE` (403).

---

## 11. Database

### 11.1 Tables (52) — **CONFIRMED** via live schema query

| Table | Purpose | Notable columns | FKs |
| --- | --- | --- | --- |
| `products` | Catalogue + per-branch stock | `stock_by_store jsonb`, `barcode_variants jsonb`, `packs jsonb`, `is_archived`, `row_version` | — |
| `product_barcodes` | Alternate barcodes | `product_id`, `code` | → products |
| `product_categories` | Category tree | `parent_id` | → self |
| `uom_units` | Units of measure | `allows_decimal` | — |
| `sales` | Bill header | `bill_number`, `client_transaction_id` (idempotency), `payments jsonb`, `store_*_snapshot`, exchange fields | → members |
| `sale_items` | Bill lines | `unit_price`, `discount_*`, `is_return`, `is_foc`, `unit_cost` | → sales, products |
| `payment_transactions` | Tender ledger (sales + bookings) | `source_type`, `method`, `kind`, `reference`, `status` | → sales, bookings, members |
| `payment_types` | Configurable tenders | `type_code`, `requires_reference`, `is_system` | — |
| `members` | Membership | `member_code`, `loyalty_points`, `total_spent`, `is_verified` | → membership_tiers |
| `membership_tiers` | Tiers | rates | — |
| `member_verifications` | OTP log | channel, status | → members |
| `stores` | Branch/location hierarchy | `location_type`, `parent_id`, `is_central`, `is_primary_sub` | → self |
| `shifts` | Shift header | opening/closing float, `counted_*`, `expected_*`, `variance_*` | — |
| `shift_sessions` | Staff sign-in within a shift | signed_in/out | — |
| `drawer_events` | No-sale / drawer opens | `reason`, `approved_by` | — |
| `held_orders` | Parked tickets | `lines jsonb`, `cancelled_from` | — |
| `bookings` | Bookings + racket job cards | 48 cols: service, tension, `job_status`, `charges jsonb`, liability | → members |
| `booking_payments` | Deposits/instalments | trigger-capped to booking total | → bookings |
| `purchase_orders` / `purchase_order_items` | Receiving | invoice dates, cost | → suppliers / products |
| `suppliers` | Vendors | contact, tax number | — |
| `stock_transfers` / `stock_transfer_items` | Inter-branch movement | `transfer_scope`, status workflow | → stores/products |
| `stock_adjustments` | Manual adjustments | reason, delta, cost impact | → products |
| `item_activity_logs` | Stock movement ledger | `quantity_delta`, `stock_before/after`, actor | → products |
| `stock_delta_applied` | Idempotency for `stock_apply_delta` | movement id | — |
| `promotions` | Promotions/points policy | `promo_type`, `tier_rates` | → products (FOC) |
| `coupon_campaigns` / `issued_vouchers` / `coupon_events` | Coupon engine | slug, claims, token, immutable events | → members/campaigns |
| `app_users` | Staff accounts | `pin_hash`, `permissions jsonb`, `role`, `role_slug`, `store_id` | — |
| `cashiers` | Legacy PIN accounts (migration source) | `pin_hash` | — |
| `user_roles` | Role assignment (separate table, correct pattern) | `app_role` enum | — |
| `staff_roles` | Custom role definitions | `permissions jsonb`, `is_core` | — |
| `pin_attempts` | PIN throttling | key, count, locked_until | — |
| `terminal_tokens` / `terminal_commands` | Device activation + kill switch | status, heartbeat | → stores |
| `branch_telemetry` | Device heartbeats | queue counts, engine, status | — |
| `pos_settings` | Global settings (41 cols) | receipt design, tax, hours, visibility | — |
| `settings_overrides` / `settings_locks` | Scoped/inherited settings | scope, locked_by | — |
| `secure_settings` | Encrypted credentials | AES-256-GCM payload, service-role only | — |
| `integration_settings` | Provider keys (encrypted) | — | — |
| `sync_metadata` / `offline_sync_audit_log` | Sync watermarks + audit | per table/terminal | — |
| `audit_logs` / `activity_events` / `system_audit_logs` | Human audit trail, event feed, immutable system trail | before/after state | — |
| `security_findings` | Scanner output | severity, status | — |
| `whatsapp_queue` | Outbound bill messages | status | — |
| `public_flags` | Public landing toggles | — | — |
| `sku_audit` | SKU generation history | — | — |

Views: `v_daily_store_sales`, `v_daily_item_sales`, `v_sale_line_facts`.

### 11.2 Relationship map (CONFIRMED)

```text
STORES (self-parent hierarchy)
  ├── SHIFTS ── SHIFT_SESSIONS
  ├── DRAWER_EVENTS · HELD_ORDERS · BRANCH_TELEMETRY
  └── TERMINAL_TOKENS

MEMBERS ── MEMBERSHIP_TIERS
  ├── SALES ── SALE_ITEMS ── PRODUCTS
  │      └── PAYMENT_TRANSACTIONS
  ├── BOOKINGS ── BOOKING_PAYMENTS
  ├── ISSUED_VOUCHERS ── COUPON_CAMPAIGNS ── COUPON_EVENTS
  └── MEMBER_VERIFICATIONS

PRODUCTS
  ├── PRODUCT_BARCODES · PRODUCT_CATEGORIES(self)
  ├── ITEM_ACTIVITY_LOGS · STOCK_ADJUSTMENTS
  ├── PURCHASE_ORDER_ITEMS ── PURCHASE_ORDERS ── SUPPLIERS
  └── STOCK_TRANSFER_ITEMS ── STOCK_TRANSFERS
```

### 11.3 Database functions (CONFIRMED, ~80)

Security-definer helpers: `has_role`, `has_perm`, `is_staff`, `is_staff_now`, `is_supervisor_now`, `is_app_supervisor`, `store_visible`, `user_has_store_access`, `user_store_id`, `user_cluster_id`, `current_app_user`.

Operational: `shift_open`, `shift_active_for_branch`, `stock_apply_delta`, `stock_transfer_receive`, `verify_terminal_pin`, `verify_cashier_pin`, `terminal_token_claim/heartbeat/status`, `terminal_staff_list`, `pin_throttle_status/fail/reset`.

Admin: `staff_account_upsert/set_pin/set_active/delete_profile/adopt_legacy`, `set_app_user_profile/permissions`, `list_app_users`, `staff_role_save/delete`, `upsert_cashier`, `delete_cashier`, `upsert_terminal_user`, `delete_terminal_user`.

Coupons/members: `coupon_claim`, `coupon_issue_manual`, `coupon_log`, `member_join`, `member_welcome_claim`, `voucher_by_token`, `voucher_redeem`, `voucher_set_status`, `voucher_token`, `campaign_is_live`.

Diagnostics: `schema_inventory`, `security_selfcheck`, `security_report_findings`, `security_set_finding_status`, `operational_relational_health`.

### 11.4 Triggers (CONFIRMED, ~110)

Patterns:
- `*_bump_row_version` → `bump_row_version()` on nearly every table (optimistic concurrency).
- `*_aa_stale_guard` → `skip_stale_update()` — drops writes carrying an older `row_version` (last-writer-wins protection for offline replay).
- `*_touch_updated_at` / `*_set_updated_at`.
- Permission enforcement in the database: `enforce_sale_permissions`, `enforce_sale_item_permissions`, `enforce_product_price_permissions`, `enforce_member_points_permissions`, `enforce_booking_permissions`.
- Integrity: `booking_payment_within_total`, `stores_hierarchy_guard`, `app_users_require_store`, `shifts_sync_status`.
- Immutability: `activity_events_immutable`, `coupon_events_readonly`, `system_audit_immutable`.
- `auth.users → sync_auth_user_to_public` keeps `app_users` in step with new auth users.

### 11.5 RLS (CONFIRMED)

Every audited public table has RLS policies. Shapes in use:

| Shape | Example tables | Predicate |
| --- | --- | --- |
| Branch-scoped staff | sales, sale_items, bookings, booking_payments, shifts, shift_sessions, drawer_events, held_orders | `is_staff_now() AND store_visible(store_id)` (INSERT uses `user_has_store_access`) |
| Staff-wide | products, members, stores, promotions, suppliers, purchase_orders, pos_settings, payment_types, categories, units | `is_staff_now()` |
| Supervisor-only | activity_events, system_audit_logs, integration_settings, terminal_commands (INSERT), sale/sales DELETE, transfers DELETE | `is_app_supervisor()` / `is_supervisor_now()` |
| Own-row | app_users (`auth_user_id = auth.uid()`), user_roles SELECT | identity |
| Public read | coupon_campaigns (`campaign_is_live`), public_flags | anon |
| Service-role only | secure_settings | `ALL` to service role |
| Own-branch | sync_metadata, stock_delta_applied | branch predicate |

**Observation (see §33 R-05):** `audit_logs` and `branch_telemetry` each carry a strict policy pair *and* a permissive duplicate (`audit_logs_staff_read USING true`, `branch_telemetry_staff_read USING true`). Because policies OR together, the permissive one wins for any authenticated user.

---

## 12. Authentication

**CONFIRMED.**

Three identities:

1. **Supabase account** (office/supervisor) — email+password; role from `user_roles` (`app_role`: admin | manager | staff) and `app_users.permissions`.
2. **PIN staff** — `app_users.pin_hash`; verified server-side (`verify_terminal_pin`) after `pin_throttle_*` (5 failures / 15 min → 5 min lock) and client-side `pin-lockout.ts`; result is an HMAC-signed session token (`session-token.server.ts`) stored via `pos-credentials.ts`.
3. **Terminal device** — activation payload encrypted AES-256-GCM (`terminal-crypto.ts`, `ACTIVATION_TTL_MS`), claimed with `terminal_token_claim`, kept alive by `terminal_token_heartbeat`; revocation observed by `use-revocation-check.ts` (kill switch: keeps selling locally, cut off from cloud).

Route protection: `ui-visibility.isRouteVisibleFor`, `PermissionGate`, `ShiftGuard`, `LocationBootGuard`, `OfflineGate`, plus `route-guards.security.test.ts`.

### Permission matrix (from `ROLE_PRESETS`, CONFIRMED)

| Group | Cashier | Warehouse | Supervisor | Admin |
| --- | --- | --- | --- | --- |
| Drawer / shift | open drawer, open/close shift | — | full | full |
| Sales approvals (off ⇒ manager PIN) | mostly off | — | on | on |
| Sales & checkout | sale, hold, reprint, bookings | — | + refund/exchange | full |
| Inventory & pricing | view only | full stock ops | full | full |
| Members & loyalty | add, apply discount | — | + edit points | full |
| Reports | — | limited | sales + dashboard | full incl. audit trail |
| System & admin | — | — | limited | full |

Exact per-key values live in `CASHIER_PERMISSIONS`, `WAREHOUSE_PERMISSIONS`, `SUPERVISOR_PERMISSIONS`, `FULL_PERMISSIONS` in `src/lib/permissions.ts`; 17 assertions cover them in `permissions.security.test.ts`.

---

## 13. POS / Register

**CONFIRMED.** Entry `src/routes/index.tsx` → `Register()`.

| Step | Where |
| --- | --- |
| Cashier login | `LoginScreen.tsx`, `CashierPinLogin.tsx`, `TerminalLogin.tsx` |
| Shift gate | `ShiftGuard.tsx` (blocks selling with no open shift unless `can_bypass_shift_lock`) |
| Scan | `ScanBar.tsx`, `CameraScanner.tsx` (mobile ML Kit), `product-lookup.resolveByBarcode(Indexed)` |
| Search | `ProductSearchDialog.tsx` |
| Cart | `usePos()` actions; per-branch availability via `availableAt(product, bookings, storeId)` |
| Discount | `DiscountPad.tsx`; bill-level discount is spread proportionally for tax accuracy |
| Member | `QuickMemberDialog.tsx`, `MemberHistoryDialog.tsx` |
| Promotions | `pos-promotions.evaluatePromotions()`, `focLine()` |
| Coupons | `coupons.redeemVoucher()` |
| Hold / recall | `held-orders.ts`, `/holds` |
| Tender | `TenderSplit.tsx` + `validateTenders` |
| Manager override | `manager-gate.tsx` → `ManagerOverrideDialog.tsx` → server fn `verifyManagerPin` |
| Commit | `db.commitSale()` |
| Receipt | `pos-print.printSaleReceipt()` |
| Drawer | `pos-print.openCashDrawer()` → `receipt-printer.rawPulse()` (ESC/POS pulse) |
| Customer display | `customer-display.publishDisplay()` → `/display` route (BroadcastChannel + storage) |
| Bill numbering | `bill-number.ts`: prefix + terminal number + day stamp + sequence; `newClientTransactionId()` for idempotency |

---

## 14. Inventory

**CONFIRMED.**

| Event | Stock effect | Ledger |
| --- | --- | --- |
| Sale | `-qty` at selling branch | `item_activity_logs` (`quantity_delta<0`) → `stock_apply_delta` |
| Return / refund line (`is_return`) | `+qty` | same ledger, positive delta |
| Exchange | old bill back-linked (`exchanged_to_bill_number`), new bill deducts | both ledgers |
| Purchase receiving | `+quantity_received`, cost/landing update | `item_activity_logs` + `purchase_order_items` |
| Manual adjustment | delta with reason (`STOCK_ADJUSTMENT_REASONS`) | `stock_adjustments` + `item_activity_logs` |
| Transfer out/in | source `-`, destination `+` on receive (`stock_transfer_receive`) | transfer items |

Per-branch quantity lives in `products.stock_by_store` (jsonb) with `stock_quantity` as the roll-up; `stockAt`, `reservedAt`, `availableAt` (pos-store) compute availability including booking reservations. Location routing and multi-level warehouses: `locations.ts` (`centralHub`, `routingTargets`, `planDeduction`, `rolledUpStock`, `archiveBlockers`). Low-stock uses `products.reorder_level` surfaced in `/reports/stock` and `/inventory`.

---

## 15. Products

`products` + `product_barcodes` + `product_categories` + `uom_units`. Fields: SKU (`sku.ts` generator with modes and `sku_audit`), barcode + `barcode_aliases` + `barcode_variants` (pack barcodes), category/sub-category/group/brand, `packs jsonb`, cost/selling/ecom/landing %, tax rate, points overrides (`custom_points`, `point_multiplier`), `is_archived` soft delete. Bulk import: `BulkImportDialog.tsx`; export: `product-export.ts` (xlsx). Merge: `MergeProductsDialog.tsx` + `merge-guard.ts`. Delete protection: `product-delete.ts` (`PRODUCT_HAS_SALES_HISTORY`) — **PARTIAL**, see R-02. Images: **NOT IMPLEMENTED** (no image column or upload path found). Variants beyond packs/barcode variants (size/colour matrices): **NOT IMPLEMENTED**.

---

## 16. Customers / Members

`members` (+ tiers, verifications). Creation from `/members`, `/customers`, `/join` (public) and the quick dialog at the till. Loyalty: points earned via `pos-promotions.pointsPolicy` / `DEFAULT_POINTS_PER_DOLLAR`, tier rates from `promotions.tier_rates`, birthday-month rule (`isBirthdayMonth`). Redemption at checkout writes `points_redeemed` on the sale. Points edits are gated by `can_edit_member_points` **and** the DB trigger `enforce_member_points_permissions`. History: `MemberHistoryDialog.tsx`, statement print `printMemberStatement`. OTP verification: `verification.functions.ts` + `OtpVerificationModal.tsx` + `/verifications`. Store credit / account balance: **NOT IMPLEMENTED** (no credit column; exchange credit is per-bill only).

---

## 17. Suppliers

`suppliers.ts` + `/suppliers`: CRUD, active flag, tax number, notes. Supplier running balance and purchase returns: **NOT IMPLEMENTED**.

---

## 18. Purchasing

`/purchasing` (1,264 lines) drives `purchase_orders` + `purchase_order_items` via `pos-db` helpers (`loadReceivingInvoices`, `invoiceNumberTaken`, PO commit ops, removed-line deletes). Receiving updates cost and stock and writes movement rows. Purchase invoice numbering is validated for duplicates. Supplier invoices/credit notes beyond the receiving record: **NOT IMPLEMENTED**.

---

## 19. Payments

- Tender catalogue is data-driven: `payment_types` (`type_code`, `requires_reference`, `icon`, `sort_order`, `is_system`) via `payment-types.ts`; built-ins keep special register behaviour (`BUILT_IN_METHODS`: cash, card, …).
- Split tender: `TenderSplit.tsx` + `validateTenders` (§24).
- Ledger: one `payment_transactions` row per tender for sales **and** bookings (`source_type`).
- Bank transfer / QR: `PaymentQr` types, `resolvePaymentQr`, `/settings/qr`, QR rendered by `qrSvg`.
- Booking deposits: `booking_payments`, capped by trigger to the booking total.
- Card tenders require a bank/machine name; reference-required tenders require a reference.

---

## 20. Refunds / Returns / Exchanges

**CONFIRMED (PARTIAL as a dedicated module).** There is no standalone refund screen; returns are modelled as negative/return lines and exchanges:

- `sale_items.is_return`, `sales.is_refunded`, `sales.is_exchange`, `original_bill_number`, `exchanged_to_bill_number`, `exchange_credit`.
- Permissions `can_process_refund`, `can_process_exchange`; review thresholds `review_max_refunds`, `review_max_refund_value` (`pos_settings`) surface in `/reports/voids`.
- Void tracking: `cashier-audit.ts` + `/reports/voids`.

---

## 21. Receipts / Printing / Hardware

| Device | Path |
| --- | --- |
| Receipt printer (desktop, silent) | `pos-print.ts` → `receipt-printer.silentPrint()` → IPC `print:silent` → Electron `webContents.print` |
| Raw ESC/POS | `escpos.ts` (`htmlToEscPos`, `slipToBytes`, `columnsForPaper`) → IPC `print:raw` |
| Cash drawer | `openCashDrawer()` → `drawerPulseBytes()` → `print:raw` (kick pulse) |
| Browser fallback | `window.print()` with scoped receipt CSS (`receipt-css.ts`) |
| Barcode scanner | keyboard-wedge via `ScanBar`, camera via ML Kit (`camera.ts`) or `html5-qrcode` |
| Customer display | second window/route `/display`, BroadcastChannel `DISPLAY_CHANNEL` |
| Printer discovery | IPC `print:list` |
| Label printer / pole display / COM ports | **NOT IMPLEMENTED** |

Receipt kinds produced by `pos-print.ts`: sale receipt, shift (X/Z) report, test receipt, member statement, booking slip, booking payment slip, job tag, transfer note, plus previews (`saleReceiptPreview`, `shiftReportPreview`, `bookingSlipPreview`). Designer: `/settings/receipt-designer` + `receipt-template.ts` tokens (`RECEIPT_FIELDS`, `renderReceiptText`).

---

## 22. Reports

| Report | Route | Source |
| --- | --- | --- |
| Sales | `/reports/sales` | sales, sale_items |
| Items | `/reports/items` | `v_daily_item_sales`, `sales-analytics.soldLines` |
| Stock | `/reports/stock` | products, item_activity_logs |
| Payments | `/reports/payments` | payment_transactions |
| Voids | `/reports/voids` | audit + review thresholds |
| History | `/reports/history` | sales paging (`loadSalesPage`, `keyset.ts`) |
| Activity | `/reports/activity` | activity_events |
| Notifications | `/reports/notifications` | activity/notification settings |
| Coupons | `/reports/coupons` | coupon_events, issued_vouchers |
| Catalog | `/reports/catalog` | products |
| Business | `/reports/business` | `analytics-board.ts` (`v_daily_store_sales`) |
| Analytics | `/reports/analytics`, `/analytics` | board data, `profit.ts` |
| Dashboard | `/dashboard`, `/all-shops` | live aggregates |

Shared UI/CSV/print helpers: `report-kit.tsx`, `TablePagination.tsx`, `activity-events.toCsv`, `audit-log.auditToCsv`, `coupons.downloadCsv`, `product-export.ts`.

---

## 23. Settings

40 route files under `src/routes/settings.*`, catalogued in `settings-catalog.tsx` (`SETTINGS_CATEGORIES`, `SETTINGS_CARDS`, `PINNED_SETTINGS`, duplicate detector) and grouped by `settings-groups.ts`.

Three storage tiers (`branch-settings.ts`, `settings-scope.ts`):

```text
GLOBAL (pos_settings) → CLUSTER/GROUP → BRANCH (settings_overrides) → TERMINAL/DEVICE (local)
        with settings_locks preventing a child from overriding a locked section
```

Server side: `settings-scope.server.ts` (`readScopedSettings`, `writeScopedSettings`, `writeScopedSettingsWithService`, `pushScopedSettings`), exposed by `/api/settings*` and `settings-scope.functions.ts`. Secrets: `secure-settings.server.ts` + `settings-crypto.server.ts` (AES-256-GCM with `SETTINGS_ENCRYPTION_KEY`), stored in `secure_settings` (service-role only) and surfaced masked.

---

## 24. Business Rules

All **CONFIRMED** with file and line references.

| # | Rule | Where | Logic | DB impact |
| --- | --- | --- | --- | --- |
| BR-01 | Money rounding | `pos-types.ts:157` `r2` | round half-up to 2 dp with epsilon | every amount column |
| BR-02 | Line discount | `pos-types.ts:160` `lineUnitDiscount` | percent → `price*pct/100`, else flat, per unit | `sale_items.discount_*` |
| BR-03 | Ticket totals | `pos-store.tsx:2123` `cartTotals` | subtotal → line discount → bill discount (amount or %) → net → tax → total; bill discount spread proportionally (`ratio`) so tax stays correct | `sales.subtotal_amount/discount_amount/tax_amount/total_amount` |
| BR-04 | Tax modes | same | `exclusive`: `tax = net*rate`, `total = net+tax`; `inclusive`: `tax = net - net/(1+rate)`, `total = net`; disabled: `tax = 0`. Without global settings, per-line `taxRate` is used | `pos_settings.tax_mode/tax_percentage` |
| BR-05 | Exchange credit | `cartTotals` | lines flagged `credit` subtract at their discounted price | `sales.exchange_credit` |
| BR-06 | Tender validation | `pos-types.ts:239` `validateTenders` | ≥1 tender; every amount > 0; card tenders need a bank name; `requiresReference` tenders need a reference; balance must be 0; **only cash may exceed the total** (change) | `payment_transactions`, `sales.paid_amount/change_amount` |
| BR-07 | Sale idempotency | `pos-db.ts:1712` | `client_transaction_id` checked before write; unique index is the final guard | `sales.client_transaction_id` |
| BR-08 | Stock is relative on the wire | `pos-db.ts:1256`/`1288` | product upserts lose stock columns; movements applied by `stock_apply_delta`, deduped in `stock_delta_applied` | products, item_activity_logs |
| BR-09 | Offline fallback only for connection errors | `pos-db.ts:1353` | permission/validation errors are re-thrown so they stay visible | — |
| BR-10 | Expected drawer | `shift-close.ts:41` | `opening_float + cash sales of the shift` | `shifts.expected_cash` |
| BR-11 | Variance needs a manager | `shift-close.varianceNeedsPin` | variance beyond threshold requires manager approval | `shifts.variance_*` |
| BR-12 | Shift lock | `ShiftGuard.tsx` | no selling without an open shift unless `can_bypass_shift_lock` | shifts |
| BR-13 | Manager PIN gates | `pos-rules.ts` (`requiresManagerPin`, `VOID_PIN_THRESHOLD`, `GATE_RULE_KEY`) | a permission that is off escalates the action to a manager PIN | — (see R-01) |
| BR-14 | Points | `pos-promotions.ts` | `DEFAULT_POINTS_PER_DOLLAR`, tier rates, product `custom_points`/`point_multiplier`, birthday month bonus | `members.loyalty_points`, `sales.points_earned` |
| BR-15 | Promotion liveness | `pos-promotions.isLive`, DB `campaign_is_live` | active flag + date window (+ claim caps for coupons) | promotions, coupon_campaigns |
| BR-16 | Booking payments ≤ total | DB trigger `booking_payment_within_total` | rejects over-collection | booking_payments |
| BR-17 | Booking balance | `pos-types.bookingBalance` | `total - paid` | bookings.paid |
| BR-18 | Racket job lifecycle | `pos-types.JOB_STATUS_FLOW` | ordered states + incident states; liability acceptance required | bookings.job_status |
| BR-19 | Branch visibility | `branch-policy.ts` + RLS `store_visible` | private-stock branches hide stock from siblings; sync allowed per policy | all branch tables |
| BR-20 | Stale write rejection | DB `skip_stale_update` + `row-versions.ts` | a write carrying an older `row_version` is dropped | every versioned table |
| BR-21 | Bill numbering | `bill-number.ts` | prefix + terminal number + day stamp + sequence, seeded from existing bills | `sales.bill_number` |
| BR-22 | Product delete protection | `product-delete.ts` | products with sales history cannot be deleted | (guard RPC missing — R-02) |
| BR-23 | PIN throttling | `pin-throttle.server.ts` | 5 failures / 900s → 300s lock, server-side | pin_attempts |
| BR-24 | Read-only SQL console | `sql-admin.checkReadOnly` | single statement, SELECT/WITH only, forbidden-keyword regex after stripping literals/comments | MS SQL (desktop) |
| BR-25 | Terminal revocation | `use-revocation-check.ts` | revoked terminal keeps selling locally but is cut off from cloud sync | terminal_tokens |

---

## 25. State Management

| Kind | Holder | Notes |
| --- | --- | --- |
| Global business state | `PosProvider` (`pos-state-v2` in localStorage) | products, stores, members, cart, shifts, bookings, transfers, settings |
| Auth | `AuthProvider` + `PermissionsProvider` | session, staff, terminal user, effective permissions |
| Rules | `PosRulesProvider` | loaded from server fn `getPosRules` (currently defaults, R-01) |
| Manager gates | `ManagerGateProvider` | promise-based gate requests |
| Server cache | TanStack Query (`QueryClientProvider` in `__root.tsx`) | used by newer panels; older screens fetch directly |
| Sync state | module singletons + subscribe callbacks: `sync-status.ts`, `sync-outbox.ts`, `sync-audit.ts`, `db-mode.ts`, `connection-health.ts` | not React state — components subscribe |
| Device state | `local-db.ts` (Electron config store), `mobile-storage.ts` (Capacitor Preferences), `device-secrets.ts` | `live-mode.ts` classifies which keys may persist |
| Ephemeral UI | component `useState`, `layout-store.ts` for register layout | per platform target |

---

## 26. Dependencies

Production dependencies of note (see `package.json` for the full list): `@supabase/supabase-js`, `@tanstack/react-router|react-start|react-query`, `react`/`react-dom` 19, `mssql`, `electron-updater`, Capacitor plugins, `react-grid-layout`, `html5-qrcode`, `qrcode-generator`, `date-fns`, `zod`, `react-hook-form`, Radix primitives, `lucide-react`, `recharts`, `xlsx`-style export via `product-export.ts`.

Runtime constraint: `mssql`, `msnodesqlv8` and the SQLite layer are **Electron-main only** — they must never be imported from `src/`; the worker runtime cannot load native modules.

---

## 27. Function Index

Abbreviated master index (module → key exported functions). Full export listing per file is reproducible with `rg '^export ' src/lib`.

| Module | Key functions | Module | Key functions |
| --- | --- | --- | --- |
| `pos-db.ts` | `commitOps`, `mirrorToLocal`, `loadCloudState`, `loadActiveShift`, `openShiftOnServer`, `loadSalesPage`, `db.*` | `db-router.ts` | `dbRouter.{write,read,query,queryWithSource,insert,upsert,update,delete,health}` |
| `pos-store.tsx` | `PosProvider`, `usePos`, `cartTotals`, `stockAt`, `availableAt`, `money` | `pos-types.ts` | `r2`, `lineUnitDiscount`, `validateTenders`, `paymentsTotal`, `bookingBalance` |
| `sync-engine.ts` | `runOpLive`, `drainOutbox`, `pullDelta`, `pushLocalPending`, `pullIntoLocal`, `startSyncEngine` | `sync-outbox.ts` | `enqueue`, `listQueue`, `retryOp`, `discardOp`, `queueView`, `backoffMs` |
| `permissions.ts` | `hasPermission`, `getEffectivePermissions`, `normalizePermissions`, `rolePermissions` | `pos-auth.tsx` | `AuthProvider`, `useAuth` |
| `pos-rules.functions.ts` | `getPosRules`, `savePosRules`, `verifyManagerPin`, `authorizeAsAdmin`, `assertShiftClosable` | `pos-rules.server.ts` | `signOverrideGrant`, `verifyOverrideGrant`, `loadRules`, `saveRules`, `verifyManagerPinInDb`, `logOverride` |
| `relay-policy.server.ts` | `resolveRelayScope`, `authorizeRelayOp`, `batchInsertIds` | `pos-relay.server.ts` | `serviceRest`, `runRelayOp`, `runRelayRead`, `verifyRelayCaller` |
| `shift-close.ts` | `reconcileShift`, `expectedDrawer`, `tenderTotals`, `varianceNeedsPin` | `bill-number.ts` | `nextBillNumber`, `hydrateBillSequence`, `newClientTransactionId` |
| `pos-print.ts` | `printSaleReceipt`, `printShiftReport`, `printJobTag`, `openCashDrawer`, `qrSvg`, `barcodeSvg` | `escpos.ts` | `htmlToEscPos`, `slipToBytes`, `columnsForPaper` |
| `coupons.ts` | `claimCampaign`, `redeemVoucher`, `issueVoucherManually`, `setVoucherStatus`, `loadCampaignStats` | `terminal-tokens.ts` | `issueTerminalToken`, `activateTerminal`, `stampHeartbeat`, `unpairTerminal` |
| `locations.ts` | `planDeduction`, `rolledUpStock`, `routingTargets`, `archiveBlockers` | `stock-transfers.ts` | `saveTransfer`, `setTransferStatus`, `receiveTransferInDb` |
| `staff-admin.server.ts` | `provisionStaffAccount`, `updateStaffProfile`, `permanentlyDeleteStaff`, `migrateLegacyCashiers` | `verification.server.ts` | `startVerification`, `confirmVerification` |
| `db-health.ts` | `runDbHealth`, `runBranchCoverage` | `feature-schema.ts` | `runFeatureSchemaAudit` (features ↔ schema contract) |

---

## 28. Database Query Index

| Operation | File / function | Tables | Kind |
| --- | --- | --- | --- |
| Boot hydrate | `pos-db.loadCloudState` | products, stores, members, promotions, pos_settings | SELECT |
| Sale commit | `pos-db.db.commitSale` → `commitOps` | sales, sale_items, payment_transactions, item_activity_logs, products, members | INSERT/UPSERT |
| Stock apply | `applyStockDeltas` | RPC `stock_apply_delta` → products, stock_delta_applied | RPC |
| Sale idempotency | `db.saleAttemptExists` | sales | SELECT |
| Shift open | `openShiftOnServer` | RPC `shift_open` → shifts | RPC |
| Active shift | `loadActiveShift` | RPC `shift_active_for_branch` | RPC |
| Sales paging | `loadSalesPage` + `keyset.ts` | sales | SELECT (keyset) |
| Shift sign-ins | `loadShiftSessions` | shift_sessions | SELECT |
| Receiving | `loadReceivingInvoices`, `invoiceNumberTaken` | purchase_orders, purchase_order_items | SELECT/UPSERT |
| Transfer receive | `stock-transfers.receiveTransferInDb` | RPC `stock_transfer_receive` | RPC |
| Coupons | `coupons.*` | RPC `coupon_claim`, `voucher_redeem`, `voucher_set_status`, `voucher_by_token` | RPC |
| Members | `member_welcome_claim`, `db.commitMember` | members | RPC/UPSERT |
| Staff admin | `staff-admin.server` | RPC `list_app_users`, `set_app_user_permissions`, `staff_role_save/delete` | RPC |
| Terminal | `terminal-tokens.ts` | RPC `terminal_token_claim/heartbeat/status`, terminal_tokens | RPC/CRUD |
| PIN sign-in | `cashier-login.server` | RPC `verify_terminal_pin`, `pin_throttle_*` | RPC |
| Health | `db-health.ts`, `health-relay.ts` | RPC `schema_inventory`, `operational_relational_health`, `security_selfcheck` | RPC |
| Analytics | `analytics-board.fetchBoard` | `v_daily_store_sales`, `v_daily_item_sales` | SELECT (views) |
| Relay writes | `pos-relay.server.runRelayOp` | any `RELAY_WRITABLE_TABLES` | REST with service key |
| Desktop writes | `electron/db/repo.applyOp` | MS SQL mirror of the same tables | MERGE/UPDATE/DELETE |

---

## 29. Error Handling

| Class | Detection | User sees | Logged | Data-corruption risk |
| --- | --- | --- | --- | --- |
| Validation (zod / tender rules) | `validateTenders`, zod on API bodies | inline message; checkout blocked | no | none |
| Connection | `db-mode.isConnectionError`, `AllTargetsFailed` | "could not be stored anywhere" modal; status pill flips to offline | sync log | none — commit only resolves when durable |
| Permission (client) | `hasPermission` → manager gate | manager PIN dialog | audit | none |
| Permission (server) | relay codes `PERMISSION_DENIED`/`STORE_FORBIDDEN` | toast with reason | `console.warn` (no tokens/rows) | none |
| Auth/session | `session-expiry.ts` (`isTokenRejection`, `inspectResponse`) | "sign in again" | yes | none |
| Database schema drift | `schema-guard.isMissingSchema`, `feature-schema.ts` | diagnostics screen banner | report | reads degrade to empty |
| Missing RPC (R-01/R-02) | try/catch → silent default | **nothing** | no | see R-01 |
| Printer | `receipt-printer.silentPrint` result | toast; sale already saved | sync/audit | none |
| Uncaught React | `__root.tsx` error component + `error-capture.ts` + `lovable-error-reporting.ts` | error page with reset | yes | none |
| Server function | `errorMiddleware` in `start.ts` | rendered error page (500) | `console.error` | none |

---

## 30. Security Audit

**Positive findings (CONFIRMED):**

- No secrets in the repository; `secrets.security.test.ts` fails the build on a committed JWT/service-role-shaped string. Service key and `SETTINGS_ENCRYPTION_KEY` are read only inside server handlers.
- CSRF middleware is explicitly re-registered for server functions in `src/start.ts`.
- RLS enabled with branch-scoped predicates on every audited table; DB-level permission triggers duplicate client checks for sales, sale items, product prices, member points and bookings.
- Roles live in a separate `user_roles` table with a `SECURITY DEFINER has_role()` — no role column on a profile table.
- Relay never trusts client-supplied scope: `resolveRelayScope` re-derives branch/role/permissions server-side and re-checks branch existence per request.
- PIN throttling is server-side (`pin_attempts`), not just client-side.
- Terminal activation payloads are AES-256-GCM with a TTL; override grants are HMAC-signed with an expiry and action binding (`signOverrideGrant`/`verifyOverrideGrant`).
- SQL console is read-only with literal/comment stripping before keyword checks.
- Refusal logging deliberately excludes tokens, keys and row contents.

**Findings to address** (details in §33): duplicate permissive RLS policies on `audit_logs`/`branch_telemetry` (R-05); `cashiers` and `pin_attempts` have no policies listed in the audited policy set (R-06); missing manager-override RPCs mean overrides cannot be recorded (R-01).

No hardcoded credentials, SQL string concatenation from user input, or `dangerouslySetInnerHTML` on untrusted content were found in `src/`.

---

## 31. Performance Audit

| Observation | Location | Impact |
| --- | --- | --- |
| `loadCloudState()` bulk-loads the whole catalogue on boot | `pos-db.ts:779` | slow first paint on large catalogues; mitigated by the local mirror on desktop |
| `applyStockDeltas` issues one RPC per movement, sequentially | `pos-db.ts:1288` | a 30-line basket makes 30 round trips after checkout |
| `commitOps` runs ops sequentially (`for … await`) | `pos-db.ts:1331/1346/1375` | required for ordering, but adds latency per sale |
| 4,156-line `Register()` component | `src/routes/index.tsx` | large re-render surface; hard to memoise |
| Whole-state persistence to `localStorage` | `pos-store.tsx` | write amplification on every cart keystroke-level change |
| `pullDelta()` per table each 15 s | `sync-engine.ts` | steady background traffic; watermarked so payloads stay small |
| Column metadata cached per table | `electron/db/repo.cjs:114` | good — avoids repeated `INFORMATION_SCHEMA` reads |
| Keyset paging used for sales history | `keyset.ts`, `loadSalesPage` | good — no OFFSET scans |
| Index coverage | not audited per-index this pass | **UNKNOWN** — recommend `pg_stat_user_indexes` review |

---

## 32. Code Quality / Technical Debt

- **Oversized modules:** `src/routes/index.tsx` (4,156), `pos-store.tsx` (2,165), `pos-db.ts` (2,002), `purchasing.tsx` (1,264), `main.cjs` (1,159), `pos-print.ts` (1,029). These four files carry most of the product risk.
- **Two audit systems in parallel:** `audit_logs` (human trail) and `activity_events` + `system_audit_logs`; also `audit-log.ts`, `activity-events.ts`, `system-audit.ts`, `cashier-audit.ts`, `ticket-audit.ts`, `sync-audit.ts`. Overlapping responsibilities.
- **Two sync log modules:** `sync-log.ts` and `sync-audit.ts`.
- **Legacy tables still present:** `cashiers` (superseded by `app_users`, with a migration function `legacy_cashiers_for_migration`).
- **Duplicate API surface:** `/api/public/sync` (legacy) and `/api/v1/pos/sync` share one handler — intentional and documented.
- **Duplicate policies** on `audit_logs`, `branch_telemetry`, `payment_types` (both `*_read`/`*_write` and `*_staff_read`/`*_staff_write`).
- **No TODO/FIXME/HACK markers** anywhere in `src/` or `electron/` — CONFIRMED clean on that axis.
- **Missing DB objects referenced by code** (R-01, R-02) — the largest correctness debt.

---

## 33. Bugs / Risks

### R-01 — POS rules engine and manager overrides have no database behind them
- **Severity:** CRITICAL
- **File / function:** `src/lib/pos-rules.server.ts` — `loadRules()`, `saveRules()`, `verifyManagerPinInDb()`, `logOverride()`; consumed by `src/lib/pos-rules.functions.ts` and `manager-gate.tsx`
- **Cause:** The code calls `pos_rules_get`, `pos_rules_save`, `verify_manager_pin`, `log_manager_override`, `held_orders_open_count` and writes to a table `pos_store_settings`. A live query during this audit shows **none of these functions or that table exist** in the database.
- **Impact:** `loadRules()` swallows the error and returns `DEFAULT_POS_RULES`, so branch-specific rules can never be loaded or saved; `verifyManagerPinInDb()` returns `null` on failure, so **every manager override attempt is refused**; `logOverride()` silently discards the audit record.
- **Affected features:** manager overrides (void, price override, discount, no-sale, tender edit), branch rule configuration (`/settings/rules`), shift-close variance approval, held-order counts.
- **Recommended fix:** create the missing functions and table (or repoint the code at existing equivalents), and make the failure visible instead of silent — return a typed "rules backend unavailable" state and surface it in `/settings/diagnostics`.
- **Testing required:** manager PIN accept/reject; rule save→reload per branch; override audit row written; shift close with variance.

### R-02 — `product_delete_guard` RPC does not exist
- **Severity:** HIGH
- **File:** `src/lib/product-delete.ts` (called from the inventory delete path)
- **Cause:** RPC `product_delete_guard` is referenced in code but absent from the database.
- **Impact:** the pre-delete safety check cannot run; the code falls back to error-shape detection (`isLinkedRecordError`), so protection depends on a foreign-key error surfacing rather than an explicit guard.
- **Fix:** implement the guard function, or make `usageBlock()` query `sale_items`/`purchase_order_items` directly.
- **Testing:** attempt to delete a product with sales history, with PO history, and with neither.

### R-03 — Silent-catch pattern hides backend drift
- **Severity:** HIGH
- **Files:** `pos-rules.server.ts` (4 `catch { return default }`), `applyStockDeltas` (logs only), `mirrorToLocal` (logs only), `saleAttemptExists`/`shiftExists` (`"unknown"`).
- **Impact:** deliberate for till continuity, but combined with R-01/R-02 an entire feature can be dead with no user-visible signal. The stock-delta case can leave the central quantity behind the movement ledger.
- **Fix:** route these into `activity_events`/diagnostics with a severity, and add a "central stock vs ledger" reconciliation report.

### R-04 — Register component size
- **Severity:** MEDIUM (maintainability)
- **File:** `src/routes/index.tsx` (4,156 lines)
- **Impact:** any checkout change carries broad regression risk; hard to unit test.
- **Fix:** extract cart, tender, booking-intake and layout hosting into components under `src/components/pos/register/`. Do this incrementally behind the existing tests.

### R-05 — Permissive duplicate RLS policies
- **Severity:** MEDIUM (security)
- **Tables:** `audit_logs` (`audit_logs_staff_read USING true`, `audit_logs_staff_insert WITH CHECK true`), `branch_telemetry` (`*_staff_read/update/write USING true`).
- **Impact:** policies OR together, so the strict `is_staff_now()` variants are bypassed by the permissive ones for any authenticated role. Telemetry rows are also writable by any authenticated user.
- **Fix:** drop the `true` policies once the stricter pair is confirmed in use.

### R-06 — Tables without policies in the audited set
- **Severity:** MEDIUM
- **Tables:** `cashiers`, `pin_attempts` (no policies returned).
- **Impact:** if RLS is enabled they are unreachable except via SECURITY DEFINER functions (which is how the code uses them — acceptable); if RLS is **not** enabled they are exposed. Verify `relrowsecurity` for both before changing anything.

### R-07 — Legacy `/api/public/sync` remains public surface
- **Severity:** LOW (accepted)
- The handler authenticates identically; risk is only that the legacy path outlives the tills that need it. Track a removal date.

### R-08 — Sequential stock RPCs after checkout
- **Severity:** LOW/MEDIUM (performance + partial-failure window)
- A basket-sized loop of RPCs can partially fail; each is idempotent, but no retry queue exists for a failed delta.
- **Fix:** batch into one RPC taking a movement array, and enqueue failures.

---

## 34. Missing Features

**NOT IMPLEMENTED** (searched and absent):

- Product images / media library; size-colour variant matrices.
- Customer store credit / account balance ledger; layaway.
- Supplier balances, purchase returns, credit notes.
- Dedicated refund screen (refunds exist only as return lines / exchanges).
- Label printer, pole display, COM-port device support.
- Gift cards; tips; multi-currency (currency is hard-coded `USD` in `money()`).
- Tax groups per jurisdiction (single global rate + per-product rate only).
- Automated end-to-end/UI tests (only unit tests exist).

---

## 35. Change Impact Analysis

| If you change… | It can break… |
| --- | --- |
| `cartTotals` / `r2` / `lineUnitDiscount` | register totals, tax, receipts, sales rows, all revenue reports, profit, shift reconciliation |
| `validateTenders` | checkout completion, split tender, change calculation, `payment_transactions` |
| `commitOps` | **everything that writes** — offline durability, stock, sale idempotency, sync outbox, desktop mirror |
| `withRelativeStock` / `stock_apply_delta` | central stock accuracy across every branch; risk of double deduction |
| `products.stock_by_store` shape | `stockAt`/`availableAt`, transfers, reports, mirror schema, SQLite tables |
| `PERMISSION_KEYS` / role presets | UI gating, manager gates, DB `enforce_*` triggers, `permissions.security.test.ts` |
| `PosState` shape | persisted `pos-state-v2` on every device (needs migration), every screen |
| `bill-number.ts` | duplicate/incorrect bill numbers, exchange lookups, receipt reprints |
| RLS predicates / `store_visible` | branch isolation, relay authorisation, offline pull contents |
| `RELAY_WRITABLE_TABLES` | which tables tills can write while offline-relaying |
| `electron/db/offline_sqlite_v2.sql` | mirror/outbox compatibility with already-installed desktops (needs migration) |
| Receipt tokens (`RECEIPT_FIELDS`) | every stored receipt design in `pos_settings.receipt_design` |

---

## 36. Testing

Existing suites (**CONFIRMED**, 107 tests passing):

| Suite | Covers |
| --- | --- |
| `bill-number.test.ts` | numbering, sequence hydration, client txn ids |
| `connection-health.test.ts` | reachability caching |
| `db-mode.test.ts` | mode selection, failover flags |
| `db-router.test.ts` | routed read/write behaviour |
| `local-db-connection.test.ts` | desktop bridge state machine |
| `offline-sync.test.ts` | outbox ordering, backoff, quarantine |
| `online-commit.test.ts` | cloud commit path and error classes |
| `own-database.security.test.ts` | tenant/database isolation |
| `permissions.security.test.ts` | 17 role/permission assertions |
| `platform-failover.test.ts` | Android/web/desktop branch behaviour |
| `relay-policy.security.test.ts` | relay authorisation matrix |
| `route-guards.security.test.ts` | route visibility by role |
| `secrets.security.test.ts` | no committed credentials |
| `tenders.test.ts` | tender validation rules |
| `terminal-branch.test.ts` | terminal→branch binding |

Recommended additions (priority order): `cartTotals` tax-mode matrix; `commitSale` idempotency under retry; stock delta double-apply; shift reconciliation variance; refund/exchange line maths; coupon redeem state machine; booking payment cap; PIN throttle; settings inheritance/lock resolution; receipt token rendering.

---

## 37. Troubleshooting

Each path lists the actual files to open in order.

**Inventory not reducing after a sale**
1. `src/lib/pos-db.ts` → `db.commitSale` (were `item_activity_logs` rows built by `saleActivityRows`?)
2. `withRelativeStock` (did the product upsert keep stock columns?)
3. `applyStockDeltas` → sync log for "Stock delta:" entries
4. DB: `select * from item_activity_logs order by created_at desc limit 20;` then `stock_delta_applied`
5. `products.stock_by_store` for the branch key
6. Desktop only: `electron/db/repo.cjs` mirror write

**Manager override always refused** → R-01. Check `pos-rules.server.verifyManagerPinInDb`, then confirm `verify_manager_pin` exists in the database.

**Sale not saving** → `commitOps` target (`lastCommitTarget()`), `AllTargetsFailed` modal, `db-mode.isConnectionError`, `/settings/diagnostics`, relay response code from `/api/v1/pos/sync`.

**Duplicate bill charged twice** → `db.saleAttemptExists`, `sales.client_transaction_id` unique index, `bill-number.newClientTransactionId`.

**Barcode not found** → `product-lookup.resolveByBarcode(Indexed)`, `product_barcodes`, `products.barcode_aliases`/`barcode_variants`, then scanner mode in `ScanBar.tsx`.

**Wrong price / discount / total** → `cartTotals`, `lineUnitDiscount`, tax settings in `pos_settings`, promotion in `pos-promotions.evaluatePromotions`, coupon in `coupons.redeemVoucher`.

**Payment fails** → `validateTenders` message, `payment_types.requires_reference`, `payment_transactions` insert result in the relay response.

**Receipt not printing** → `pos-print.printSaleReceipt` → `receipt-printer.silentPrint` → IPC `print:silent` → `electron/main.cjs`; check `print:list` output and `PrinterPrefs`.

**Drawer not opening** → `openCashDrawer` → `drawerPulseBytes` → `print:raw`; verify the printer's drawer pin and `can_open_drawer`/`can_no_sale_open`.

**User cannot log in** → `/api/public/cashier-login` response, `pin_throttle_status` lock, `app_users.is_active`, `pin-lockout.ts` local counter, terminal token status.

**Wrong permissions** → `getEffectivePermissions`, `app_users.permissions`, `staff_roles`, `user_roles`, then the DB `enforce_*` trigger for the blocked action.

**Report numbers wrong** → the view (`v_daily_store_sales`/`v_daily_item_sales`), `sales-analytics.soldLines`, `profit.lineCost` (uses `sale_items.unit_cost` snapshot), branch filter.

**Database connection failure (desktop)** → `SqlConnectionModal` stage in the failure (`port|instance_lookup|driver|tls|login|database|write`), `electron/db/pool.cjs` ladder log, `pos:verify-write`, then "Reset connection" (`pos:reset-connection`). See `docs/offline-database-fix-report.md`.

**Sync stuck** → `/settings/sync` queue view (`sync-outbox.queueView`), quarantined rows, `sync_metadata` watermarks, `/api/public/sync-health`, terminal revocation state.

---

## 38. Safe Modification Guide

| Area | Safe to edit | Edit with care | Never edit without a plan |
| --- | --- | --- | --- |
| Presentation | `src/components/ui/*`, `src/styles.css`, `accent.ts`, `theme.tsx` | `AppShell.tsx`, `SidebarNav.tsx` | — |
| Register | isolated dialogs (`DiscountPad`, `ProductSearchDialog`) | `RegisterWorkspace.tsx`, `register-layout.ts` | `src/routes/index.tsx` checkout path |
| Money | — | `pos-promotions.ts` | `pos-types.r2/lineUnitDiscount/validateTenders`, `cartTotals` |
| Data | new read helpers in `pos-db.ts` | `db-query.ts`, `db-router.ts` | `commitOps`, `withRelativeStock` |
| Sync | `sync-log.ts` presentation | `sync-outbox.ts` | `sync-engine.drainOutbox/pullDelta` ordering |
| Auth | login screen copy | `pos-permissions.tsx` | `permissions.ts` keys, `pos-auth.tsx` session logic |
| Database | additive columns with defaults | new RLS policies | changing `row_version` triggers, `store_visible`, dropping columns used by the SQLite mirror |
| Desktop | `SqlConnectionModal` copy | `admin-pool.cjs` | `pool.cjs` ladder, `repo.cjs` outbox semantics, `offline_sqlite_v2.sql` |

Always: run `bunx vitest run` (107 tests) plus `bun run lint`; bump the version with `node scripts/bump-version.cjs`; update this document.

Rollback notes: schema changes must be additive-first because installed desktops mirror the schema; register-layout changes are per-device and recoverable via `factoryLayout()`.

---

## 39. Master Module Index

| Module | Files (primary) | Tables | APIs/RPCs | Risk |
| --- | --- | --- | --- | --- |
| Register/Sale | `routes/index.tsx`, `pos-store.tsx`, `pos-db.ts`, `pos-types.ts` | sales, sale_items, payment_transactions, item_activity_logs | `stock_apply_delta`, relay | CRITICAL |
| Sync | `sync-engine.ts`, `sync-outbox.ts`, `sync-relay.ts`, `electron/sync/worker.cjs` | sync_metadata, offline_sync_audit_log | `/api/v1/pos/sync` | CRITICAL |
| Auth/RBAC | `pos-auth.tsx`, `permissions.ts`, `staff-admin.*` | app_users, user_roles, staff_roles | `verify_terminal_pin`, `list_app_users` | CRITICAL |
| Inventory | `locations.ts`, `product-lookup.ts`, `stock-transfers.ts` | products, item_activity_logs, stock_* | `stock_transfer_receive` | HIGH |
| Shifts | `shift-close.ts`, `shift-sessions.ts` | shifts, shift_sessions, drawer_events | `shift_open` | HIGH |
| Settings | `settings-scope.*`, `branch-settings.ts` | pos_settings, settings_overrides/locks, secure_settings | `/api/settings*` | HIGH |
| Printing | `pos-print.ts`, `escpos.ts`, `receipt-printer.ts` | pos_settings | IPC print:* | MEDIUM |
| Members/Coupons | `coupons.ts`, `verification.*` | members, coupon_* , issued_vouchers | `coupon_claim`, `voucher_redeem` | MEDIUM |
| Bookings | `bookings-db.ts`, `booking-charges.ts` | bookings, booking_payments | — | MEDIUM |
| Terminals | `terminal-tokens.ts`, `terminal-crypto.ts` | terminal_tokens, terminal_commands | `terminal_token_*` | MEDIUM |
| Desktop DB | `electron/db/*`, `local-db.ts`, `sql-admin.ts` | MS SQL + SQLite | IPC | HIGH |
| Reports | `routes/reports.*`, `analytics-board.ts`, `profit.ts` | views + sales | — | LOW |

---

## 40. Master File Index

Full per-file purposes for `src/lib` (175 modules) are self-documented at the top of each file; the table below indexes them by concern so you can jump straight in.

| Concern | Modules |
| --- | --- |
| Sale & pricing | `pos-types.ts`, `pos-store.tsx`, `pos-promotions.ts`, `profit.ts`, `sales-analytics.ts`, `amount.ts`, `cart-draft.ts`, `held-orders.ts`, `bill-number.ts` |
| Data access | `pos-db.ts`, `db-router.ts`, `db-query.ts`, `db-mode.ts`, `row-versions.ts`, `keyset.ts`, `schema-guard.ts`, `schema-required.ts` |
| Sync | `sync-engine.ts`, `sync-outbox.ts`, `sync-relay.ts`, `sync-policy.ts`, `sync-status.ts`, `sync-log.ts`, `sync-audit.ts`, `sync-conflicts.ts`, `utils/syncResolver.ts` |
| Server (relay/auth) | `pos-relay.server.ts`, `relay-policy.server.ts`, `relay-claims.server.ts`, `sync-endpoint.server.ts`, `session-*.server.ts`, `pin-throttle.server.ts`, `cashier-login.server.ts` |
| Server functions | the 13 `*.functions.ts` modules (activity, idle timeout, rules, session, secure settings, settings scope, staff admin, system audit, terminal account, user sessions, verification, whatsapp, session verify) |
| Auth & RBAC | `pos-auth.tsx`, `pos-permissions.tsx`, `permissions.ts`, `staff-roles.ts`, `role-admin.ts`, `pos-users.ts`, `admin-session.ts`, `pin-lockout.ts`, `offline-credentials.ts`, `pos-credentials.ts` |
| Terminals & devices | `terminal-tokens.ts`, `terminal-crypto.ts`, `terminal-session.ts`, `terminal-commands.ts`, `terminal-activation-log.ts`, `device-secrets.ts`, `telemetry.ts`, `use-revocation-check.ts` |
| Branch & locations | `active-branch.ts`, `locations.ts`, `branch-policy.ts`, `branch-settings.ts`, `stores` routes |
| Settings | `settings-catalog.tsx`, `settings-groups.ts`, `settings-sections.ts`, `settings-scope*.ts`, `secure-settings*.ts`, `settings-crypto.server.ts` |
| Printing & hardware | `pos-print.ts`, `escpos.ts`, `receipt-printer.ts`, `receipt-template.ts`, `receipt-css.ts`, `customer-display.ts`, `camera.ts`, `native*.ts` |
| Health & diagnostics | `db-health.ts`, `db-relations.ts`, `health-scan.ts`, `health-relay.ts`, `system-health.ts`, `connection-health.ts`, `logic-health.ts`, `feature-schema.ts`, `app-health.ts` |
| Audit | `audit-log.ts`, `audit-format.ts`, `activity-events*.ts`, `system-audit*.ts`, `cashier-audit.ts`, `ticket-audit.ts`, `activity-journal.ts` |
| Updates | `app-updates.ts`, `android-updates.ts`, `web-bundle-updates.ts`, `update-manifest.ts` |
| Platform/local DB | `local-db.ts`, `sql-admin.ts`, `db-mode.ts`, `live-mode.ts`, `mobile-storage.ts`, `offline-snapshot.ts`, `server-origin.ts`, `native-http.ts` |
| UI utilities | `ui-visibility.ts`, `use-ui-scale.ts`, `layout-store.ts`, `register-layout.ts`, `register-modules.ts`, `register-actions.tsx`, `theme.tsx`, `accent.ts`, `notify.ts`, `notification-guard.ts`, `time-zone.ts`, `utils.ts` |

Electron files are indexed in [§6](#6-file-by-file-documentation).

---

## 41. Master Database Index

| Table | PK | Key FKs | Used by |
| --- | --- | --- | --- |
| products | id | — | register, inventory, purchasing, transfers, reports |
| product_barcodes | id | product_id | scanning |
| product_categories | id | parent_id | catalogue settings |
| uom_units | id | — | catalogue |
| sales | id | member_id | register, reports, receipts |
| sale_items | id | sale_id, product_id | register, reports, profit |
| payment_transactions | id | sale_id, booking_id, member_id | tenders, payment reports |
| payment_types | id | — | tender pad, settings |
| members | id | tier_id | members, register, loyalty |
| membership_tiers | id | — | loyalty |
| member_verifications | id | member_id | OTP |
| stores | id (text) | parent_id | everything branch-scoped |
| shifts | id | — | shift open/close, X/Z |
| shift_sessions | id | — | attendance |
| drawer_events | id | — | no-sale audit |
| held_orders | id (text) | — | hold/recall |
| bookings | id | member_id | bookings, racket service |
| booking_payments | id | booking_id | deposits |
| purchase_orders / _items | id | supplier_id / po_id, product_id | purchasing |
| suppliers | id | — | purchasing |
| stock_transfers / _items | id | transfer_id, product_id | transfers |
| stock_adjustments | id | product_id | stock ops |
| item_activity_logs | id | product_id | stock ledger, item history |
| stock_delta_applied | id | — | delta idempotency |
| promotions | id | foc_product_id | register, promotions |
| coupon_campaigns / issued_vouchers / coupon_events | id | campaign_id, member_id | coupons |
| app_users | id | — | auth, staff admin |
| cashiers | id | — | legacy migration only |
| user_roles | id | user_id | role checks |
| staff_roles | slug | — | custom roles |
| pin_attempts | key | — | throttling |
| terminal_tokens | id | location_id | activation |
| terminal_commands | id | — | remote commands |
| branch_telemetry | terminal_id | — | fleet dashboard |
| pos_settings | id | — | global settings |
| settings_overrides / settings_locks | id | — | scoped settings |
| secure_settings | id | — | encrypted credentials |
| integration_settings | id | — | providers |
| sync_metadata / offline_sync_audit_log | id | — | sync |
| audit_logs / activity_events / system_audit_logs | id | — | audit |
| security_findings | id | — | security panel |
| whatsapp_queue | id | — | bill messaging |
| public_flags | key | — | public landing |
| sku_audit | id | — | SKU history |

---

## 42. Architecture Diagrams

### Final high-level architecture

```text
USER (cashier · supervisor · customer on a public link)
  ↓
ROUTES  src/routes/**  (TanStack file routes, SSR)
  ↓
COMPONENTS  src/components/pos/**  ·  ui/**
  ↓
CONTEXT / HOOKS  PosProvider · AuthProvider · PermissionsProvider · PosRulesProvider · ManagerGateProvider
  ↓
DOMAIN LOGIC  src/lib/**  (pricing, permissions, promotions, shifts, printing)
  ↓
GATEWAY  db-router.ts → pos-db.commitOps
  ├─→ supabase-js (RLS) ─────────────→ Supabase Postgres ── RPC · triggers · RLS
  ├─→ /api/v1/pos/sync (service key) → relay-policy authorisation → Postgres
  ├─→ window.pos IPC ───────────────→ MS SQL (branch) + SQLite mirror/outbox
  └─→ sync-outbox (queued) ─────────→ drained by sync-engine every 15s
  ↓
SALES · INVENTORY · PAYMENTS · MEMBERS · BOOKINGS · REPORTS · AUDIT
```

### Dependency chain

```text
PRODUCTS → INVENTORY → REGISTER → PAYMENTS → SALES → REPORTS/PROFIT
   ↑            ↑          ↑           ↑         ↑
CATEGORIES  LOCATIONS   MEMBERS   PAYMENT_TYPES SHIFTS
                          ↑
                     PROMOTIONS/COUPONS
```

---

## 43. Where Do I Look?

| Problem with… | Start here (file) | Function | Database |
| --- | --- | --- | --- |
| Product price | `src/routes/inventory.tsx`, `pos-db.productToRow` | `commitProduct` | products.selling_price (trigger `enforce_product_price_permissions`) |
| Discount | `src/lib/pos-types.ts` | `lineUnitDiscount`, `cartTotals` | sale_items.discount_* |
| Tax | `src/lib/pos-store.tsx` | `cartTotals` | pos_settings.tax_mode/tax_percentage |
| Barcode | `src/lib/product-lookup.ts` | `resolveByBarcode` | products, product_barcodes |
| Inventory | `src/lib/pos-db.ts` | `withRelativeStock`, `applyStockDeltas` | item_activity_logs, products.stock_by_store |
| Sale | `src/lib/pos-db.ts` | `db.commitSale`, `commitOps` | sales, sale_items |
| Payment | `src/lib/pos-types.ts`, `TenderSplit.tsx` | `validateTenders` | payment_transactions, payment_types |
| Refund / exchange | `src/routes/index.tsx` | exchange handlers | sales.is_exchange / sale_items.is_return |
| Receipt | `src/lib/pos-print.ts` | `printSaleReceipt` | pos_settings.receipt_design |
| Cash drawer | `src/lib/receipt-printer.ts` | `rawPulse`, `drawerPulseBytes` | drawer_events |
| Shift | `src/lib/shift-close.ts` | `reconcileShift` | shifts |
| Cashier login | `src/lib/cashier-login.server.ts` | `cashierLoginServer` | app_users, pin_attempts |
| Permission | `src/lib/permissions.ts` | `hasPermission`, `getEffectivePermissions` | app_users.permissions, user_roles, staff_roles |
| Manager override | `src/lib/pos-rules.server.ts` | `verifyManagerPinInDb` | **missing RPC — R-01** |
| Customer / member | `src/lib/pos-db.ts` | `commitMember` | members |
| Supplier | `src/lib/suppliers.ts` | `saveSupplier` | suppliers |
| Purchasing | `src/routes/purchasing.tsx` | PO commit helpers | purchase_orders(_items) |
| Transfers | `src/lib/stock-transfers.ts` | `receiveTransferInDb` | stock_transfers(_items) |
| Reports | `src/lib/analytics-board.ts` | `fetchBoard` | v_daily_store_sales, v_daily_item_sales |
| Sync stuck | `src/lib/sync-outbox.ts` | `queueView`, `retryOp` | sync_metadata |
| Offline / connection | `src/lib/db-mode.ts` | `effectiveDatabaseMode` | — |
| Desktop SQL connection | `electron/db/pool.cjs` | connection ladder | MS SQL |
| Terminal activation | `src/lib/terminal-tokens.ts` | `activateTerminal` | terminal_tokens |
| Settings not sticking | `src/lib/settings-scope.server.ts` | `writeScopedSettings` | settings_overrides, settings_locks |
| Audit trail | `src/lib/audit-log.ts` | `logger` | audit_logs, activity_events |

---

## 44. Future Maintenance Rule

For any future change (add/remove/modify a feature, fix a bug, alter a table, change a calculation, permissions, hardware, reports, inventory or payments):

1. Find the area in [§43](#43-where-do-i-look) and [§39](#39-master-module-index).
2. Identify affected modules, files, functions and tables from [§35 Change Impact Analysis](#35-change-impact-analysis).
3. State the side effects before editing.
4. Make the change.
5. Run `bunx vitest run` and the regression items in [§36](#36-testing) that touch the area.
6. Bump the version (`node scripts/bump-version.cjs`).
7. **Update this same document** — never create a second documentation file.

---

## 45. Final Audit Summary

**What was inspected:** the full `src/` tree (routes, components, lib, integrations), the full `electron/` tree, `package.json`/build config, the live Postgres schema (52 tables, 3 views, ~80 functions, ~110 triggers, all RLS policies), the test suite (executed: 107 passing), and the existing `docs/`.

**What was not accessible / UNKNOWN:**
- Runtime behaviour on real Windows hardware (SQL Server instance discovery, printer/drawer pulse, Windows Integrated auth) — host-dependent.
- Production index usage and query timings (no `pg_stat` sampling performed).
- Whether RLS is *enabled* (as distinct from policies existing) on `cashiers` and `pin_attempts`.
- Contents of any deployed secret values (intentionally not read).
- Android device behaviour (ML Kit scanning, APK OTA install) — device-dependent.

**Highest-risk areas to modify:** `commitOps` → `cartTotals`/`validateTenders` → `permissions.ts` + DB `enforce_*` triggers → `sync-engine` ordering → `electron/db/repo.cjs` outbox → `offline_sqlite_v2.sql` schema.

**Highest-priority bugs:** R-01 (rules/override backend missing) → R-02 (`product_delete_guard` missing) → R-03 (silent catches hide the above) → R-05 (permissive duplicate RLS) → R-08 (sequential stock deltas with no retry).

**Highest-priority tests to add:** sale idempotency under retry; stock delta double-apply; `cartTotals` tax-mode matrix; manager-gate accept/deny; settings inheritance and locks.

**Recommended improvements (post-audit):** create the missing database objects and surface their absence in diagnostics; batch stock deltas into one RPC with a retry queue; drop the permissive duplicate policies; split `src/routes/index.tsx`; consolidate the overlapping audit/sync-log modules; add an end-to-end checkout test against a seeded database.

## Part 3 — Delete protection, silent failures, stock recovery (v1.3.16)

- `product_delete_guard(_product_id uuid)` installed; signed-in staff only. It is the deterministic delete guard; an unreachable guard now blocks the delete instead of allowing it. Lookup indexes added on the five referencing columns.
- Swallowed failures now emit structured diagnostics (`src/lib/diagnostics.ts`): missing backend object, stock delta failed, local mirror failed, duplicate-checkout lookup unavailable, shift lookup unavailable. Codes and ids only — no PINs, tokens, prices or customer data.
- Failed stock movements are parked in `src/lib/stock-recovery.ts` and retried from Data Sync & Audit. Retry is idempotent via `stock_delta_applied.movement_id`.
- Shift open treats an "unknown" existence check as unverified, not as "no shift"; it warns instead of failing.

## Part 7 — Regression audit and production hardening (v1.3.20)

Final end-to-end audit after Parts 1–6. No new features were added.

### Bugs fixed

- **Junk rule values silently disabled a manager gate.** `normalizeRules()`
  treated any unrecognised value (e.g. `"yes"`) as `false`, so a malformed
  rules row could switch off a PIN requirement. Unrecognised values now keep
  the shipped rule; only `true/false/1/0/"true"/"false"/"1"/"0"` change a gate.

### Database migrations

- Dropped the redundant duplicate unique index
  `sales_client_transaction_id_uidx`; `sales_client_transaction_id_key` still
  enforces one bill per checkout attempt. Every sale insert now maintains one
  index fewer.

### Security review (no exploitable gaps found)

- Every table in `public` has RLS enabled (0 tables without it).
- No role in `public` is granted to `anon`. Public pages reach data only
  through six SECURITY DEFINER routines (`coupon_claim`,
  `member_welcome_claim`, `voucher_by_token`, `terminal_token_claim`,
  `terminal_token_heartbeat`, `terminal_token_status`), each of which validates
  its own input. Policies whose role list still reads `public` are therefore
  unreachable anonymously.
- `cashiers` and `pin_attempts` remain deny-all by design, reachable only
  through `verify_cashier_pin` / `pin_throttle_*`.
- Branch isolation verified on both read and write: `sales`, `sale_items`,
  `shifts`, `bookings`, `held_orders`, `stock_adjustments`,
  `payment_transactions` and `branch_telemetry` all carry
  `store_visible(store_id)` / `user_has_store_access(...)` in USING **and**
  WITH CHECK, so a till cannot read or insert another branch's rows.
- Manager overrides are proved by an HMAC grant bound to a single action with a
  5-minute expiry; forged, replayed-for-another-action and expired grants are
  all rejected (now covered by tests).

### Connection and sync

- Sale idempotency confirmed end to end: `commitSale()` short-circuits when the
  attempt id already exists centrally, and still saves when the duplicate check
  itself cannot run, with the unique index as the final guard.
- Stock movements stay idempotent through `stock_delta_applied.movement_id`.
- Bill numbers embed branch + platform + terminal + day, so the global unique
  index on `sales.bill_number` cannot collide across branches or offline tills.

### Refactor

- Settings inheritance (Private > Branch > Cluster > Global, with global locks)
  was extracted from the store memo into the pure
  `resolveScopedSettings()` in `src/lib/branch-settings.ts` so the precedence
  rules can be tested directly. Behaviour unchanged.

### Files changed

- `src/lib/pos-rules.ts` — stricter boolean coercion.
- `src/lib/branch-settings.ts` — new `resolveScopedSettings()`.
- `src/lib/pos-store.tsx` — uses the extracted resolver.
- `src/lib/__tests__/tax-matrix.test.ts`, `manager-gate.test.ts`,
  `settings-inheritance.test.ts`, `checkout-e2e.test.ts` — new.
- Migration: drop duplicate sales index.

### Tests

24 files, **177 tests passing** (was 148). New coverage: tax modes and discount
spreading, exchange/refund totals, manager gate mapping and override grants,
settings inheritance and locks, checkout commit composition, split tenders and
retry idempotency.

### Known limitations

- Electron SQL Server handshake and printer/drawer behaviour still need a real
  Windows till; they cannot be exercised in CI.
- No seeded-database integration test; checkout coverage stops at the database
  boundary (the ops actually sent).
- `settings_effective` and friends cannot be called from the maintenance shell
  role, so their SQL is verified by review, not by an automated round trip.

### Recommended next actions

1. Run one full manual pass on a Windows till: connect, open shift, sell, print,
   open drawer, close shift with X/Z.
2. Add a seeded integration environment so cross-branch RLS can be asserted with
   two real signed-in users instead of by policy inspection.
3. Keep the audit/sync-log modules consolidation on the backlog; it is the last
   sizeable duplication left.
