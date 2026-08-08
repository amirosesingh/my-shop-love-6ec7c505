# Database cleanup + fixing the "central database key is not configured" sync error

## What I found

**Two databases are in play.**

1. The **POS database** (the operator's own project) — this is the real one. Almost the whole app reads and writes here through the external client and the server relay.
2. The **Lovable Cloud database** — only two files still talk to it: product categories / units of measure (`src/lib/catalog-meta.ts`) and encrypted secure settings (`src/lib/secure-settings.server.ts`). Both of those tables also exist on the POS database, so today categories saved from Settings land in a different database from everything else.

**Tables on the POS database that no code touches anywhere:**

- `manager_override_events`
- `store_groups`
- `v_sale_line_facts` (a reporting view)

Everything else in the POS database is referenced by live code (sales, sale items, shifts, shift sessions, held orders, bookings, booking payments, drawer events, stock adjustments, SKU audit, audit logs, members, membership tiers, promotions, coupons, vouchers, coupon events, products, categories, units, suppliers, purchase orders and items, stock transfers and items, stores, terminals, staff, cashiers, roles, settings, scoped settings, public flags, security findings, WhatsApp queue, and the two daily sales views).

**The sync error.** The register sends every `stores` write through the server relay, and the relay refuses to run without the POS service key. Locally the key is present and the endpoint answers normally, so the message you see means the **deployed preview/published worker is not receiving the POS service key** — not that the sync code is wrong.

## Plan

### 1. Fix the sync / "key is not configured" error
- Call the deployed sync endpoint and read the server logs to confirm the key is missing at runtime rather than something else failing.
- Re-save the POS service key so the deployment picks it up, then re-test the endpoint and the Sync & Backup panel until saving a location succeeds.
- Improve the message shown in Sync & Backup so a missing key reads as "syncing paused — an administrator must configure the central database key", and keep the queued change so nothing is lost.

### 2. One drop file for unused tables
- Add `supabase/sql/98_drop_unused.sql` with guarded `DROP VIEW/TABLE IF EXISTS ... CASCADE` for `v_sale_line_facts`, `manager_override_events` and `store_groups`, a comment at the top saying it is destructive and optional, and a note in `supabase/sql/README.md`.
- Nothing else is dropped: every other table is in active use.

### 3. Point categories and units at the POS database
- Switch `src/lib/catalog-meta.ts` from the Lovable Cloud client to the POS client so product categories and units live with the rest of the catalogue.

## Question before I build

Item 3 changes where category/unit data is stored. If you have categories already saved on the Lovable Cloud side, they will not appear until they are re-entered or copied over. Tell me if you'd rather I leave that alone, and I will do items 1 and 2 only.