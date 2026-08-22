# Stage 5 — shop database upgrades (Microsoft SQL Server)

Hand-run files for a till that was installed from an older build. The
full-install script `../pos-offline-sqlserver.sql` already creates everything
here on a fresh machine; these files bring an existing machine in line.

**Nothing runs automatically.** Open each file in SSMS (or `sqlcmd`) against the
shop database and run it in this order:

1. `20260822_0101_app_users.sql` — offline sign-in columns, unique `user_id` (required)
2. `20260822_0102_cashiers.sql` — roster mirror columns, unique `username` (required)
3. `20260822_0103_staff_roles.sql` — role/permission mirror (required)
4. `20260822_0104_audit_logs.sql` — offline sign-in audit rows, upsert key (required)
5. `20260822_0105_compare_indexes.sql` — indexes for the comparison page (optional)

Every statement is guarded (`IF COL_LENGTH(...) IS NULL`, `IF OBJECT_ID(...) IS NULL`),
so running a file twice does nothing the second time. All added columns are
nullable or defaulted — existing rows keep working.

Each file ends with a commented `-- DOWN` block for rollback; it is not executed.
