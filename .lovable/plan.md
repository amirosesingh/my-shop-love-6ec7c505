# Phase 5 — Settings that read the way people think

Phase 4 is shipped. This phase changes how the 40 existing settings pages are
grouped and navigated, and finishes the "pick from a list, don't type it"
work. No settings page is deleted or rebuilt — only its heading, its wording
and, in a few places, the kind of field it offers.

## What the pages look like today

Read just now: the 40 settings pages sit in ten categories — Terminal,
Receipts & printing, Business, Products & inventory, Payments, Messaging,
Bookings & services, Data & connectivity, System health, Staff & security —
folded under four headings. Two of them are lopsided: "Staff & security" holds
a single page, while "Business" holds seven that mix company identity, tax,
numbering and the new Groups page.

The settings sidebar lists every category expanded, all the time, with no way
to fold one away, and it disappears entirely on a phone — a phone user gets
the pages but no navigation between them.

## 1. Ten honest categories

Regroup the existing entries into: Business & locations, People & permissions,
Products & inventory, Terminals & devices, Printing & receipts, Sales &
bookings, Payments & tax, Sync & data, Security, System health. Each page keeps
its address, its content and its behaviour; only which heading it appears under
and, where it reads badly, its short description change. Tax moves out of
Business into Payments & tax; Groups joins branches under Business & locations;
Roles & access is joined by sessions and the security pages so "who may do
what" is one place.

## 2. A sidebar you can actually navigate

- Categories fold open and closed, and the one containing the page you are on
  opens by itself. Which ones you left open is remembered on this device.
- Each category shows its icon and a count; the current page is clearly marked.
- Up/down arrows move through the list, left/right fold a category, Enter
  opens — so the whole of settings is reachable from a keyboard at the till.
- On a phone the same navigation opens as a slide-over from a button in the
  page header, instead of vanishing.
- The search box stays exactly as it is and keeps working across the new
  grouping.

## 3. Finish the controlled values

Already checked and already correct: stock adjustment reasons, units of
measure, tax mode, printer choice, paper handling and payment method type are
all pick-lists today. What is left:

- **Deactivate instead of delete.** Units of measure and product categories can
  only be removed today; there is no way to retire one while old records keep
  their meaning. Both gain Active / Inactive, matching how suppliers and
  payment methods already work. Inactive entries cannot be chosen for new
  records and stay readable on old ones.
- A short sweep of the remaining typed-in fields that have a fixed set of real
  answers, converting each to a pick-list. Addresses, notes, nicknames and
  anything genuinely free stay as they are.

## Not in this phase

Nothing moves, renames or deletes a settings page. Emergency Access is
untouched. Phase 6 (server-side access review and the final report) follows.

## Technical notes

- `src/lib/settings-catalog.tsx`: rework `SettingsCategoryId`,
  `SETTINGS_CATEGORIES` and `SETTINGS_GROUPS`, and reassign `category` on the
  cards. `src/lib/settings-groups.ts` cards/members updated to match.
- `SettingsShell.tsx` `NavRail` becomes collapsible with `localStorage`-backed
  open state, `role="tree"` keyboard handling and an active-descendant marker;
  a `Sheet`-based drawer trigger is added to `SettingsFrame` for `lg:hidden`.
- Migration: `is_active boolean not null default true` on `public.uom_units`
  and `public.product_categories`, with the catalogue reads filtering inactive
  entries out of pickers only.
- Tests: category assignment is exhaustive (every card lands in exactly one
  live category), search still resolves every page, collapse state round-trips,
  and an inactive unit or category cannot be selected for a new product.
- Typecheck, full Vitest run, then a version bump.
