# Central (PostgreSQL / Supabase) SQL

## Run this one file: `../schema.sql`

`supabase/schema.sql` is the single, complete script for the central database.

- Fresh, empty project: it creates every table, column, index, view, routine,
  grant and access rule.
- Live database with data: it only adds what is missing. Nothing is dropped,
  truncated or recreated, and no existing row is changed.
- Safe to run again as often as you like.

How to run it: open the SQL editor of the central project, paste the whole file,
run it. The last thing it prints is a check — either
`Schema check: everything present.` or a warning naming what is still missing.

## Folder contents

| Path | What it is |
| --- | --- |
| `../schema.sql` | The full, re-runnable central schema. Use this. |
| `../migrations/` | Historical change files, applied in order by the platform. Do not run by hand. |
| `stage5/` | Older stand-alone catch-up scripts, kept for reference only. Everything in them is already inside `../schema.sql`, so they are optional. |

## Notes

- The local Windows/SQL Server mirror is a different set of files:
  `database/schema.sql` and `db/offline/`.
- If a screen says a table or column is missing, run `../schema.sql` again and
  read the final check message.
