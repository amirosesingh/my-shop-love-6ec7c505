# Fix "could not choose the best candidate function" on terminal activation

## What is actually wrong

Your POS database now has **two** versions of the activation routine sitting side by side:

```text
terminal_token_claim(p_token_id, p_device)
terminal_token_claim(p_token_id, p_device, p_proof_hash, p_platform, p_os)
```

The five-argument version (from `supabase/schema31.sql`) was added with defaults on the extra arguments, so a call also matches the older two-argument version that was never removed. The database refuses to guess which one you meant and returns the "could not choose the best candidate function" error. Nothing is wrong with the token itself — Windows and Android fail at the same step for the same reason.

The extra arguments the terminal sends (`p_proof_hash`, `p_platform`, `p_os`) are troubleshooting metadata only; removing the ambiguity does not change how activation works.

## The fix

1. **New SQL file `supabase/schema33.sql`** (idempotent, drops nothing else):
   - Drop only the stale two-argument overload: `DROP FUNCTION IF EXISTS public.terminal_token_claim(uuid, text);`
   - Re-create the single five-argument version exactly as in `schema31.sql` (branch check, atomic one-time claim, metadata columns), so the drop can never leave the database without a claim routine.
   - Re-apply `GRANT EXECUTE ... TO anon, authenticated, service_role` on the surviving signature, since activation happens before any sign-in.

2. **Stop the old definition coming back.** The two-argument body still lives in `supabase/sql/01_stores_and_terminals.sql` (two places). Replace those with the five-argument definition and matching grants, so a fresh database or a re-run of `99_run_all.sql` never re-introduces the duplicate.

3. **Clearer message if it ever recurs.** In `src/lib/terminal-tokens.ts`, `activationFailureMessage` gains a case for the ambiguous-function error (`PGRST203` / "could not choose the best candidate"), mapping it to: "This POS database has two versions of the terminal activation routine. Run supabase/schema33.sql on the POS database, then try again."

## What you do after

Run `supabase/schema33.sql` once against your POS database, then re-enter the activation token on the Windows terminal and the Android terminal. No new token is needed unless the old one passed its 15-minute window.

## Technical notes

- Files: new `supabase/schema33.sql`; edits to `supabase/sql/01_stores_and_terminals.sql` and `src/lib/terminal-tokens.ts`.
- No table, column, policy or row is dropped; only the redundant function overload is removed.
- Version bumped to the next patch release so rebuilt terminals carry the improved message.