# Final security + configuration fix pass

Verified each reported issue against the code first. Findings below say what is real and what is not; the plan fixes only the real ones.

## What the check found

**1. Android first-run configuration — partly false positive.**
An unconfigured till is not locked out: `AppShell` shows the connection screen before any sign-in, and the connection panel treats a device with no saved connection as "first run" and lets the three values be typed without a supervisor. Two real problems remain:
- The recovery keypad prints the code format on screen ("enter this device's current date and time as 12 digits — YYYYMMDDHHMM"), which hands the code to anyone holding the device.
- The recovery code opens the whole Recovery Hub — terminal activation, local SQL settings, printer settings, offline grace-period length — not just the connection fields. On an already-configured till that is a bypass of the supervisor rule.

**2. Electron plaintext activation — confirmed, still reachable.**
Saving is already sealed-or-refuse, but reading still falls back to the unencrypted `terminal-config.json` when the sealed copy cannot be decrypted, and trusts it. A tampered plain file is accepted as a valid activation.

**3. SQL-admin desktop channels — confirmed, no caller check.**
`sqladmin:connect / databases / tables / columns / query / repair` and the local-database channels have argument and SQL restrictions but no authorization at all: any code running in the window can call them.

**4. Desktop window security — confirmed gaps.**
The window is correctly isolated (context isolation on, node integration off), but there is no navigation guard, no window-open handler and no content-security policy, so a stray link can move the privileged window to a remote page that then holds the POS bridge.

**5. Offline last-unit stock — real, currently undocumented.**
Two offline tills can each sell the last unit and stock goes negative. Behaviour is deterministic (movements are relative deltas applied centrally) but it is nowhere written down, nowhere surfaced and nowhere flagged for the operator.

**6. Local database upgrades — largely sound, one gap.**
Upgrades are additive column checks inside the existing mirror, never a drop-and-recreate, so sales, stock, shifts, queued rows and the activation survive. There is no stored schema version and no test proving an interrupted upgrade leaves the data intact.

## What will be done

- **Recovery scope:** remove the code-format hint from the keypad. On an unconfigured device the code opens only the connection fields; on a configured device it opens the same reduced screen, and everything else in the hub stays behind the existing supervisor rule. Sales, staff, approvals, audit, SQL administration and settings stay closed in both cases.
- **Activation store:** stop trusting the plain file. A legacy plain copy is migrated once into the vault and deleted; if it cannot be sealed it is refused and the till goes to normal reactivation. An unreadable sealed copy fails closed.
- **Desktop administration channels:** every privileged channel checks the caller against the existing permission system before doing any work, and refuses with a plain message otherwise. No new admin system — it reuses the current roles.
- **Desktop window:** add navigation and window-open guards plus a content-security policy that keep the privileged window on the app's own content and send approved external links to the normal browser. Printing, updates and day-to-day use are unaffected.
- **Stock policy:** record the negative-stock outcome as intentional, show it on the item where it happens, and make sure the reconciliation is logged rather than silently corrected.
- **Local upgrades:** record a schema version and add a test that an interrupted upgrade keeps the existing rows.

## Tests

New regression tests: refused plain activation and one-time migration; unauthorized calls to each administration channel; blocked navigation and window creation; recovery scope (opens the connection fields only, never anything else); two-till last-unit outcome; interrupted local upgrade. Then the full existing suite, the Stage 3 failure-injection tests and type checking.

No test claims anything about real hardware.

## Documentation and report

`docs/audit/production-hardening-audit.md`, `verification-matrix.md` and `go-live-checklist.md` get an entry per issue: finding, severity, root cause, file and function, fix, the test that proves it, remaining limitation, and whether a real printer, drawer, Windows till or Android device is still required.

Final report covers A–O as requested, ending with an evidence-based verdict and the exact remaining blockers.

## Technical notes

- Files: `src/platforms/web/components/pos/EmergencyPinGate.tsx`, `RecoveryHub.tsx`, `src/routes/recovery.tsx`, `electron/terminal-store.cjs`, `electron/main.cjs` (sqladmin + pos channels, `will-navigate`, `setWindowOpenHandler`, CSP header), `electron/ipc-guard.cjs`, `electron/db/sqlite.cjs` (`user_version`), stock delta path in `src/core/api/pos-db.ts` / `stock_apply_deltas`.
- Authorization for desktop channels reuses the existing session/permission record already held by the shell; no parallel role store.
- Version bump through `node scripts/bump-version.cjs` once code changes land.
