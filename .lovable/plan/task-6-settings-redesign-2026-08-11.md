# Task 6 — Settings redesign

Goal: make the settings area faster to navigate and clearer about what is saved, without changing any setting's behaviour.

## What changes for the user

1. **Searchable settings hub** — a search box at the top of Settings filters every page across all categories by name and description, so a setting is one keystroke away instead of a hunt through cards.
2. **Collapsible sections on dense pages** — the long pages (screen visibility, POS rules, catalog, system, region, printing) get accordion sections that remember which one you opened, so you only see the block you're working on.
3. **Clear save state everywhere** — a small, consistent indicator next to the save button: "Unsaved changes", a spinner while saving, "Saved 14:32", or the error text if the write failed. A sticky save bar appears at the bottom of a page while there are unsaved edits, so you never scroll back up to save.
4. **Consistent page headers** — every settings page shows the same back link, title, description and (where relevant) the branch it is editing.

## Technical notes

- `src/components/pos/settings/SettingsFrame.tsx` already tracks `dirty`, `saving`, `savedAt` and `saveError`. Extract that into a small `SaveIndicator` component (`src/components/pos/settings/SaveIndicator.tsx`) and render it both in the header and in a new sticky bottom bar that only mounts when `dirty` is true. No change to the save path (`db.saveSettingsNow`).
- Add an optional `sections` accordion helper (`src/components/pos/settings/SettingsSection.tsx`) wrapping `@/components/ui/accordion`, with the open item persisted in `localStorage` per route key. Apply it to: `settings.visibility.tsx` (one section per `VISIBILITY_GROUPS` entry), `settings.rules.tsx` (one per `RULE_GROUPS` entry), `settings.catalog.tsx`, `settings.system.tsx`, `settings.region.tsx`, `settings.elements.tsx`.
- `src/routes/settings.index.tsx`: add a controlled search input filtering the flattened `GROUPS` page list (label + blurb, case-insensitive); hide empty categories; keep existing `cloudOnly` / permission gating and links unchanged.
- Pages that manage their own save state (`settings.rules.tsx`, and any page not using `SettingsFrame`) reuse the same `SaveIndicator` for visual consistency.
- Bump version to **1.2.96** in `package.json` and `src/version.ts`.

Out of scope: no changes to what any setting does, to the inheritance model, or to the sync layer.
