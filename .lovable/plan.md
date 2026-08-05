# Android warehouse app — phased build on top of the existing POS

Nothing on Web or Windows changes. Every Android screen lives behind a runtime
`isNative()` check, so the browser and Electron bundles never render or even load
the new code (native plugins are loaded with dynamic imports, as the existing
mobile storage already does).

I'm building this in three phases so each part can be verified on a real phone
before the next lands. Phase 1 is the one that makes the app useful in a warehouse.

## Decisions I made (you skipped the questions)

- **Phased delivery.** Phase 1 = dashboard, scanner, stock check, offline queue.
- **New tables only.** Stock counts, counted lines, unknown barcodes and photo
  records get their own tables. No existing table or business rule is touched.
- **Location level under each store.** No new "warehouse" entity — the flow
  becomes Store -> Location (aisle/shelf/bin, optional and free to skip), which
  fits the multi-store logic already in place.
- **Keep the existing APK self-updater.** Capgo needs a paid account and key;
  the app already checks `latest.json` in your bucket. If you get a Capgo key
  later I'll swap the download step over without touching anything else.

## Phase 1 — Scan and count

### Android dashboard
A tile grid that replaces the sidebar only when running inside the APK: Stock
Check, Scanner, Adjustment, Transfer, Product Search, Products, Purchase, Sales,
Reports, Recent Scans, Offline Queue, Sync, Settings. Large touch targets, dark
mode, portrait and landscape, phone and tablet. Reached at `/m`; on web that
route redirects to the normal dashboard so nobody stumbles into it.

### Barcode scanner
Full-screen camera scanner using ML Kit (already a dependency): EAN-13, EAN-8,
UPC-A/E, Code 128, Code 39, QR. Continuous or single-shot mode, autofocus,
torch, zoom slider, front/rear switch, beep and vibrate on a read, a manual
"type the barcode" fallback, and a rolling scan history. Camera permission is
requested with a plain-English explanation and a link to settings if denied.

### Stock check
Pick store, then location, then Start counting. Each scan of a known barcode
**increments the existing line rather than adding a new one** — expected,
counted and difference recalculate on every scan. Per-line quick buttons
+1/+5/+10/+20 and -1/-5/-10/-20 plus manual entry. The product panel shows
image, name, SKU, barcode, brand, category, colour, size, unit, selling price,
cost price, current stock, expected, counted, difference and last updated
(fields the catalogue does not carry yet show as blank rather than fake data).
Save closes the session; Sync pushes it.

Unknown barcode: an "Unknown product" sheet to photograph the item, confirm the
barcode, type a name and save it as **Pending** for an administrator to match to
a real product later.

### Offline and sync
Products, inventory, sessions, scans, images, adjustments, settings, session and
the pending queue are stored on the device (Capacitor Preferences today, moving
count data to SQLite because the volume is larger than Preferences is meant for).
Photos are compressed and written to the filesystem, uploaded when a connection
returns. The sync panel lists every queued item as Pending / Uploading /
Completed / Failed with automatic retry and a manual retry, and resolves
conflicts by keeping the latest approved version.

## Phase 2 — Adjustments, search, review

- Inventory adjustment page: increase, decrease, transfer, damaged, expired,
  returned, lost, found, manual correction — reason and notes required, photos
  optional, saved offline and queued.
- Product search across barcode, SKU, name, category, brand, colour, size,
  supplier and location, working fully from the on-device catalogue.
- Recent scans list with product, image, barcode, time, user, quantity and sync
  status, editable until it has been uploaded.

## Phase 3 — Packaging and polish

- Android settings page: app version, bundle version, database version, user,
  company, storage used, offline database size, pending uploads, last sync, Sync
  now, camera test, scanner test, clear cache, check/download/apply update,
  about, privacy policy, terms, logout.
- Startup and performance work: no splash freeze, lazy-loaded modules, list
  virtualisation, background sync throttled for battery.
- Signed **APK and AAB** produced by the existing GitHub workflow, uploaded to
  your bucket and ready for Google Play, with the keystore steps documented.

## Security

HTTPS only, encrypted local store for tokens and credentials, images kept in the
app's private storage, and an automatic backup of any unsent stock count so a
crash or a forced update can never lose a count.

## Technical notes

- New tables: `stock_count_sessions`, `stock_count_lines`, `pending_barcodes`,
  `stock_photos`, plus `store_locations`. Each gets grants, RLS scoped to staff
  roles, and created/updated timestamps. Existing tables untouched.
- Android-only routes are registered normally but their components return a
  redirect on non-native platforms; `nav-config.ts` gains a `nativeOnly` flag so
  the desktop/web sidebar never lists them.
- Plugins added: `@capacitor/camera`, `@capacitor-community/sqlite`,
  `@capacitor/network`, `@capacitor/splash-screen`, `@capacitor/local-notifications`.
  All loaded through `await import()` behind `isNative()` so the web and Electron
  bundles are byte-for-byte unaffected.
- Count data uses a device SQLite database with a Preferences fallback, sitting
  behind the same outbox/journal interfaces `sync-engine.ts` already uses, so the
  existing sync policy, branch isolation and audit logging all still apply.
- `android/` project files, `AndroidManifest` permissions (camera, vibrate,
  internet, install packages) and the AAB build step are added to
  `.github/workflows/android-apk.yml`; `docs/android-apk.md` is extended.
