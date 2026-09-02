# Deep health check: the helper isn't installed centrally

## What the error actually means

Nothing is missing in the app. The check calls a read-only helper function
`public.schema_inventory_deep()` in the **central cloud project**
(`qhrufhtbeguxydenzfey`, your own external Supabase project — not managed from
here). The 404 / `PGRST202` is that project replying "I have no such function".
The app therefore falls back to the reduced tables-and-columns comparison.

The helper's SQL already exists in this repo at
`supabase/sql/stage5/20260902010000_schema_inventory_deep.sql`. It has simply
never been run against that project. Because the central project is external,
it cannot be installed from here — it must be pasted into that project's SQL
editor once.

## What I'll change so this is self-serve

The reduced-mode notice on the Schema health screen currently just names the
function and tells you to find it "in the central SQL scripts". Instead it will:

- Show the plain-English cause: the central database is missing the read-only
  inventory helper, so only tables and columns could be compared.
- Give a **Copy install SQL** button and a **Download .sql** button that hand you
  the exact contents of the stage-5 script (bundled into the app, so it works
  offline on a till).
- List the three steps: open the central project's SQL editor, paste and run,
  press Re-check here.
- Distinguish the two failure shapes so the wording is never wrong:
  "not installed" (`PGRST202` / 404) versus "installed but this server may not
  call it" (permission / 401 / 403 — that one needs the execute grant, which the
  same script already includes).

No change to what the check compares or to any database access rules.

## Technical notes

- The helper SQL is moved into a shared TS constant (e.g.
  `src/lib/deep-inventory-sql.ts`) exported as a string, and the stage-5 `.sql`
  file is kept byte-identical as the source of truth for git/CLI use.
- `src/lib/central-inventory.functions.ts`: return a typed reason
  (`not_installed` | `not_permitted` | `unavailable`) alongside the raw message
  instead of a single free-text string.
- `src/components/database/SchemaHealthPanel.tsx`: render the new notice with the
  copy/download actions and the numbered steps; keep the existing "never report
  all clear from a degraded scan" behaviour.
- Version bumped with `node scripts/bump-version.cjs`.
