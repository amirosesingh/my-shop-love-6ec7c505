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

## Starting fresh — `99_reset_data.sql`

`99_reset_data.sql` empties every trading record (sales, shifts, bookings,
stock, catalogue, members, coupons and all history) so the shop can begin from
zero. Login accounts, staff profiles and PINs, settings, branches and
registered terminals are left exactly as they are.

It is destructive and there is no undo — take a backup first. Paste the file
into the central project's SQL editor and run it; the last statement prints the
remaining row counts, which should all be `0`.

Clear the central database first, then run the matching file on each till
(`db/offline/99_reset_local_data.sql` for a branch SQL Server database,
`electron/db/99_reset_local_sqlite.sql` for the desktop's own file). Doing it in
the other order simply pulls the old rows back down.
