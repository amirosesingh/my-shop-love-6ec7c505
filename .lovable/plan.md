# Fix: "column updated_at is specified more than once" during cloud pull

## What the error actually is

The message comes from the local SQL Server, not from the cloud. In
`electron/db/repo.cjs`, the MERGE used to apply rows builds its `UPDATE SET`
list from the row's own columns and then unconditionally appends
`t.[updated_at] = SYSUTCDATETIME()`. When the incoming row already carries an
`updated_at` value — which every cloud row does — the same column ends up in the
clause twice and SQL Server rejects the whole statement.

The same duplication exists in the plain `UPDATE` path (`updateRows`), which
appends `[updated_at] = SYSUTCDATETIME()` after the caller-supplied `SET`
fields.

## Is your data synced?

Pull is the direction that failed, so:

- Pushing finished bills, sale items and other local writes up to the cloud is a
  separate routine and was not affected — those rows still flag as synced.
- The pull (cloud catalogue and any table the server owns coming down to the
  till) aborted on the failing statement, so those rows did not land locally.
  Nothing was half-written: each pull batch runs inside a transaction, so the
  batch rolled back rather than applying partially.

The sync log entries you saw with transaction id, timestamp and direction are
the record of those failed pull attempts. Once the fix ships, the next pull
re-reads from the same watermark and brings the missing rows down.

## The fix

1. Build the `SET` list once, de-duplicated by column name, so a column can
   never appear twice regardless of what the incoming row contains.
2. Decide `updated_at` by direction:
   - local write (`markPending = true`) → keep `SYSUTCDATETIME()` and drop any
     caller-supplied `updated_at`;
   - cloud pull (`markPending = false`) → keep the cloud row's `updated_at`, so
     the watermark and last-write-wins comparison stay honest instead of being
     rewritten to local clock time.
3. Apply the same de-duplication to `updateRows` and to the `sync_metadata` /
   `sync_state` / `system_settings` MERGEs, which share the pattern.
4. Add a regression test that runs the SET-list builder for a row containing
   `updated_at` (both directions) and asserts each column appears exactly once.

## Notes

- No schema change and no migration; this is a statement-construction bug.
- After the update, a manual "Pull catalogue now" from Settings › Sync & backup
  will clear the backlog; no data needs to be re-entered.
- Version bump with the release.
