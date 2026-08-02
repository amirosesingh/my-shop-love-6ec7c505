# Fix "Cannot reach the server to verify this code"

## What is actually wrong

The message is misleading. The till can reach the server fine — the two database
helpers the activation step calls do not exist in your POS database yet.

Verified directly against your database: calling `terminal_token_status` returns
`404 PGRST202 — Could not find the function public.terminal_token_status`.

Those two helpers (`terminal_token_status` and `terminal_token_heartbeat`) were
added to `supabase/schema10.sql` later, in the security pass that stopped
unregistered tills from reading the whole token table. Your database was set up
before that, so it has the `terminal_tokens` table but not the helpers.

## Fix

1. **New script `supabase/schema11.sql`** — a short, safe-to-rerun script
   containing only the two `SECURITY DEFINER` functions plus their
   `REVOKE`/`GRANT` lines (identical to what is already in `schema10.sql`). You
   run it once in your database's SQL editor. No table or data changes.

2. **Honest error messages in `src/lib/terminal-tokens.ts`** — activation
   currently collapses every failure into "Cannot reach the server". It will
   instead distinguish:
   - missing function (`PGRST202`) → "This database is missing the terminal
     activation setup. Run supabase/schema11.sql, then try again."
   - genuine network failure → the existing connection message.
   - anything else → the server's own message, so the next issue is diagnosable.

3. **Docs** — a short "Terminal activation prerequisites" note in
   `docs/windows-desktop.md` pointing at the script.

After running the script, the activation code you already generated ("lucky",
Harbour Street) works as-is — no need to reissue it.

## Technical notes

- Functions only; `CREATE OR REPLACE` makes the script idempotent.
- Grants stay EXECUTE-only for `anon, authenticated, service_role`; the
  `terminal_tokens` table itself stays unreadable to anonymous callers.