# Central schema scan: real drift vs false alarms, and the client_transaction_id fix

## What `client_transaction_id` is for

It is the **duplicate-payment guard**. When you tap Pay, checkout creates one
attempt id for that sale. Every payment row is stamped with it
(`<attempt id>:pay:1`, `:pay:2`, …). If the sync push half-fails and retries —
bad network, app restart — the central database recognises the stamp and treats
the row as already stored instead of inserting the same payment twice. Sales
carry the same stamp on the sale header for the same reason.

Your central database is **genuinely missing this column** on
`payment_transactions`, so every payment push that includes the stamp is
rejected and the row parks in the sync queue. That is the payment sync failure
you have been seeing.

## What the scan is really showing (verified against your central database)

I ran the exact same read the in-app scan performs. Result:

- **No tables are missing** centrally — all 58 are present.
- **Only 5 columns are genuinely missing**, nothing more:
  - `payment_transactions.client_transaction_id` (the payment guard above)
  - `pos_settings.receipt_css`
  - `pos_store_settings.require_pin_terminal_reset`, `row_version`, `updated_by`
- **The long "many columns missing" list is a false alarm in the comparison,
  not in your database.** The scan compares the central database against the
  till's *local* SQL Server master schema. That local schema deliberately adds
  till-only bookkeeping columns to every table (`is_synced`, `sync_status`,
  `last_error_at`, and a local `client_transaction_id`) plus till-only tables
  (`sync_state`, `system_settings`, `transfers`, `shift_notifications`). These
  were never meant to exist centrally. The scan's exclusion list still filters
  the *old* bookkeeping names (`synced_at`, `pending_sync`, …), so every table
  lights up red even though the central database is 99% in step.
- The central database also has some **leftover columns from older versions**
  (`order_id`, `payment_method`, `transaction_reference` on
  `payment_transactions`, etc.). They are harmless and need no action.

## Changes

### 1. Make the central scan honest — `src/components/database/SchemaPanel.tsx`

- Replace the outdated exclusion list with the real till-only bookkeeping set:
  `is_synced`, `sync_status`, `last_error_at`, `synced_at`, `pending_sync`,
  `sync_attempts`, `sync_error`.
- Treat `client_transaction_id` as central-expected **only on `sales` and
  `payment_transactions`** (matching the authoritative central schema); on every
  other table it is till-only and excluded.
- Exclude the till-only tables (`sync_state`, `system_settings`, `transfers`,
  `shift_notifications`) from the central comparison.
- After this, the scan shows exactly the 5 real missing columns instead of
  ~150 phantom ones.

### 2. Repair the real drift — central PostgreSQL script

Keep the approved workflow: the panel's **Download central PostgreSQL repair
script** produces exactly this, which you run once in your central project's
SQL editor:

```sql
alter table public.payment_transactions add column if not exists client_transaction_id text;
create index if not exists payment_transactions_client_txn_idx
  on public.payment_transactions (client_transaction_id)
  where client_transaction_id is not null;
alter table public.pos_settings add column if not exists receipt_css text not null default '';
alter table public.pos_store_settings add column if not exists require_pin_terminal_reset boolean;
alter table public.pos_store_settings add column if not exists row_version integer not null default 1;
alter table public.pos_store_settings add column if not exists updated_by text;
notify pgrst, 'reload schema';
```

- Types and defaults match the reference database exactly (verified above).
- The final `notify pgrst` line makes the API layer see the new columns
  immediately — without it, a re-scan right after the repair can still report
  them missing from a stale cache.
- The generator in `SchemaPanel.tsx` is updated so index creation and the
  schema-reload line are always appended to the download.

### 3. Unblock the parked payment rows

- After you run the repair script, re-scan in the Schema Manager: expected
  result is **zero drift**.
- Then open the Sync Hub and use **Retry all parked rows**: the parked
  `payment_transactions` rows push once and flip to synced. The idempotency
  stamp guarantees no duplicate payments appear centrally.
- Verification: one previously parked payment row goes `parked → synced`, and
  the central `payment_transactions` count increases by exactly the parked
  rows, no more.

## Technical notes

- Files: `src/components/database/SchemaPanel.tsx` (exclusion set, per-table
  `client_transaction_id` rule, local-only table filter, repair-script
  generator additions). No database-migration tool is used — the central
  repair stays a reviewed, downloadable script per your earlier choice.
- New test: the comparison logic is fed the real central column list captured
  today and must report exactly the 5 known-missing columns and nothing else;
  a second case with a fully repaired column list must report zero drift.
- Version bumped with `node scripts/bump-version.cjs` on completion.
