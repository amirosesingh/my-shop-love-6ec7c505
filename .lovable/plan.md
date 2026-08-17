# Multi-Location POS & Central Warehouse Management

## What this delivers

A location model that supports real buildings — a central hub, branch stores, and nested sub-warehouses (floors, vaults, annex rooms) — plus a receiving pipeline where every inbound delivery lands at the central hub first and is then routed to a precise sub-location. Locations can be renamed or archived at any time without corrupting past receipts, and the app refuses to open the register until at least one active location exists.

## 1. Location model and hierarchy

Extend the locations record with:
- Location type: Store, Main Building, Sub-Warehouse, Central Warehouse
- Parent location (nesting; a branch can hold many floors/rooms)
- Building name, floor/room designation, address, contact details
- Active/archived flag, and a single "is central hub" flag

Location Setup screen gains a tree view (parent → children), inline create/edit for every field, and an Archive action instead of Delete.

Archiving rules:
- Hard delete is removed everywhere.
- Archiving is blocked while the location holds positive stock; the dialog names the remaining items and links to a transfer.
- Archiving a parent requires its children be archived first.

## 2. Receipt and history integrity

Each sale stores a permanent snapshot of the location name and address at the moment of sale. Receipts, reprints, and reports render the snapshot, so renaming a store later never rewrites printed history. Older sales without a snapshot fall back to the current location record.

## 3. Central-first inbound routing

All inbound stock (supplier purchase orders, external returns, inter-branch distribution) is received into the Central Hub context first. After receiving, a routing step asks where the stock goes:
- Destination branch has exactly one sub-location → auto-selected, no extra click.
- Destination branch has several → a target selector lists the exact floor/room/annex.
- Movements execute as a single atomic operation that debits the hub and credits the target in the same write, reflected immediately on one PC.

Inventory dashboard gains a breakdown toggle: company-wide totals, per-branch, and per-floor/sub-warehouse.

## 4. Connection pool isolation (desktop)

Keep the two pools fully separate: the operational POS pool stays reserved for register, stock, and cashier work, and the admin explorer pool handles schema browsing and inspection. Admin context switches and long inspection queries run only on the admin pool so the register is never blocked.

The inspection panel stays permission-gated to Admin and read-only: submitted SQL is parsed before execution, only a single SELECT/WITH retrieval is allowed, and anything that writes data or changes structure is rejected with a security error. This tightens the existing validator to also reject multiple statements, comment-obfuscated payloads, and procedure execution.

## 5. No automatic writes

Audit and remove any startup path that creates tables, resets state, or seeds sample rows. Schema scripts remain manual files the operator applies deliberately; the app only writes in response to an explicit user action (save location, receive stock, complete sale, edit profile). Boot performs read-only checks only.

## 6. Boot check and mandatory setup

On startup the app runs a read-only count of active locations.
- Zero active locations → register and inventory are blocked, a modal reads "No active store or warehouse found. Please create your primary location to continue.", and the user is sent to Location Setup.
- One or more → normal dashboard load.

## Technical notes

- Migration adds `location_type`, `parent_id`, `is_central`, `building_name`, `floor_label`, `is_active` to `stores`, plus `store_name_snapshot` / `store_address_snapshot` on `sales`; grants and RLS follow the existing store-visibility pattern. Mirrored into the offline SQL Server and SQLite schema files.
- Stock-by-location continues to use the existing `stock_by_store` map, keyed by sub-location id so floors roll up to their parent for branch totals.
- Routing reuses `stock_transfers` / `stock_transfer_items` with a `transfer_scope` of `intra_branch`, executed through the existing atomic receive function.
- Boot check runs in a router-level guard alongside the current shift guard; archive safety and hierarchy validation are enforced by database triggers so offline terminals obey the same rules.
