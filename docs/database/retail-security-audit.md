# Retail database security audit

## Cloud classification

- **Branch-scoped read:** shifts, cash counts, close events, operational activity and POS rule snapshots. Existing `store_visible` policies/helpers remain authoritative.
- **Supervisor/function-only write:** rule saves, variance approval and recount. Public/anonymous execution is revoked; the functions authenticate role and branch.
- **Function-only write:** original shift count and reconciliation. Reconciliation is internal and executable only by `service_role`; the public count RPC validates permission, branch, state and non-negative bounds.
- **Internal/server-only:** expected totals and sensitive reconciliation details remain behind existing manager policies and server paths.

All canonical affected `SECURITY DEFINER` routines set a fixed `public, pg_temp` search path. The hosted native save endpoint verifies the supplied staff access token, derives branch from the caller/terminal proof, requires a resolved supervisor scope, and retains optimistic `expectedVersion` checks. No privileged RPC is granted to `anon`.

## Offline controls

SQLite and SQL Server do not claim RLS. Access is enforced by the Electron IPC allow-list and application permission checks; cloud/database credentials are sealed in the OS vault; local paths inherit OS user ACLs; SQL Server should use its dedicated least-privilege login. Business schemas contain no service-role key, cloud secret, password, or plaintext PIN. Authentication tables are not treated as cloud auth mirrors; any legitimate offline verifier retains only the existing protected hash material.

## Production application

For an **existing Supabase database**, apply only `supabase/migrations/20260908120000_retail_production_stabilization.sql` through normal migration tooling. Never apply the full reference file to production. For a **new database**, use `supabase/retail_cloud_full.sql` as the canonical fresh-install reference.

## Compatibility aliases

`app.lovable.pos`, `com.luckycharms.pos`, `POS_LOCAL`, `local_pos_database.db`, and legacy terminal-crypto salt/passphrase strings are intentionally retained for one-generation upgrade/data compatibility. They are identifiers, not displayed branding. New UI, package display names and artifacts use Retail; existing clients keep polling the unchanged update feed and its manifest directs them to the renamed transition artifacts.
