# Unlock most owner-only settings pages

## What I found in the scan

Rules and access in this app come from four places:

1. **Editable POS rules** — 38 switches/limits in the Rules screen (shift, cash, discount, refund, terminal, manager-PIN gates), stored in the database per scope. Already fully editable.
2. **Authorization rules** — the newer per-action PIN/approval panel on the same screen. Already editable.
3. **Permissions** — ~60 role flags in the Roles & access screen. Already editable.
4. **Hardcoded owner-only flags** — this is the part that is locked. In `src/lib/ui-visibility.ts`, 26 of the 38 settings pages carry a fixed `ownerOnly: true`. Those rows render as a grey "Owner only" badge in Roles & access and can never be granted to a cashier, supervisor or warehouse user, no matter what the admin wants.

Separately, a handful of whole screens (Stores, Promotions, Coupons, Audit, Security alerts, Database explorer) are hardcoded `isAdmin`-only in their route files, and a few constants (PIN attempts, lockout length, session length) live in code. Per your answers, both of those stay as they are.

## What changes

Split the current single `ownerOnly` flag into two levels:

**Locked core (stays owner-only, 4 pages)** — these can hand over the install itself or unlock every other gate, so they keep the badge:

- `/settings/access` and `/settings/visibility` — Roles & access (granting this lets a role grant itself anything else)
- `/settings/terminals` — Terminal activation codes
- `/settings/sync` — Branch identity, sync queue and backups

**Now grantable (22 pages)** — the admin gets a normal switch per role, exactly like the day-to-day pages already have:

Software updates, Mobile terminals, Active sessions, Business identity, Tax & pricing, POS rules & enforcement, Bill numbering, Region & time, Bank transfer details, Payment methods, Payment accounts, WhatsApp bills, System status, Security alerts, Database health, Logic health, Database explorer, Branch telemetry, Notifications, Settings inheritance, plus the two legacy redirect entries.

Pages in this second group are marked **sensitive**: the switch still works, but the row shows a short amber note ("Gives access to money settings" / "Gives access to system and device settings") so nobody grants them by mistake.

Default state is unchanged: every newly-grantable page starts hidden for every non-admin role, so nothing opens up until an admin deliberately switches it on.

## Server side

Route visibility is enforced in two places — the client guard and the settings API. Both read the same `ownerOnly` list, so relaxing the list relaxes both together. I will re-check `src/routes/api/settings.ts`, `settings.upsert.ts` and `settings.sync-batch.ts` so a role that has been granted, say, POS rules can actually save them, and one that has not still gets refused server-side. Granting a page never bypasses the underlying permission flag or the manager-PIN/authorization gates — those keep applying.

## Technical notes

- `src/lib/ui-visibility.ts` — replace the boolean 4th column with a `lock` value of `"core" | "sensitive" | "none"`; `isOwnerOnlyRoute` returns true only for `core`; keep `ownerOnly` as a derived getter so existing callers keep compiling.
- `src/routes/settings.access.tsx` — badge only for `core`; switch plus amber sensitivity note for `sensitive`.
- Verify the write paths in `settings.ts` / `settings.upsert.ts` / `settings.sync-batch.ts` and `SettingsFrame.tsx` agree with the relaxed list.
- No database migration and no offline schema change — the hidden map already stores arbitrary keys.
- Typecheck, test suite and route smoke checks, then `node scripts/bump-version.cjs`.

## Risk

The main risk is granting a sensitive page to a broad role and widening reach beyond intent. Mitigated by keeping the four core pages locked, defaulting everything to hidden, and labelling the sensitive rows. No existing grant, permission or rule value changes.
