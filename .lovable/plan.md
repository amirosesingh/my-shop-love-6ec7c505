# Phase 8 — Dedicated request, transfer and receiving workspaces

Move the stock request / transfer / receiving workflow out of dialogs and into full-page screens, keeping every completed behaviour from Phase 7 (verification, short counts, ProductPicker, inventory posting, audit history).

## What exists today

- Requests and transfers are rows in the same `stock_transfers` table, separated by `kind` (`request` / `transfer`).
- The whole lifecycle (create, approve, dispatch, receive, verify) runs inside two dialogs on `/transfers`.
- There is no link column between a request and the transfer that fulfils it.

## Decisions taken

- A request still closes when it is dispatched; the request page shows requested / fulfilled / shortfall as figures, no new open-request state.
- Approving a request now spawns a **separate linked transfer row**, so request and transfer are distinct records joined by a reference.
- `/transfers` becomes a list-only screen; every create and workflow action navigates to a dedicated page.

## Screens to build

**`/requests/new`** — requesting branch, source branch, notes, and a product table using the existing ProductPicker showing source available stock, current branch stock and requested quantity. Saves through the existing create-transfer logic with `kind = request`.

**`/requests/$id`** — loads the saved request by ID. Header shows number, status, source, destination, cluster, user, date. Body shows per line: requested, approved, fulfilled, shortfall. Sections for the linked transfer, notes and full activity history.

**`/transfers/new`** — direct transfer with no request behind it. Same product workspace, no fake request reference is written.

**`/transfers/$id`** — full transfer record: number, direct vs request-based, source, destination, cluster, source request link when present, lines with transfer/dispatch/received/verified quantities, dispatch, receiving and verification blocks, activity history, and the action buttons valid for the current status.

**`/receiving/$id`** — the arrival and verification workspace. Receive marks arrival only; Verify captures the counted quantity line by line, requires a reason on a short count, and posts the verified quantities to the destination through the existing `stock_transfer_verify` path. Unchanged verification rules, new surface.

## Navigation

Request → linked transfer → receiving, and back the other way, all as real links. Every page loads its record from the database on refresh and deep-link, so browser back and reload behave normally. No workflow state lives in a modal.

## Cleanup

`/transfers` keeps the list, filters, export and print. Its create dialog and step dialog buttons become links to the new routes. Every other place that opens a transfer dialog (inventory hub, dashboards) is traced first and redirected; the dialog components are only deleted once no usage remains.

## Technical notes

- Migration: add `source_request_id` (nullable, self-referencing `stock_transfers`) plus an index, and mirror the column into `database/schema.sql`, the sync registry, restore tables and `src/lib/feature-schema.ts`. Update `stock_transfer_approve` so approving a `request` inserts the child transfer with copied approved quantities and the parent reference, and closes the parent with its fulfilment figure.
- New route files: `requests.new.tsx`, `requests.$id.tsx`, `transfers.new.tsx`, `transfers.$id.tsx`, `receiving.$id.tsx`, each with its own `head()` metadata and wrapped in the existing `AppShell`.
- A shared `TransferWorkspace` component holds the header/summary/lines layout so the five pages stay visually consistent; line editing reuses `ProductPicker` unchanged.
- Data access goes through the existing `src/lib/stock-transfers.ts` and `usePos()` actions — no new service layer. Pages fetch by ID (falling back to a direct fetch when the row is not in store state) so deep links work.
- Permissions reuse `useAuth().can(...)` with the current transfer capabilities; a user lacking a capability sees the page read-only rather than a blank screen.
- Tests: keep the 286 passing and add coverage for the request→transfer link, page-level status gating, and short-count posting through the new receiving route.
