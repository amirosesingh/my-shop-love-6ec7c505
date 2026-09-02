# Emergency Access as a full recovery hub + surfacing hidden features

## Part 1 — Emergency Access becomes a complete setup screen (Android + Electron)

Today `/recovery` sits behind the PIN gate and shows only two panels: backend address and cloud connection. If the terminal is not activated, or its local database is not configured, there is nothing on that screen to fix it — the user is told to "open Settings", which is exactly what they cannot reach.

Change: keep the PIN gate first (unchanged — time-based code, ±3 minutes drift, lockout), then show every setting a dead terminal needs to come back to life, each as its own collapsible card with a live status chip (OK / Needs attention / Not applicable on this device):

1. **Terminal activation** — activation code entry, QR pairing request, and unpair, reusing the existing activation component in an embedded (non-full-screen) form.
2. **Backend address** — existing panel.
3. **Cloud / central database keys** — existing panel (URL + publishable key, test, clear).
4. **Local database connection** — Electron only: the existing SQL Server connection settings, including instance discovery and driver install.
5. **Location / branch binding** — pick which branch or warehouse this device belongs to, when activation left it unset.
6. **Hardware** — receipt printer and drawer settings, so a till can be finished off from the same screen.
7. **Diagnostics footer** — connection re-check, device fingerprint, app version, and the "back to the till" button.

Cards that do not apply to the current platform (for example local SQL Server on Android) are hidden rather than shown broken. Nothing here needs the network, a signed-in user, or a live database: every panel writes to local/secure storage exactly as it does today.

The Emergency Access entry points (the Android offline gate and the Electron cloud-setup dialog) keep pointing at `/recovery`; they now land on the full hub instead of a two-panel page.

## Part 2 — Surfacing features that exist but are unreachable

Rule applied: anything that is background/back-end machinery stays invisible; anything a person operates gets a real entry point.

| Feature | Decision |
| --- | --- |
| Stock requests (`/requests/new`, `/requests/$id`) | Add a `/requests` list route + menu entry under Inventory & Supply |
| Goods receiving (`/receiving/$id`) | Add a `/receiving` list route + menu entry under Inventory & Supply |
| Customer display (`/display`) | Already in the menu; keep it — on Android it opens but is only useful on a second screen, so add a short note on the page saying so |
| Emergency access (`/recovery`) | Stays unlisted by design — reachable only from the offline/setup gates, behind the PIN |
| Restore drill / rebuild check | Operator-facing, but Windows-only in practice: keep it in the sync hub and label it as desktop-only instead of hiding it |
| Deep schema health & migration generator | Keep where it is; on non-desktop it already degrades to central-side findings only |
| Sync engine, tombstones, parking, telemetry, heartbeat | Back-end machinery — stays invisible, surfaced only through existing status indicators |

The two new list pages follow the existing transfers list: filters by status, search, and a "new" action, with the same permission flags used by the movement routes.

## Technical notes

- Files touched: `src/routes/recovery.tsx` (hub layout), a new `RecoveryHub` composition plus small embed-mode props on `TerminalActivation`, `DatabaseConnectionSettings`, `HardwarePanel`; new routes `src/routes/requests.index.tsx` and `src/routes/receiving.index.tsx`; `src/components/pos/nav-config.ts` for the two new entries.
- No changes to PIN derivation, secrets storage, sync, or any business logic.
- Head metadata added for both new routes.
- Version bumped with `node scripts/bump-version.cjs`.
