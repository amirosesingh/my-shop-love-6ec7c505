# Android stability, encrypted settings, offline DB script, shift-close alerts

## 1. Stop the Android app from de-registering the terminal

Root cause found: on every Android start-up the app deletes any stored key that
is not on a short "interface preferences" allow-list. The terminal activation is
saved under keys that are **not** on that list (`pos.terminal.config`,
`pos.terminal.pairing`), so the activation is wiped on each cold start. Opening
the camera makes Android reclaim memory and relaunch the app, which is exactly
why scanning appears to log the terminal out.

Fix:
- Treat the terminal activation as protected device state, never as business
  data: keep it out of the start-up purge and mirror it into the phone's
  persistent store so it survives relaunches, updates and low-memory kills.
- Store it sealed (AES-256-GCM with the per-device key) rather than as readable
  text, matching how other credentials are kept.
- Restore the activation before the first screen renders, so no "activate this
  terminal" screen can flash and no re-pairing is requested.
- Only a confirmed server verdict of "revoked" may clear an activation;
  network errors, blank lookups and app restarts must never clear it.

## 2. Camera no longer disturbs the session

- Ask for the camera permission once and remember the outcome, instead of
  re-requesting on each scan.
- Guard the scan flow so an activity relaunch resumes into the same screen with
  the terminal and staff session intact.

## 3. Encryption audit of settings

Sweep every place settings and credentials are written and produce a short
report, then close the gaps:
- Device-side (phone/desktop browser storage): activation, terminal account,
  printer/bank/local-database credentials, sync tokens — all sealed with the
  device key; anything still stored readable gets moved into the sealed store.
- Server-side: sensitive settings stay encrypted at rest via the existing
  settings-encryption helper; keys come from secrets, never from code.
- The Windows local database keeps its connection settings sealed, so a person
  browsing the machine cannot read or edit them.
- A new "Encryption" panel inside Settings > Diagnostics lists each settings
  group and shows whether it is sealed, so you can verify at a glance.

## 4. Offline database script

Provide `db/offline/pos-offline-sqlserver.sql` — one runnable Microsoft SQL
Server script that creates the local database, all offline tables, indexes and
the sync bookkeeping tables, safe to re-run. Plus a short guide covering:
creating the database, running the script, the connection details to enter in
Settings > Local Database, and how to verify the connection.

## 5. Shift-close notification to Android

When a shift is closed, a day summary is generated (store, terminal, staff,
open/close times, total sales, transaction count, payment breakdown, cash
counted vs expected, discounts and refunds) and delivered through the channels
you enable.

New "Shift alerts" page in mobile settings lets you choose per device:
- In-app alert (default): a badge and a summary card in the app.
- WhatsApp: the same summary sent to chosen manager numbers via the existing
  WhatsApp integration.
- Phone notification while the app is closed: prepared but switched off until
  you supply a Firebase key; the toggle explains what is needed.
- Recipient list and quiet-hours behaviour.

## Technical notes

- Allow-list and purge live in `src/lib/live-mode.ts` / `src/lib/mobile-storage.ts`;
  activation read/write in `src/lib/terminal-tokens.ts`; revocation loop in
  `src/lib/use-revocation-check.ts`; boot order in `NativeBoot.tsx`.
- Sealing uses `src/lib/device-secrets.ts` (AES-256-GCM per-device key) with a
  one-time migration of existing plain activation values.
- Camera gate in `src/lib/camera.ts` / `CameraScanner.tsx`.
- Shift summary is built where `closeShift` runs (`src/lib/pos-store.tsx`) and
  written to a new `shift_notifications` table (branch-scoped, RLS + grants);
  the phone reads unread rows. WhatsApp send goes through the existing
  `whatsapp.functions.ts` server function.
