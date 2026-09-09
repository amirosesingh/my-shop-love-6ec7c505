# Retail operational schema matrix

| Entity | Supabase | SQLite | SQL Server | Authoritative location | Sync direction |
|---|---:|---:|---:|---|---|
| Products, barcodes, categories, units | Yes | Yes | Yes | Supabase | Cloud → terminals; authorised edits → cloud |
| Members/customers and tiers | Yes | Yes | Yes | Supabase | Bidirectional, idempotent |
| Suppliers, purchasing and stock movements | Yes | Yes | Yes | Supabase | Bidirectional through sync relay |
| Sales, sale items and payment transactions | Yes | Yes | Yes | SQLite at acceptance; Supabase after acknowledgement | SQLite → Supabase → SQL Server projection |
| Shifts and sessions | Yes | Yes | Yes | Supabase state machine; SQLite durable intent | Bidirectional state; queued RPC upward |
| Shift cash counts, reconciliation, close events, variance alerts | Yes | Yes | Yes | Supabase calculations/audit | Count intent upward; audit projection downward |
| Held orders and bookings | Yes | Yes | Yes | Supabase after sync | Bidirectional |
| POS rules/settings | Yes | Yes | Yes | Supabase | Cloud → terminals; supervisor patch → cloud |
| Activity/audit/drawer events | Yes | Yes | Yes | Supabase | Terminal → cloud; reporting projection downward |
| Offline queue/outbox and sync metadata | No | Yes | Yes | Each terminal | Local only |
| Authentication, RLS policies and secrets | Yes | No | No | Supabase/OS vault | Never mirrored |

## Intentional column differences

PostgreSQL uses UUID, JSONB and timestamptz; SQLite preserves UUIDs/timestamps as text and JSON as text; SQL Server uses `UNIQUEIDENTIFIER`, `NVARCHAR(MAX)` and `DATETIME2(3)`. Local tables additionally carry `is_synced`, `sync_status`, retry/error and client transaction fields. Cloud-only actor auth IDs and policy metadata are not copied unless required for immutable audit attribution. SQLite's generic `mirror` retains lossless rows while typed tables provide recovery/query views. SQL Server remains an optional projection; it is not the Electron durable acceptance boundary.
