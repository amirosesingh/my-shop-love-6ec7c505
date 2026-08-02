# Auto-update, reusable terminal tokens, and font size control

Three separate improvements: the Windows app updates itself, a branch's terminal can get a fresh code without creating a duplicate entry, and the operator can set text size independently of the window size.

## 1. Electron auto-update

- Add `electron-updater` and package the Windows build as an installer so updates can be applied in place.
- On launch and every 6 hours the app checks the update feed, downloads in the background, and shows a small "Update ready — restart to install" toast. Restarting applies it; nothing is forced mid-shift.
- The saved terminal registration survives updates: it lives in the app's persistent user-data profile, not the program folder. The plan also mirrors it to a JSON file via the desktop bridge as a safety net, restored automatically if the browser storage is ever wiped — so after an update the till starts already activated and goes straight to login.
- Update feed: configured by a build-time URL (`POS_UPDATE_FEED`). Tell me where builds will be hosted (GitHub releases or a plain web folder) and I wire that in.
- Settings → Display gains an "App updates" card: current version, "Check for updates" button, download progress.

## 2. Re-issue a token for an existing terminal

Instead of only "Register a new terminal":

- Each row in the Registered terminals table gets a **Re-issue code** action. It keeps the same device name and location, retires the old code, creates the replacement, and shows the QR + copy block right there.
- Revoked rows keep **Re-enable**, and also get **Re-issue code**, so a disconnected till comes back with a fresh code without a new table entry.
- Every re-issue is written to the audit log with device, location and who did it.
- The row shows created / last seen plus a "re-issued" timestamp, so the history stays visible.

## 3. Font size independent of display scaling

Settings → Display currently has one slider that scales text and controls together.

- Split it into **Interface size** (existing behaviour: controls and layout) and a new **Text size** slider (90%–160%) that only changes font size.
- Both are terminal-local, apply live, and appear in the existing preview card so the operator sees the result before leaving the page.
- Touch-safe button minimums still apply, so larger text never breaks the till layout.

## Technical notes

- `electron/main.cjs`: `electron-updater` wiring with IPC channels `update:check`, `update:status`, `update:install`; packaging switches to an NSIS installer so in-place updates work. `electron/preload.cjs` exposes `window.pos.updates`.
- Terminal config persistence: new `terminal:config` read/write IPC backed by a JSON file in `app.getPath('userData')`; `src/lib/terminal-tokens.ts` reads localStorage first and falls back to that file, writing both.
- `src/lib/terminal-tokens.ts`: add `reissueTerminalToken(tokenId)` — retire the old row, insert a replacement carrying the same `device_name` / `location_id`, return the new code. Needs a small schema addition (`replaced_by`, `reissued_at`) shipped as `supabase/schema12.sql` to run once.
- `src/components/pos/TerminalTokens.tsx`: per-row re-issue with confirmation dialog and inline QR panel.
- `src/lib/use-ui-scale.ts`: add `textScale` to the prefs store and a `--pos-text-scale` variable; `src/styles.css` multiplies font sizes (not control heights) by it. `DisplayScalingSettings.tsx` gains the second slider plus the update card.