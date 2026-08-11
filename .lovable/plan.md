# One data gateway wired to the Online/Offline switch

## What exists today (verified)

- The mode switch already lives in Sync & backup (`SyncSettings.tsx`) and writes a persisted preference (`db-mode.ts`, key `pos.db.mode`), with subscribers so the header pill updates instantly.
- `dbRouter` (`src/lib/db-router.ts`) already exists as the write facade over `commitOps`, plus a read helper — but almost nothing calls its read path.
- The push queue (`sync-outbox.ts`) and the two-way engine (`sync-engine.ts`, with `drainOutbox` and `pullDelta`) are in place.
- Direct database calls are already concentrated: only three files talk to the cloud directly (`pos-db.ts`, `catalog-meta.ts`, `public-flags.ts`), and the local SQL bridge is only reached through `local-db.ts`.

So this is a wiring and coverage job, not a rewrite: the missing pieces are read routing, mirror-on-success writes, and reacting to the switch itself.

## Step 1 — The switch drives everything

- Keep the existing persisted mode as the single source of truth and expose it through a small React hook so any screen re-renders the moment it flips.
- Flipping to Online triggers an immediate catch-up (push queued work, then pull changes). Flipping to Offline stops outbound traffic at once.

## Step 2 — One gateway for reads and writes

`dbRouter` gains plain table operations — list, insert, update, delete — so screens never choose a database themselves.

- Read, Online mode with a connection: read live, then quietly refresh the local copy with what came back.
- Read, Offline mode or unreachable server: read the local copy.
- Write, Online mode with a connection: save centrally first, then mirror the same row locally marked already-synced.
- Write, Offline mode or timeout: save locally marked pending with its own id, and queue it.
- A refusal for rule reasons (permission, duplicate) is reported as-is, never treated as "offline".

## Step 3 — Move the remaining modules onto the gateway

- Checkout and payments (register route, receipt and stock decrement path).
- Stock lookups across branches, inventory and transfer screens.
- Shift open/close, staff accounts and PIN changes.
- The three files still holding direct cloud calls are converted; nothing outside the gateway touches a database afterwards.

## Step 4 — Catch-up until both sides match

- Upward: replay pending local rows oldest-first, keyed on the row id so a repeat never duplicates, then clear the pending flag.
- Downward: pull everything changed centrally since the last clean sweep and merge it locally, never overwriting rows still waiting to go up.
- Runs on reconnect, on switching to Online, and on the existing timer. Sync & backup reports the remaining difference so full parity is visible.

## Step 5 — Checks

- Offline: a sale, a shift open and a stock lookup all work and show as pending.
- Online: queued work uploads on its own, fresh data comes down, later sales land in both places.
- Tests for routing order, both-targets-failed, and pending rows surviving a pull.

## Technical notes

- New table-level API added to `src/lib/db-router.ts` (kept as the single facade; `commitOps` stays the durable write gate underneath). A `dbProxy` alias export is provided for the naming in the brief.
- Local mirror writes go through `local-db.ts` (`pending_sync`, `synced_at`); the browser build mirrors into the offline snapshot instead.
- `sync-engine.ts` gains a mode-change subscriber; `pullDelta` keeps its `last_successful_sync` watermark.
- Version bump.