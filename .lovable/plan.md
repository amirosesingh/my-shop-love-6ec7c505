# Make the central health check complete and reliably upgradeable

## Confirmed issue

The older central check used `public.schema_inventory()`, which is present in
the normal migration history and still exists. Version 1.3.78 added the fuller
`public.schema_inventory_deep()` check, but its installer was saved only under
`supabase/sql/stage5/`; it was never added to `supabase/migrations/`. The app was
therefore upgraded to call a function that the central database upgrade path
never installed. The 404 / `PGRST202` confirms exactly that mismatch.

The old helper still provides a useful partial inventory, while the deep helper
is dynamic: once installed, it automatically sees newly added tables, columns,
keys, indexes, triggers, row-security state and policies. It does not need a new
function release for each new operational table.

## What will change

### 1. Repair the missed database rollout

- Add the existing deep-helper SQL to the normal versioned migration chain so a
  fresh or upgraded central database receives it.
- Keep the stage-5 copy for manually managed external central projects.
- Keep the helper read-only, `SECURITY DEFINER`, fixed-search-path, unavailable
  to the public role, and executable only by the service role.
- Notify the database API to reload its schema after installation.

Because this POS is currently connected to an external central project, the
repository migration cannot install itself there. The screen will provide the
exact idempotent SQL for one-time execution in that project's SQL editor.

### 2. Keep health checks useful during mixed-version upgrades

- Attempt `schema_inventory_deep()` first.
- On `PGRST202` / 404 only, call the existing `schema_inventory()` and consume
  the metadata it can prove instead of dropping immediately to tables and
  columns.
- Clearly label that compatibility result as partial: the old helper reports
  table/column shape, RLS, policy counts, index counts and foreign keys, but not
  enough definitions to validate every individual object.
- Do not report “all clear” unless the full deep inventory completed.

### 3. Make installation and upgrades self-serve

The Schema health screen will:

- Show the plain-English cause: the central database is missing the read-only
  inventory helper, so only tables and columns could be compared.
- Give a **Copy/update helper SQL** button and a **Download .sql** button with
  the exact idempotent installer, bundled into the app so it is available on a
  till.
- List the three steps: open the central project's SQL editor, paste and run,
  press Re-check here.
- Distinguish the two failure shapes so the wording is never wrong:
  "not installed" (`PGRST202` / 404) versus "installed but this server may not
  call it" (permission / 401 / 403 — that one needs the execute grant, which the
  same script already includes).

### 4. Verify the complete path

- Add tests for deep success, old-helper compatibility fallback, genuinely
  missing helper, and permission failure.
- Verify that installing the script makes a second check leave reduced mode and
  evaluate every supported category.
- Verify a newly introduced central table is discovered dynamically.

## Technical notes

- Add a normal migration containing the same idempotent helper definition as
  `supabase/sql/stage5/20260902010000_schema_inventory_deep.sql`.
- Expose the installer through a shared client-safe string/module for copy and
  download actions; keep both SQL sources synchronized with a test.
- `src/lib/central-inventory.functions.ts`: return a typed reason
  (`not_installed` | `not_permitted` | `unavailable`) alongside the raw message
  instead of a single free-text string, and use the old helper for compatibility.
- `src/components/database/SchemaHealthPanel.tsx`: render the new notice with the
  copy/download actions and the numbered steps; keep the existing "never report
  all clear from a degraded scan" behaviour.
- Version bumped with `node scripts/bump-version.cjs`.
