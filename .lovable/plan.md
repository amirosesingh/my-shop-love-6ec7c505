# Stage 7 — Settings, one registry and no orphan pages

Settings are already grouped: a card workspace with seven categories, a
half-window sheet, search, and sub-tab strips on grouped pages. What is left is
the thing Stage 7 was written for — the pages are described **twice**, and the
two descriptions have already drifted.

## What the audit found

- Two registries exist. `settings-catalog.tsx` drives the workspace grid,
  search and the sheet (34 areas). `settings-groups.ts` separately drives the
  sub-tab strip at the top of grouped pages (4 groups).
- They have drifted: **Document numbering** (`/settings/stock-numbering`) is a
  tab in the POS rules strip but has no card, so it cannot be found in the
  settings workspace or the search box at all.
- Nothing else is orphaned. Every other settings page either has a card or is a
  deliberate redirect to its new home (`data-sync`, `diagnostics`,
  `inheritance`, `logic-health`, `security-alerts`, `visibility`).
- Booking settings sit under "Payments & messaging": booking rules, services
  and fees are filed next to bank details, which is why they are hard to find.
- Nothing stops the next new page from being added to one registry only.

## What this stage does

**1. One registry.** The card catalogue becomes the only place a settings area
is described. The sub-tab groups keep their names and ordering but are built
from the catalogue by route, so a card and its tab can never disagree again.

**2. Fix the drift.** Document numbering gains a card so it is searchable and
opens in the workspace like everything else.

**3. Re-home bookings.** A "Bookings & services" category holds booking rules,
services and fees, and the booking slip wording; payments keeps tenders, bank
details and payment accounts. Every existing URL keeps working.

**4. A check that keeps it honest.** Logic health already lists settings pages
claimed by two parents. It gains the reverse check: any `/settings/*` page with
no card, and any card pointing at a page that does not exist. Both are listed
by name so a future page cannot quietly go missing again.

## Not in this stage

No settings page is deleted or merged, and no stored value moves. The four
overlapping settings mechanisms noted in the audit
(`settings_scoped`, `settings_overrides`, `settings_locks`,
`pos_store_settings`) stay as they are — behaviour depends on all four, and the
audit's own recommendation is to leave them alone.

## Technical notes

- `src/lib/settings-groups.ts`: `SETTINGS_GROUPS` becomes a list of group
  headings plus route ids; labels and blurbs are resolved from
  `SETTINGS_CARDS`. `groupForRoute`, `systemTab` and `settingsDuplicates` keep
  their current signatures so `SettingsTabs.tsx`, `settings.system.tsx` and the
  logic health panel need no changes.
- `src/lib/settings-catalog.tsx`: add the `stock-numbering` card; add the
  `bookings` category and move `services`, `booking-rules`, `booking-slip` onto
  it.
- New `settingsCoverage()` in `settings-groups.ts`, comparing catalogue routes
  against a generated list of settings route ids; rendered in
  `LogicHealthPanel.tsx` beside the existing duplicate list.
- The redirect-only route files stay: they are how old links and printed
  documentation keep resolving.
- Version bump via `scripts/bump-version.cjs`; `docs/audit/state-audit.md` row
  for "Settings organisation" moves to COMPLETE.
