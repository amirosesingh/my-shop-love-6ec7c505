# v1.1.x: Android updates, drawer reasons, region/time, branches & stock transfers

## 1. Version line
Move the release to 1.1.1, and keep the bump script stepping 1.1.2, 1.1.3, … on each release.

## 2. Android update status fix
Today the update card only knows about the Windows updater, so on Android it reports "automatic updates are not supported in this version". The Android feed reader already exists but is not wired into that card.
- Make the update settings card detect the platform and, on Android, show installed version, latest version from the update feed, download progress and an Install button.
- Show a real error message when the feed can't be reached instead of "not supported".
- Keep Windows and browser behaviour unchanged.

## 3. Cash drawer reason
- Replace the reason dropdown on manual drawer opens with a required free-text field (trimmed, minimum a few characters).
- Keep the manager/PIN gate and keep writing the typed reason to the drawer event log, so reports and the audit trail show the operator's own wording.

## 4. Region, date and time settings
- Add a Region & time section in settings: region/time-zone picker, date format and time format (12/24h).
- Save it with the other settings so every terminal follows the same clock formatting across headers, receipts, reports and audit timestamps.

## 5. Data-storage audit (report first, no code changes)
Inspect each area and report what reaches the database and what is still local-only, then agree on fixes:
- Sales, exchanges/refunds and their line items
- Receipts/slips and reprints
- Inventory, stock adjustments and SKU history
- Staff accounts, roles, permissions, shift sessions
- Every settings section

Delivered as a short table in chat: area, stored in database yes/no, what is missing.

## 6. Branches, clusters and stock transfers

### Database
New tables, each with access rules and grants:
- `branch_groups` — cluster/group name, so branches can be isolated into groups.
- `branches` — name, code, group, active flag; existing stores are migrated into it.
- `branch_products` — which product sits in a branch's catalog, with a visible flag.
- `branch_stock` — quantity per branch per product.
- `stock_transfers` — transfer number (TR-YYYY-0001), source branch, destination branch, status (PENDING, APPROVED, IN_TRANSIT, COMPLETED, REJECTED, CANCELLED), notes, created by, approved by, timestamps.
- `stock_transfer_items` — transfer, product, quantity greater than zero, removed together with its transfer.

One database function performs completion atomically: decrement source stock, increment destination stock (creating the row when absent), and for a cross-group transfer create the missing `branch_products` row for the destination group with visibility on. Stock can never be lost halfway.

### Rules
- Intra-group: source requests, destination approves, stock moves on completion.
- Inter-group: same flow plus automatic catalog mapping into the destination cluster.
- Cluster isolation everywhere else stays exactly as it is.

### Stock Transfers page
- New Transfer form: source branch pre-filled with the user's branch (admins can change it), destination dropdown listing all active branches with their group in the label, multi-row product picker validating live source stock, submit as PENDING.
- List with tabs: Incoming requests, Outgoing requests, Completed history. Columns: transfer #, from, to, type (Intra-Group / Inter-Group), total items, status, created date, actions.
- Actions: destination sees Approve & receive / Reject; source sees Cancel while pending.
- Inter-group banner: "Notice: This item will be mapped to the target cluster's catalog upon transfer completion."

## Technical notes
- Branch tables land in one migration with GRANTs and RLS; completion logic lives in a `SECURITY DEFINER` function called from a server function so it runs as a single transaction.
- `src/routes/transfers.tsx` is rebuilt on the new tables; the current in-app transfer state is migrated on first load.
- Android update wiring reuses `src/lib/android-updates.ts` inside `AppUpdateSettings`.
- Region/time settings extend `pos_settings` plus a shared formatting helper used by receipts, reports and audit views.

## Order of work
1. Version 1.1.1, Android update fix, drawer reason, region/time settings.
2. Data-storage audit report.
3. Branch/cluster schema and migration.
4. Stock transfer engine and UI.