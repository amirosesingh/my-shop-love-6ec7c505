# Settings: give the side list its own scrollbar

Right now the whole settings window scrolls as one long page, so the list of settings on the left moves with the page instead of staying put, and a long list gets cut off at the bottom with no way to reach the rest.

## What changes for you

- The settings list on the left gets its own scrollbar. It fills the window height, stays in place, and you can scroll it on its own to reach every entry, including the last one.
- The settings page on the right scrolls separately, with its own scrollbar. Scrolling one never moves the other.
- The little breadcrumb bar at the top of the page stays visible while the page content scrolls.
- Nothing else changes: same entries, same folding categories, same search, same narrow/wide toggle, same slide-over list on phones and tablets.

## Technical notes

- `SettingsShell.tsx`: the two-column wrapper becomes `flex h-full min-h-0 overflow-hidden` instead of `min-h-full`, so it fits the single app scroll region rather than growing past it.
- Left `nav`: swap `max-h-[calc(100dvh-3.5rem)] self-start overflow-hidden` for a definite `h-full min-h-0` column; the inner list in `SettingsNavTree` already has `min-h-0 flex-1 overflow-y-auto`, which then works as intended in both wide and narrow modes.
- Right column: `flex min-w-0 flex-1 flex-col min-h-0`, with the breadcrumb bar kept outside and `{children}` wrapped in a `min-h-0 flex-1 overflow-y-auto` region — that becomes the page scroller.
- Because both columns now scroll themselves, the page-level scroller in `AppShell` no longer produces a second bar on settings routes; no change to `AppShell` itself.
- Verify: typecheck, `bunx vitest run`, then load `/settings`, `/settings/system` and a long page such as `/settings/access` in both the wide and narrow rail states, plus the mobile drawer.
- Version bump via `node scripts/bump-version.cjs`.
