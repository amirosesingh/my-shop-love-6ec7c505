# What's left on the register settings work

Most of it is finished and verified in the code: the tills read the settings from the
configured backend, the server only answers for the branch a till can prove it belongs to,
the last confirmed settings survive a restart, a change on one device refreshes the others,
the status panel is on the Rules page, and the older loose ends (database page no longer
starts a sync, the small database badge reads the shared status, the database and sync
entries are in the grouped settings) are all in place.

Two things remain.

## 1. One source of truth for enforcement (code)

There are still two places that hold the same rule. The register settings hold the maximum
discount, and a separate older settings record (`review_ln_pct`, read in `src/core/api/pos-db.ts`
into `review.maxDiscountPct`) holds its own copy. Whichever screen reads the older copy can
allow or refuse something the Rules page says the opposite about.

Work:
- Walk every rule-driven action — refunds, voids, discounts, price overrides, drawer opening,
  cash variance, shift close, manager approval, negative stock, held bills, terminal reset —
  and confirm each one reads the register settings and nothing else.
- Where an older duplicate exists, keep the register settings as the deciding value and stop
  reading the duplicate; leave the stored older value alone so nothing else breaks.
- Classify any fixed numbers found on the way as real configuration, a system constant, or a
  safety default before touching them. No server-side check is relaxed.
- Tests covering an ON and an OFF value for each audited rule, plus a test that the two
  discount limits can no longer disagree.
- Version bump.

## 2. Your confirmation on the live website settings (no code)

The published website reads its connection details from the hosting configuration. Please
confirm both values are set there. Desktop and Android are unaffected — they use the details
entered on the device.

## Technical notes

- Audit entry points: `usePosRules()` consumers and `loadRulesResult` callers (15 sites today).
- Duplicate to retire on the read path: `review.maxDiscountPct` in `src/core/api/pos-db.ts`
  versus the register settings discount ceiling used by `DiscountPad` and the checkout guards.
- Verification: `bunx vitest run` in full, plus loading `/settings/rules` and running a
  discount, refund and shift close on the till.
