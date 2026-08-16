# Finish the verified-members rollout, then the health scanner

The verification engine is built but nothing on screen uses it yet. This picks up the three outstanding items in order.

## 1. Verify members from the members screen

`src/routes/members.tsx` today lists members with tier, points and spend, and has no notion of verification. Add:

- A **Verified** badge next to each member's name, driven by the member record.
- A **Verify** action per row that opens the existing `OtpVerificationModal`, pre-filled with that member's phone and email.
- The same action inside the quick-add member dialog used at the till, so a member created mid-sale can be verified straight away.
- When the gateway is switched off in settings, the action is hidden everywhere.

The POS member type does not carry the verification fields yet, so they get added to the member shape and to the read/write mapping so the badge survives a refresh.

## 2. Verification log

A new page listing every code sent: who it went to, on which channel, whether it was confirmed, how many attempts, which staff member sent it and when. Codes themselves are never shown — only their outcome. Reached from the Customers & Marketing hub and from the Integrations settings panel.

## 3. Dynamic health scanner

`src/lib/db-health.ts` probes a fixed, hand-written list of tables, so anything added later is invisible to the scan. Switch it to ask the database what actually exists (the `schema_inventory` function already installed) and probe that, keeping the current hand-written labels for the tables staff recognise and falling back to the fixed list when the function is unavailable.

## Technical notes

- Members screen reads `is_verified`, `verified_at`, `verified_channel` from `members`; mapping lives with the other member field mapping in the POS data layer.
- The log page calls the existing `listMemberVerifications` server function; no new database work.
- Health scanner: call `schema_inventory()`, merge with `BRANCH_TABLES` labels, keep the current no-op write probe unchanged.

## Not in this pass

The visual receipt designer stays out of this change — it is a screen of its own and is better done once verification is finished and settled.
