# Schema comparison — App / Local (SQL Server) / Cloud

Generated in Phase 1 (discovery only). Sources:
- Local: `database/schema.sql` (63 tables)
- Cloud: live `information_schema` of the central database (64 tables)

## Table-level differences

| Only in local (`database/schema.sql`) | Only in cloud |
| --- | --- |
| `shift_notifications` | `pos_store_settings` |
| `sync_state` | `settings_scoped` |
| `system_settings` | `shift_reconciliations` |
| `transfers` (legacy, superseded by `stock_transfers`) | `shift_variance_alerts` |

Notes:
- `sync_state`, `system_settings`, `shift_notifications` are terminal-local by
  design — they must NOT be created centrally.
- `transfers` is legacy but still listed in the desktop push table list
  (`electron/db/repo.cjs` → `TABLES`), so it can still receive writes.
- `shift_reconciliations` and `shift_variance_alerts` are produced by the
  cloud shift-closing routines and have **no local mirror**: a terminal that
  is offline at close time cannot record or re-read variance state locally.
- `pos_store_settings` / `settings_scoped` are cloud-only settings storage;
  the local side keeps `pos_settings` + `system_settings` instead.

## Column-level differences (24 transactional/core tables)

Column parity is good. Every difference falls into one of three groups:

**Group A — local-only sync bookkeeping (expected, do not add to cloud):**
`is_synced`, `sync_status`, `sync_attempts`, `last_error_at`,
`client_transaction_id`, `row_version`, `updated_at` (where the cloud table
has no such column). Present on virtually all local transactional tables.

**Group B — local-only business columns that the cloud does not have:**

| Table | Local-only column | Impact |
| --- | --- | --- |
| `activity_events` | `branch_id`, `store_name`, `metadata` | Local rows carry branch/store labelling the cloud cannot store; values are dropped on push. |
| `sales`, `sale_items` | `branch_id` | Branch attribution of a sale is lost centrally (cloud uses `store_id` only). |
| `bookings`, `shifts`, `booking_payments` | `cashier_name` | Cashier display name is local-only; central reports must join to resolve names. |
| `bookings` | `booking_ref` | Human booking reference not stored centrally. |
| `stores` | `receipt_prefix` | Receipt numbering prefix is per-terminal only; a reinstall loses it. |

**Group C — cloud-only columns with no local mirror:**

| Table | Cloud-only column |
| --- | --- |
| `booking_payments` | `reversed_at`, `reversed_by` |
| `shift_cash_counts` | `counted_by_user_id` |
| `shift_close_events` | `actor_user_id` |

These are written by cloud RPCs (`booking_refund`, `shift_close_start`,
`shift_cash_count_submit`); an offline terminal cannot reproduce them.

## Conclusion

The schema drift is small and well-bounded. The real gap uncovered in Phase 1
is not column drift but **sync coverage** — see `sync-coverage.md`.
