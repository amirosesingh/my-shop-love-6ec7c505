# Fix "the saved rules could not be read"

## What is actually happening (confirmed)

The warning is not about your rules being wrong — the till simply cannot fetch them.
The recorded reply from the running app says:

> backend: "defaults", backendError: "Invalid API key … This API key might also be
> owned by another Supabase project."

So the rule set is being requested with a stored master key that the database
rejects, and the page falls back to the built-in strict defaults.

Verified alongside this:

- The rule routines all exist and are healthy (`pos_rules_get`, `pos_rules_row`,
  `pos_rules_defaults`, `pos_rules_save`).
- They may be run by a signed-in staff account and by the master key only —
  not by an unsigned till.
- Because of that, whenever the screen is opened before a staff sign-in, or by a
  cashier PIN session (which is not a database account), the code takes the
  master-key route — the exact route that is failing.

## The fix

1. **Stop depending on the master key just to read rules.**
   Allow the plain read of the effective rule set (`pos_rules_get` and its two
   helpers) for unsigned callers, and have the server read them with the ordinary
   public key. Rules are operational thresholds, not customer or payment data;
   nothing else becomes readable, and writing stays locked down.
2. **Prefer the signed-in account.** When a supervisor is signed in, both reading
   and saving already work through their own session. Saving currently tries the
   master key first and only falls back to the session — flip that order so a save
   succeeds even with the master key unusable.
3. **Report honestly.** Keep the banner, but only when the read genuinely failed;
   after this change a signed-out till shows real saved rules instead of defaults.
4. Add a test covering: rules read without any sign-in returns the saved branch
   values; a failed read still returns strict defaults plus the reason; a save by a
   supervisor works when the master key is rejected.
5. Bump the version.

## Separate issue worth naming

The same rejected master key is used by the write relay (sales, shifts, held bills
and other till writes made from an unsigned or cashier session). If that key is
stale or belongs to a different project, those paths are failing too. After the
above I will probe one relay write and report; if the key needs replacing, I will
tell you exactly which value to update and where.

## Technical detail

- Migration: `GRANT EXECUTE ON FUNCTION public.pos_rules_get(text),
  public.pos_rules_row(text), public.pos_rules_defaults() TO anon;`
  (they are `SECURITY DEFINER STABLE`, read-only, and expose no table).
- `src/lib/pos-rules.server.ts`: `rpc()` gains a public-key route used when no
  access token is present, with the service route kept as a fallback;
  `saveRules()` tries `pos_rules_save` with the supervisor's session first and the
  service write second.
- No change to `pos-rules.tsx`, the rules page layout, or any enforcement logic.
