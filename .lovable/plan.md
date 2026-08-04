# Landed cost, column permissions, group live board, smarter sync, drawer discipline

## 1. Cost after landing (Inventory & Supply)

- New **Landing %** setting under Settings › Business & pricing: one default for the whole business.
- Each product can override that percentage on its own form; blank means "use the default".
- New **Landed cost** column in the product table: `cost x (1 + landing %)`, shown next to cost, used in stock-value totals and the group stock export.
- Margin figures on the catalog/report screens switch to landed cost so profit reads true.

## 2. Column visibility per role

New **Column visibility** page in Settings (admin only):
- A grid of role (cashier, supervisor, warehouse, manager…) against each sensitive column: cost, landing %, landed cost, margin, supplier, stock value, ecom price.
- Hidden columns disappear from the table, the CSV export and product detail for those roles; admins always see everything.
- Same map also drives the All Shops stock table.

## 3. Register POS control visibility per user

- The staff permission matrix gains a **Register layout** block: one toggle per register control (each payment method button, split payment, hold, void, exchange, discount, no-sale drawer, member lookup, booking).
- Turning a toggle off hides that control for that staff member; nothing is silently disabled-but-visible.
- Defaults keep today's behaviour so no one loses a button on upgrade.

## 4. Live data board — all shops

The All Shops page gains a full transactions table under the shop cards: every sale across all branches with time, shop, terminal, cashier, bill number, items, payment type, discount, total and shift. Filters for shop, date range, cashier and payment type, plus CSV export. Auto-refreshes as sales sync in.

## 5. SKU uniqueness and SKU audit trail

- Saving a product rejects a SKU already used anywhere in the catalog, with a "suggest next free code" button.
- Bulk import flags duplicate rows instead of importing them.
- Every generated or manually overridden SKU writes an audit entry: code, product, whether it was auto or overridden, who did it, which shop and terminal, and when. Visible in the audit trail filtered to "SKU".

## 6. Automatic inventory propagation

- Any catalog or stock change (create, edit, adjust, receive, transfer, sale) is broadcast: it lands in the local database, queues for central, and other tills pick it up from a live subscription — no manual refresh.
- Tills also poll on a short interval as a safety net for connections that drop the live channel.
- New products keep back-filling zero stock at every branch, as today.

## 7. Inventory sync status panel

New panel on the Sync page (and a compact version on All Shops):
- Per shop and per direction (shop → central, central → shop): last successful sync time, items waiting, in-progress count, and the last error in plain English.
- Progress bar while a drain is running, a per-shop "Retry now" button and a link to the failed items.

## 8. Background sync with retries and conflict resolution

- The existing outbox gains a background worker that keeps retrying with growing gaps after temporary failures, resumes automatically when the connection returns, and never blocks other shops' queues.
- Conflicts (same product edited in two places) resolve by newest change wins for catalog fields, and by applying the change amount rather than the absolute number for stock, so two branches selling at once cannot overwrite each other.
- Anything that still cannot be applied is parked and listed in the sync panel for a person to accept or discard.

## 9. Cash drawer discipline

New **Cash drawer** block in Settings (Business & pricing):
- Choose when the manual open button works: *always ask a reason and manager PIN*, *only ask for reasons other than "drawer failed to open"*, or *reason note only, no PIN*.
- The register's drawer button follows that rule and every open is logged with the reason, staff and shop as today.

Reprint must never kick the drawer:
- Reprints from Bill Search & History and the Settings test print will be routed through a print path that carries no drawer pulse, and a "Never send a drawer pulse when printing" switch is added to the printer settings.
- Because the app's reprint code does not currently call the drawer itself, the first step is to confirm the source — printer driver setting, the raw byte stream, or an app path we have not spotted. If it turns out to be the Windows driver, the fix is a documented driver setting plus the app-side switch above.

## Technical notes

- `Product` gains `landingPct?: number`; settings gain `landingPctDefault`, `columnVisibility: Record<role, string[]>`, `drawerPolicy`, and `neverPulseOnPrint`. New migration for the matching product/settings columns and an `sku_audit` table with grants and staff-only policies.
- Column gating goes through a `useVisibleColumns(role)` helper used by `src/routes/inventory.tsx`, `src/routes/all-shops.tsx` and report tables.
- Register control gating extends `src/lib/permissions.ts` with a `register_ui.*` group read by `src/routes/index.tsx`.
- Propagation: Supabase realtime channel for `products` plus the existing outbox in `src/lib/sync-outbox.ts`; conflict rules live in `src/utils/syncResolver.ts`.
- Sync status derives per-shop/per-direction stats from the outbox and `src/lib/sync-log.ts`; background worker extends `startSyncEngine` in `src/lib/sync-engine.ts`.
- Drawer: `openCashDrawer` in `src/lib/pos-print.ts` gains policy checks; `printHtml` gets an explicit no-pulse flag used by reprint and test print.
