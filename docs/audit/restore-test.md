# The wipe-and-restore test

`recovery.md` says which features *should* come back after a till is wiped.
This is how that claim is proven on a real terminal, and where the evidence is
kept.

## The rebuild check — safe, any time

Sync → **Rebuild check**. Nothing is written and nothing is deleted. For every
restorable table the till counts what it holds for this branch inside the
restore window and asks head office for the same count.

| Reading | What it means |
| --- | --- |
| In step | A rebuild would bring this table back complete. |
| Behind by N | Head office holds N rows the till does not — a rebuild would still come back short here. |
| Ahead by N | The till holds work head office has not received yet. Not a fault: the queue has not drained. |

The verdict and its time are kept on the till and shown in Logic Health.

## The drill — the real thing

Sync → **Wipe & restore drill**. Offered only when the push queue is empty, no
shift is open, the till is pinned to a branch and head office is reachable; the
button names whichever condition is missing.

What it does, in order:

1. Takes a copy of every restorable table inside the window.
2. Clears those tables — children first, so nothing is orphaned.
3. Runs the ordinary restore, unchanged.
4. Compares row counts and a per-table checksum against the copy.
5. Passes only if nothing is missing. On any shortfall the copy goes straight
   back, and the report names the table and the number of rows lost.

Settings, terminal activation and sealed credentials are never cleared: they
are not trading history, and clearing them would unpair the till.

## What is never covered

- Rows the till has not pushed yet. The guard requires an empty queue precisely
  so nothing unsent is at risk; restore itself also refuses to overwrite them.
- Anything older than the restore window (90 days by default).
- Central-only data — see `sync-coverage.md` for the list and the reason each
  table lives centrally.

## Where the evidence lives

Both results are stored on the terminal (`last_restore_check` and
`last_restore_drill`) and shown in two places: Sync, with the per-table detail,
and Logic Health, as a single line above the recovery table. Until a drill has
passed, Logic Health says so plainly rather than claiming the till rebuilds.
