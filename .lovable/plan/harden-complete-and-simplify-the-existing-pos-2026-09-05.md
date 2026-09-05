# Harden, complete and simplify the existing POS

No rewrite. Every item below changes existing screens, services, functions or tables.
Work is phased so each phase ships tested and the till keeps working in between.

## What the scan found

Confirmed by reading the code and the database schema:

- Branches already carry a group ("cluster") field, already support store /
  main building / sub-warehouse / central warehouse and parent-child nesting,
  and per-branch privacy policy already exists. GREEN, keep.
- The group on a branch is a **free-text box** (Branches screen) and the branch
  table stores whatever is typed. There is no place to create or manage groups.
  RED — this is what makes cross-group rules unreliable.
- Transfers already have a full lifecycle with approval, dispatch, receive,
  verify and audit, enforced by database triggers. GREEN.
- Whether a transfer needs approval is decided **only** by a per-branch setting
  ("require transfer approval"), never by comparing the two groups. A transfer
  from one group to another can complete with no approval. RED.
- Terminals already store a last-seen timestamp, but the Terminals screen does
  not show it and has no online / offline / stale meaning. YELLOW.
- Settings already has one registry driving the menu, the home page and search.
  It has ~40 entries in categories that don't match how people think. YELLOW —
  regroup the existing entries, add nothing new.
- Sync already tracks pending and failed counts, queue and retry. YELLOW —
  surface the truthful numbers in one place.
- Emergency Access: untouched throughout.

## Phase 1 — Groups become real

- New `store_groups` table (name, code, active, archived) with owner-side rules
  and audit, plus a one-off backfill of the group names branches already use so
  nothing changes meaning.
- New Settings page "Groups" under Business, reusing the existing settings shell:
  create, rename, activate/deactivate, archive, see the branches in each group.
  Archived or inactive groups can't be picked for new assignments; existing
  assignments and history stay readable.
- Branch editor: the free-text group box becomes a searchable dropdown of active
  groups; the branch stores the group's ID.
- Branch list, transfer screens and reports show the group name from the record.

## Phase 2 — Cross-group transfers cannot skip approval

- Database: when the source branch's group differs from the destination's group,
  approval is mandatory regardless of any setting. The rule compares group IDs.
- The stock movement itself is blocked unless a valid approval exists for that
  exact transfer and its exact contents; changing lines after approval voids it.
- Approver rules move into Settings ("Approval authorities" on the existing
  permissions page): allowed roles plus named people. The requester can never
  approve their own request. Every approve/reject is audited.
- Transfer screens show why approval is required and who can give it.

## Phase 3 — Terminals tell the truth

- Terminals screen (existing route) shows terminal, branch, platform, version,
  status, last seen, activation and sync state, with a Manage action.
- Status is derived from the last heartbeat, with one shared threshold:
  online, offline, stale.
- "Current terminal" panel shows the device the administrator is on:
  ID, branch, platform, version, activation, connection, last sync, database.
- Clear terminal revokes the device identity and refuses its old credentials
  afterwards; sales, shifts, payments, transfers and audit history are never
  deleted. Reinstall then requires fresh setup and activation.

## Phase 4 — Sync you can act on

- One sync panel on the existing Sync page: connection, last successful sync,
  last server acknowledgement, pending count, failed count, oldest pending.
- Failed records list with type, terminal, time, reason, attempts, plus Retry
  and Retry all. No silent discarding; clearing the queue needs confirmation.
- Verify replay protection end-to-end for sales, payments, stock movements and
  transfers so a reconnect cannot double-post.

## Phase 5 — Settings reorganisation and controlled values

- Regroup the existing settings entries into: Business & locations, People &
  permissions, Products & inventory, Terminals & devices, Printing & hardware,
  Sales & receipts, Payments & tax, Sync & data, Security, System health.
  No page is deleted or recreated; only its category and wording change.
- Sidebar: collapsible categories, icons, clear active state, keyboard support,
  mobile-friendly, existing search kept and pointed at the new grouping.
- Replace free-text fields that should be a choice — group, printer type, paper
  size, connection, port, tax type, transfer and adjustment reasons, units —
  with dropdowns or toggles fed by real supported values. Addresses, notes and
  nicknames stay free text.
- Controlled lists get Active / Inactive / Archived instead of deletion, so
  historical records keep their meaning.

## Phase 6 — Server-side access review

- Confirm, per operation, that branch and group authority is enforced in the
  database and the sync relay, not just hidden in the interface: inventory
  reads and writes, transfers, approvals, sales, payments, staff, settings,
  terminals, reports and audit.
- Private branches stay private to an outside caller that changes IDs by hand.
- Committed configuration file review: keep only the public web values and the
  example file; make sure desktop and Android builds still carry no web values.

## Tests and checks

New tests alongside the existing suite: group create/edit/deactivate and branch
assignment by ID; same-group vs cross-group transfer; unauthorised approval
refused; stock unchanged before approval and moved exactly once after; terminal
online/offline/stale/cleared/revoked and reinstall; sync pending, failure,
retry and replay prevention; private-branch and ID-tampering attempts.
Type check, lint, full suite and the web/desktop/Android build checks run each
phase, plus a regression pass over selling, shifts, inventory, receiving,
transfers, reports and Emergency Access.

## Delivered at the end

A written report: what was already working and left alone, what changed and why,
what was genuinely added, security findings by severity, and anything still open.

## Technical notes

- New table `public.store_groups` (text id, code, name, is_active, archived_at,
  timestamps) with grants, RLS and audit; `stores.group_id` keeps its column and
  gains a foreign key after backfill — additive, no renames or drops.
- Cross-group rule lands in `stock_transfer_approval_required` plus the status
  trigger and the stock-apply path, comparing `stores.group_id` on both sides.
- Approver rules stored in the existing authorization/settings tables; approval
  validated against a content hash of the transfer lines.
- Terminal status derives from `terminal_tokens.last_seen_at` through one shared
  helper used by the UI and any server check.
- Settings changes are edits to `src/lib/settings-catalog.tsx` and the existing
  settings shell/sidebar components only.
