# Fix "column store_id does not exist" when running the purchase order scoping SQL

## What the error means

`supabase/sql/32_purchase_order_scoping.sql` assumes the receiving-invoice columns
already exist. They do exist on the managed Lovable Cloud database (verified:
`purchase_orders` has `store_id`, `store_code`, `invoice_date`, `invoice_entry_date`,
`updated_at`; `purchase_order_items` has `sku`, `updated_at`).

They do **not** exist on a database built only from the numbered files in
`supabase/sql/`: `06_inventory_ops.sql` creates `purchase_orders` with just
id / po_number / supplier_name / operator_name / total_cost / total_items_count /
created_at / supplier_id. The extra columns were only ever added by the separate
one-off file `supabase/schema32.sql`, which is not part of the numbered run order.

So on your own/self-hosted database, file 32 fails on its very first statement:
`CREATE INDEX ... purchase_orders (store_id)`.

## The fix

Make `supabase/sql/32_purchase_order_scoping.sql` self-sufficient, so it can be run
on any database, in any order after `06_inventory_ops.sql`, and re-run safely.

Add a column section at the top of the file, before the indexes and policies:

- `purchase_orders`: `ADD COLUMN IF NOT EXISTS` for `store_id text`, `store_code text`,
  `invoice_date date`, `invoice_entry_date timestamptz DEFAULT now()`,
  `updated_at timestamptz NOT NULL DEFAULT now()`
- backfill `invoice_entry_date` from `created_at` where it is null
- `purchase_order_items`: `ADD COLUMN IF NOT EXISTS` for `sku text`,
  `updated_at timestamptz NOT NULL DEFAULT now()`
- the two `touch_updated_at` BEFORE UPDATE triggers (dropped and recreated, so re-running is safe)

This is exactly what `supabase/schema32.sql` already does, folded into the numbered
file so the two can never drift apart again.

Also guard the helper functions the policies call: if `public.is_app_supervisor()` or
`public.store_visible()` are absent on an older database, the policy creation will fail
next. The file will create no-op-safe fallbacks only when missing, using
`CREATE OR REPLACE ... IF NOT EXISTS`-style DO blocks, so the policies always compile.

Nothing else changes: same indexes, same branch-aware policies, same grants. No data is
deleted and no table is dropped.

## Technical notes

- Files touched: `supabase/sql/32_purchase_order_scoping.sql` only.
- No application code changes; the managed database already has these columns, so
  re-running the corrected file there is a no-op.
- `supabase/schema32.sql` stays as-is for historical reference.
