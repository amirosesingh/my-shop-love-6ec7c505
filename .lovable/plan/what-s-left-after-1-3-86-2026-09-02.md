# What's left after 1.3.86

The critical tenant-neutral work (C1) and the PIN hardening pass (C2, H1, M1) shipped. Checking the audit list against the current code, these are still open — verified just now: the checkout "nothing was saved" message is still unconditional, Sync & Backup still reads `isOnline()`, `<html>` still has no `suppressHydrationWarning`, and `LoginScreen` / `ManagerOverrideDialog` / `SecurityAlertBell` still have no importers.

## Round 1 — Honesty pass (checkout and connectivity)

- **C3** Only say "Payment was not saved" when the sale header truly did not commit; check `saleAttemptExists` first, and when it did commit, tell the cashier the sale is stored and clear the cart instead of inviting a second collection.
- **H5** Point the Sync & Backup connection readout at the real heartbeat (`isCloudConnected()`), so it can no longer read "Live" while every write fails.
- **H6** Serialise bill-number compute-and-write behind a per-device mutex so a fully offline till cannot mint duplicates.
- **M5** Only claim "saved on this terminal — it will sync" when the failure is actually a connection error, not a validation or permission refusal.

## Round 2 — Console noise and dead code

- **H4** Fix the hydration mismatch: `suppressHydrationWarning` on `<html>` and seed the client theme default from the same value the boot script wrote.
- **H7 / H8** Delete the three orphaned components (`LoginScreen` and its unused sign-up plumbing, `ManagerOverrideDialog`, `SecurityAlertBell`) after confirming no importers.
- **L1** Remove the exported `nextBillNumber` foot-gun; checkout already uses `reserveBillNumber`.

## Round 3 — Remaining Medium items

- **H2** Gate the full schema/column inventory behind a staff or manager role instead of bare terminal identity.
- **H3** One canonical service-key environment name; fail loudly if duplicates are present.
- **M6** One shared `computeTax()` used by cart totals, booking intake totals and the receipt preview.
- **M9** Park refused stock-delta batches in the outbox so they retry and stay visible.
- **M8** Test that the deprecated public sync alias and the canonical route resolve to the same handler, then retire the alias.

## Still parked (needs your explicit go-ahead)

- **Part 2 of the earlier plan** — splitting `src/apps/{mobile,desktop,web}` with a shared core. Large refactor, staged, not started.
- **M7** Function-level `EXECUTE` revokes and the two policy-less tables must be reviewed against *your own* project, not the Lovable-managed one.
- **M2 / M3 / M4, L2–L8** — smaller polish; can be folded into a later round.

## Technical notes

- Files: `src/lib/use-checkout.ts`, `src/lib/pos-db.ts`, `src/components/pos/SyncSettings.tsx`, `src/lib/bill-number.ts`, `src/lib/theme.tsx`, `src/routes/__root.tsx`, `src/routes/api/public/health-metadata.ts`, `src/lib/pos-relay.server.ts`.
- No schema change or migration in rounds 1–3.
- Each round: typecheck, full vitest run, and `node scripts/bump-version.cjs`.
