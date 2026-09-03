# Backend address answer + strict device storage lifecycle

## 1. What to type in "Backend address"

It is **not** a Supabase URL and **not** any key. It is the public address of **your own POS web app** (the hosted deployment of this project), because the till and the phone call `/api/...` endpoints on it (cashier sign-in, sync relay, health).

Enter one of:

- your custom domain, e.g. `https://pos.yourcompany.com`
- or the stable Lovable address of this project, `https://project--c6fa1ce9-3791-4c8e-bfa3-c6ef2eb207c5.lovable.app` (preview: `...-dev.lovable.app`)

Rules: full `https://`, no trailing slash, no path. Press "Test connection" — it calls `/api/public/health-metadata` and must answer OK. The cloud database URL/publishable key stay in the separate "Cloud keys" card in Recovery; they are not this field.

## 2. Storage policy: keep only what is required, survive updates, vanish on uninstall

Target behaviour on both Electron (Windows) and Android:

```text
fresh install      -> nothing remembered, setup screen
version update     -> identity + configuration kept, all derived cache dropped
uninstall / clear  -> absolutely nothing left behind, next install starts new
```

### What is classed as "required" (kept across updates)

- terminal activation record / token, device key
- backend address, cloud keys, local SQL connection settings
- branding + a tiny set of interface preferences
- Windows only: the local SQL mirror (offline trading data)

Everything else is derived cache and is disposable: OTA web-bundle copies, downloaded APK/installer files, HTTP/GPU/code caches, print spool leftovers, log files past a small cap, temporary drafts already synced.

### Android changes

- Turn off Android Auto Backup in the manifest patch step (`android:allowBackup="false"`, `android:fullBackupContent="false"`, empty data-extraction rules). Today Google can silently restore old preferences and sealed blobs onto a reinstalled app — that is exactly the "deleted but still remembers" behaviour to eliminate.
- Startup cleanup: delete downloaded APKs, old OTA bundles other than the active one, and Capacitor WebView HTTP/code cache; keep only the required keys already listed in `live-mode.ts`.
- On app-version change: keep identity/config keys, clear web-bundle cache and any stale mirror so the new build never runs on old cached assets.

### Electron changes

- Startup cleanup: prune Chromium `Cache`, `Code Cache`, `GPUCache`, `DawnCache`, crash dumps and old logs on every launch (extend the existing housekeeping pass, which currently only removes stray temp/print files).
- On app-version change: same rule — keep `pos_config.json`, terminal store, sealed DB config, branding, local mirror; drop everything cache-shaped.
- Uninstaller: make the Windows installer remove the whole `userData` folder (and the sealed credential files inside it) so an uninstall truly leaves nothing. The updater path must not trigger this.
- Keep the existing admin "Reset / erase configuration" action as the manual equivalent.

### Verification

- Unit tests for the retention classifier (required vs cache) on both platforms.
- Test that a simulated version bump keeps identity keys and clears cache keys.
- Manifest assertion test that Auto Backup stays disabled in generated Android projects.
- Real uninstall/reinstall proof has to be done on a device; CI can only assert the manifest and script behaviour.

## Notes

No business logic, schema, or Web behaviour changes. Web keeps reading its configuration from Cloudflare at request time.
