# Central (PostgreSQL / Supabase) SQL

## Run this one file: `../schema.sql`

`supabase/schema.sql` is the single, complete script for the central database.

- Fresh, empty project: it creates every table, column, index, view, routine,
  grant and access rule.
- Live database with data: it adds missing objects and safely repairs known
  compatible legacy column types. No table or column is dropped and no data is
  silently discarded; incompatible values stop with a precise error.
- Safe to run again as often as you like.

How to run it: open the SQL editor of the central project, paste the whole file,
run it. The last thing it prints is a check — either
`Schema check: everything present.` or a warning naming what is still missing.

## Folder contents

| Path | What it is |
| --- | --- |
| `../schema.sql` | The full, re-runnable central schema. Use this. |
| `../migrations/` | Historical change files, applied in order by the platform. Do not run by hand. |

## Notes

- The local Windows/SQL Server mirror is a different set of files:
  `database/schema.sql` and `db/offline/`.
- Historical files in `../migrations/` are retained for the migration system;
  never delete or run them manually.
- If a screen says a table or column is missing, run `../schema.sql` again and
  read the final check message.
