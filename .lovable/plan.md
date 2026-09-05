# What's left

The six-phase hardening work is finished and shipped. Three small loose ends remain.

## 1. Mark Phase 6 as done

The access review and the written report were completed, but the checklist still
shows Phase 6 as open. Tick it and note the report location.

## 2. Private catalogue: carry over the old per-product owners

Private catalogues are now enforced in the database through an owner branch on
each product. Existing products all start as shared, and the older
"product owners" list saved in settings was never copied across. Anything already
marked private in the old way therefore stays visible to everyone until someone
re-saves it.

Work: read the old owners list, copy each entry onto the matching product's owner
branch in one pass, and confirm afterwards that the private branches only show
their own items. If the old list turns out to be empty, nothing changes and we
say so.

## 3. Your confirmation on the live web settings

The published website reads its connection details from the hosting
configuration. Please confirm both values are set there; desktop and Android are
unaffected and need nothing.

## Technical notes

- Item 1: `roadmap.md` edit only.
- Item 2: read `settings_scoped` / `pos_settings` integration settings without a
  `union` query (that was rejected before), then a one-off backfill of
  `products.owner_store_id`, followed by a verification query per private branch.
  No schema change; `product_visible_to_me` already exists.
- Item 3: hosting variables `SUPABASE_URL` / `SUPABASE_ANON_KEY` on the Worker.
- Version bump via `node scripts/bump-version.cjs` if code changes.
