# Final production hardening pass

Items 16 and 17 (GitHub security configuration, dependency scanning) are excluded from this pass.

## What the review already confirmed

- The desktop bridge exposes about 112 channels. Only the SQL-administration ones ask who is calling; everything else — backend address, cloud credentials, terminal record, settings, configuration file, local mirror, staff PIN store, restore and backup — is callable by anything running in the window.
- Network helpers are already locked to secure addresses on the configured update hosts, with local and private addresses refused. This is a false positive and will be recorded as one, with tests to keep it that way.
- The crash handlers write the fault to the diagnostics log and let the till carry on. That is right for a harmless fault and wrong for a database or till-identity fault.
- The local mirror now records its schema version. What is missing is proof that a half-finished upgrade of a till holding real sales, shifts and unsent rows loses nothing.
- `.env` is still tracked in the repository. It holds only the publishable address and key, but it should not be tracked.

## What will be done

**One privilege rule, reusing the administrator unlock already built.** Each channel is classified as open to the register, supervisor-level or administrator-level, and the desktop process enforces it — a screen hiding a button proves nothing. Administrator level covers the backend address, cloud credentials, the terminal record, the connection settings, restore, backup, clearing the audit log and the staff PIN store. Supervisor level covers housekeeping, branch change and mirror rollback. Everything the register needs to ring up a sale stays open.

**An unconfigured till stays usable.** While no connection and no activation exist, the first-run screen may still write the minimum needed to connect. Once a till is configured, the same change asks for the administrator unlock — including offline, because the unlock is checked against the till's own staff copy.

**Settings are classified by key.** Display, layout and receipt-look preferences stay open. Keys touching the backend, the company, the database, activation, PIN rules, grace periods and audit behaviour become administrator-level. A key nobody has classified is treated as restricted rather than open.

**Crash handling gets a severity split.** Faults naming the database, the till identity or the unsent-rows store put the till into a safe state: the operation in progress stops, nothing is reported as successful, the unsent queue is left intact and the operator is told to restart. Ordinary faults keep the current behaviour.

**`.env` stops being tracked**, `.env.example` stays, and the history is scanned for real secret material. Anything found is reported with its type and location and the rotation it needs; nothing is rotated automatically.

**Verification, not rewriting**, for: the migration of a till already holding sales, sale lines, payments, stock, shifts, transfers, unsent rows and the activation record, including an interrupted and a retried upgrade; the two-till last-unit stock outcome (documented as intentional, visible on the item, and logged rather than silently corrected); emergency access scope, expiry, attempt limits and audit trail; terminal activation, binding, expiry, revocation and device replacement; the Android first-run screen; sealed credential storage with a corrupted or missing copy; the payment/receipt/drawer relationship, so a printer failure never charges twice, never loses the sale and never reports a false failure; and the updater's authenticity, interrupted download and install, and preservation of data, identity and configuration across a restart.

## Tests

New: unauthorised calls to every privileged channel; the first-run exception and its withdrawal once configured; each settings class; the network helper against an approved address, a plain-http address, an unrelated site, a local address, a malformed address and a redirect elsewhere; a critical versus a harmless crash; an interrupted and a retried local upgrade with data present; the printer-failure paths.

Then the whole existing suite, the failure-injection suite, type checking and a production build. Results are reported as they actually run.

## Documentation

`docs/audit/production-hardening-audit.md`, `verification-matrix.md` and `go-live-checklist.md` get one entry per item: finding, severity, root cause, file and function, change, the test that proves it, remaining limitation, and whether real hardware is still required. Printer, drawer, Windows till and Android device stay marked unverified.

## Final report

Sections A–O as requested, stating plainly what was fixed, what was a false positive, what is unresolved, and that items 16 and 17 were intentionally excluded.

## Technical notes

- New `electron/ipc-privilege.cjs`: channel-to-level table plus a `requireLevel` wrapper built on the existing `electron/admin-session.cjs` grant; `electron/main.cjs` wraps handlers with it; no second role store.
- First-run exception derived from `terminal-store.read()` and `db-config-store.read()` being empty, evaluated per call in the main process.
- Settings classification lives beside the `settings:set` handler and is shared with the renderer only for labelling.
- Crash severity classified in `electron/main.cjs` alongside the existing `diagnostics.logCrash` call.
- Local upgrade tests extend `src/core/activation/__tests__/local-schema-upgrade.test.ts` against `electron/db/sqlite.cjs` (`PRAGMA user_version`, additive column checks).
- `node scripts/bump-version.cjs` once the code changes land.
