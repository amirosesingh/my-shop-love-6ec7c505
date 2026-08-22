# Stage 5 — central server SQL (PostgreSQL)

Hand-run files. **Nothing here runs automatically**, and none of it was applied
to the live database.

The managed cloud database already contains everything in `20260822010000` to
`20260822010200` — those files are parity for a self-hosted central server that
was built from an older script. `20260822010300` is an optional performance file.

Run order (sequenced after the newest existing migration, `20260821035305_*`):

1. `20260822010000_app_users.sql` — offline sign-in columns, unique `user_id`
2. `20260822010100_audit_logs.sql` — offline sign-in audit columns, upsert key
3. `20260822010200_staff_roles.sql` — role table, grants, RLS
4. `20260822010300_compare_indexes.sql` — indexes for the comparison page

Every statement is additive and idempotent, so re-running is harmless. Each
file ends with a commented `-- DOWN` block; it is deliberately not executable.
