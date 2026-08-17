# Multi-Location POS & Central Warehouse Management

Locations today are a flat list (`stores`: id, code, name, address, phone, group_id) with hard delete and no hierarchy. This plan adds a warehouse hierarchy, a central-first receiving pipeline, soft-delete with safety checks, a boot check, and confirms the dual-pool/read-only rules already partially in place.

## 1. Location model (hierarchy + soft delete)

Add to `stores`, via a migration (new columns only, nothing dropped, no seeding):
- `location_type` — `store` | `main_warehouse` | `sub_warehouse` (default `store`)
- `parent_id` — self-reference for nesting
- `building_name`, `floor_label`, `room_label`, `contact_name`, `contact_phone`
- `is_active` (default true), `archived_at`

Mirror the same columns in the offline SQL Server and SQLite schema files so local tills stay interchangeable.

`Store` type, `rowToStore`/`storeToRow`, and the offline snapshot pick up the new fields.

## 2. Locations screen rework (`/stores`)

- Create/edit form gains: type, parent location picker (only non-archived, no cycles), building, floor/room, contact.
- Tree view grouped by parent (Main Building -> floors/annexes), with an "Archived" section toggle.
- Replace delete with **Archive**: blocked with a clear message when the location still holds positive stock in any product; offer "Transfer stock out first" pointing at `/transfers`.
- Restore action for archived locations. Renaming stays free-form and never touches history.
- Every archived/inactive location is filtered out of the register store switcher, transfer targets, and receiving targets, but remains visible in reports.

## 3. Receipt snapshot integrity

Sales and bookings persist a snapshot of store name/address/phone at the moment of sale (`store_snapshot` jsonb on `sales`, written in `pos-db.ts` on commit). Receipt printing and receipt history use the snapshot when present and fall back to the live store record for old rows, so renames never rewrite past invoices.

## 4. Central-first inbound routing

- A location can be flagged as the **Central hub** (the `main_warehouse` for its group). Purchasing/receiving defaults its receive context to that hub instead of the current till branch.
- After the goods land at the hub, the receive dialog resolves the destination branch's sub-warehouses:
  - zero/one child -> auto-selected silently,
  - two or more -> a target selector (floor / room / annex) is shown and required.
- Confirming performs one atomic movement: source hub balance down, target sub-warehouse balance up, one `stock_transfers` record with items, written in a single call, with the existing outbox fallback when offline.
- Inventory dashboard gains a per-location breakdown (company total, then rows by branch and sub-warehouse) with a collapse per parent.

## 5. Boot check

A `LocationGate` wrapper (next to the existing first-run setup) passively counts active locations on startup. Zero active locations -> a blocking modal "No active store or warehouse found. Please create your primary location to continue." with a single action routing to the location setup screen; register and inventory routes stay inaccessible until one exists. Locations present -> normal boot, no extra queries.

## 6. Pools, read-only guard, no auto-writes (verification pass)

- Confirm the operational POS pool (`electron/db/pool.cjs`) and admin pool (`electron/db/admin-pool.cjs`) stay separate, and that admin context switches (`USE [db]`) never touch the POS pool.
- Harden the read-only guard so it is enforced in the **main process** as well as the renderer: parse the submitted T-SQL, allow only `SELECT`/`WITH`-led single statements, reject multi-statement payloads, comments used to smuggle writes, and any DDL/DML keyword; throw a security error rather than executing.
- Audit boot paths for automatic schema application or seeding and gate anything found behind an explicit user action (the desktop `applySchema()` on connect becomes a "Apply/upgrade local schema" button in the local database settings, with a confirmation).

## Technical notes

- Migration is additive and idempotent; every new public column keeps existing grants and RLS. No table drops, no INSERTs.
- Stock stays in `products.stock_by_store` keyed by location id, so sub-warehouses are just additional location ids — no stock-table rewrite.
- Archiving safety check reads current stock per location before flipping `is_active`.
- Files touched: `supabase/migrations/*`, `db/offline/pos-offline-sqlserver.sql`, `electron/db/offline_sqlite_v2.sql`, `src/lib/pos-types.ts`, `src/lib/pos-db.ts`, `src/lib/pos-store.tsx`, `src/routes/stores.tsx`, `src/routes/purchasing.tsx`, `src/routes/transfers.tsx`, `src/routes/inventory*.tsx`, `src/lib/pos-print.ts`, `src/lib/sql-admin.ts`, `electron/db/admin-pool.cjs`, `electron/db/pool.cjs`, plus a new `LocationGate` component.
