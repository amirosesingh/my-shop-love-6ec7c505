# Retail operational schema matrix

| Entity | Supabase | SQL Server | Authoritative location | Sync direction |
|---|---:|---:|---:|---|---|
| Products, barcodes, categories, units | Yes | Yes | Yes | Supabase | Cloud → terminals; authorised edits → cloud |
| Members/customers and tiers | Yes | Yes | Yes | Supabase | Bidirectional, idempotent |
| Suppliers, purchasing and stock movements | Yes | Yes | Yes | Supabase | Bidirectional through sync relay |
| Sales, sale items and payment transactions | Yes | Yes | SQL Server transaction at acceptance; Supabase after acknowledgement | SQL Server → Supabase |
| Shifts and sessions | Yes | Yes | Supabase state machine with SQL Server operational records | Bidirectional change tracking |
| Shift cash counts, reconciliation, close events, variance alerts | Yes | Yes | Yes | Supabase calculations/audit | Count intent upward; audit projection downward |
| Held orders and bookings | Yes | Yes | Yes | Supabase after sync | Bidirectional |
| POS rules/settings | Yes | Yes | Yes | Supabase | Cloud → terminals; supervisor patch → cloud |
| Activity/audit/drawer events | Yes | Yes | Yes | Supabase | Terminal → cloud; reporting projection downward |
| Offline queue/outbox and sync metadata | No | Yes | Yes | Each terminal | Local only |
| Authentication, RLS policies and secrets | Yes | No | No | Supabase/OS vault | Never mirrored |

## Intentional column differences

PostgreSQL uses UUID, JSONB and timestamptz; SQL Server uses `UNIQUEIDENTIFIER`, `NVARCHAR(MAX)` and `DATETIME2(3)`. SQL Server management tables carry change tracking, migration, job, checkpoint, and idempotency metadata. Cloud-only actor auth IDs and policy metadata are not copied unless required for immutable audit attribution. SQL Server is the Electron durable acceptance boundary.
