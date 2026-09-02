/**
 * Sync coverage, worked out from the registry instead of by hand.
 *
 * Every table a feature reads or writes is classified against the till's sync
 * contract: does it travel up to head office, does it come back down on a
 * normal sync, and can it be recovered on a fresh terminal? The audit document
 * used to be maintained by hand and drifted; this derives it, so a table added
 * to a feature with no sync decision shows up immediately.
 */
import { FEATURES, type SecurityClass, type SyncDirection } from "@/core/types/feature-schema";

export type { SecurityClass, SyncDirection };

export type Coverage = {
  table: string;
  /** Written up to the central database by the sync worker. */
  push: boolean;
  /** Refreshed down to the till on the routine sync. */
  pull: boolean;
  /** Comes back after a wipe or a new install. */
  restore: boolean;
  /** Why a table is deliberately not on the till. */
  note?: string;
  /** What the feature registry says should happen. */
  declared?: SyncDirection;
  /** How sensitive the data is. */
  securityClass?: SecurityClass;
  /** Declared as needed after a rebuild. */
  restoreRequired?: boolean;
  /** Plain-language differences between intent and reality. */
  issues?: string[];
};

/**
 * Tables that live centrally on purpose. The till reaches them online only,
 * so they are never pushed, pulled or restored — and that is not a gap.
 */
export const CLOUD_ONLY: Record<string, string> = {
  app_users: "Staff accounts are administered centrally.",
  user_roles: "Roles are administered centrally.",
  staff_roles: "Role definitions are administered centrally.",
  authorization_actions: "Approval rules are administered centrally.",
  security_findings: "Security review data never leaves head office.",
  secure_settings: "Sealed credentials are never mirrored to a till.",
  settings_scoped: "Branch/cluster settings are resolved online.",
  settings_overrides: "Branch/cluster settings are resolved online.",
  settings_locks: "Branch/cluster settings are resolved online.",
  pos_store_settings: "Branch trading rules are resolved online.",
  branch_telemetry: "Head office monitoring only.",
  terminal_tokens: "Activation is an online-only exchange.",
  terminal_commands: "Kill-switch commands are read online.",
  system_audit_logs: "Central audit trail.",
  offline_sync_audit_log: "Written centrally by the sync worker itself.",
  whatsapp_queue: "Messaging is sent from head office.",
  public_flags: "Read online.",
  sync_metadata: "Sync bookkeeping.",
  coupon_events: "Loyalty ledger is authoritative centrally.",
  issued_vouchers: "Loyalty ledger is authoritative centrally.",
  coupon_campaigns: "Campaign setup is administered centrally.",
  
  pin_attempts: "Throttling state is central.",
  cashiers: "Legacy staff table, central only.",
  integration_settings: "Administered centrally.",
  sku_audit: "Central reporting table.",
  
};

/**
 * The intent each table is meant to have, per table, where the feature
 * registry does not say it on the operation itself. A table with no entry and
 * no op-level declaration is reported as undecided rather than assumed safe.
 */
export const TABLE_INTENT: Record<
  string,
  { syncDirection: SyncDirection; restoreRequired: boolean; securityClass: SecurityClass }
> = {
  sales: { syncDirection: "push", restoreRequired: true, securityClass: "financial" },
  sale_items: { syncDirection: "push", restoreRequired: true, securityClass: "financial" },
  payment_transactions: { syncDirection: "push", restoreRequired: true, securityClass: "financial" },
  // Bookings and their payments come back on the routine branch-scoped pull,
  // so a rebuilt till has them without an explicit history restore.
  booking_payments: { syncDirection: "both", restoreRequired: false, securityClass: "financial" },
  bookings: { syncDirection: "both", restoreRequired: false, securityClass: "operational" },
  shifts: { syncDirection: "push", restoreRequired: true, securityClass: "financial" },
  shift_sessions: { syncDirection: "push", restoreRequired: true, securityClass: "financial" },
  drawer_events: { syncDirection: "push", restoreRequired: true, securityClass: "financial" },
  held_orders: { syncDirection: "push", restoreRequired: true, securityClass: "operational" },
  stock_adjustments: { syncDirection: "push", restoreRequired: true, securityClass: "operational" },
  item_activity_logs: { syncDirection: "push", restoreRequired: true, securityClass: "governance" },
  purchase_orders: { syncDirection: "push", restoreRequired: true, securityClass: "operational" },
  purchase_order_items: {
    syncDirection: "push",
    restoreRequired: true,
    securityClass: "operational",
  },
  // Transfers involving this branch arrive on the routine scoped pull, so
  // they do not need the explicit history restore either.
  stock_transfers: { syncDirection: "both", restoreRequired: false, securityClass: "operational" },
  stock_transfer_items: {
    syncDirection: "both",
    restoreRequired: false,
    securityClass: "operational",
  },
  activity_events: { syncDirection: "push", restoreRequired: true, securityClass: "governance" },
  // Now branch-stamped centrally, so a rebuilt till can recover its own trail.
  audit_logs: { syncDirection: "push", restoreRequired: true, securityClass: "governance" },
  // The state history of everything this branch handled. Append-only centrally
  // and restorable, because a timeline that cannot be rebuilt is not a record.
  entity_status_history: {
    syncDirection: "push",
    restoreRequired: true,
    securityClass: "governance",
  },
  members: { syncDirection: "both", restoreRequired: false, securityClass: "operational" },
  products: { syncDirection: "both", restoreRequired: false, securityClass: "reference" },
  product_barcodes: { syncDirection: "pull", restoreRequired: false, securityClass: "reference" },
  product_categories: { syncDirection: "pull", restoreRequired: false, securityClass: "reference" },
  promotions: { syncDirection: "pull", restoreRequired: false, securityClass: "reference" },
  suppliers: { syncDirection: "pull", restoreRequired: false, securityClass: "reference" },
  // Downloaded with the rest of the catalogue so tier names and discounts
  // still resolve at the till with no connection.
  membership_tiers: { syncDirection: "pull", restoreRequired: false, securityClass: "reference" },
  coupon_campaigns: { syncDirection: "cloud-only", restoreRequired: false, securityClass: "reference" },
  coupon_events: { syncDirection: "cloud-only", restoreRequired: false, securityClass: "financial" },
  issued_vouchers: { syncDirection: "cloud-only", restoreRequired: false, securityClass: "financial" },
};

/** Every table any feature touches, in one sorted list. RPC ops are skipped. */
export function registryTables(): string[] {
  const seen = new Set<string>();
  for (const feature of FEATURES) {
    for (const op of feature.ops) if (!op.table.startsWith("rpc:")) seen.add(op.table);
  }
  return [...seen].sort();
}

/** The declared intent for one table: op-level first, then the table map. */
export function declaredIntent(table: string): {
  syncDirection?: SyncDirection;
  restoreRequired?: boolean;
  securityClass?: SecurityClass;
} {
  for (const feature of FEATURES) {
    for (const op of feature.ops) {
      if (op.table !== table) continue;
      if (op.syncDirection || op.restoreRequired !== undefined || op.securityClass) {
        return {
          ...(op.syncDirection ? { syncDirection: op.syncDirection } : {}),
          ...(op.restoreRequired !== undefined ? { restoreRequired: op.restoreRequired } : {}),
          ...(op.securityClass ? { securityClass: op.securityClass } : {}),
        };
      }
    }
  }
  return TABLE_INTENT[table] ?? {};
}

/** Combine the registry with the sync contract into one coverage matrix. */
export function buildCoverage(contract: {
  push: string[];
  pull: string[];
  restore: string[];
}): Coverage[] {
  const push = new Set(contract.push);
  const pull = new Set(contract.pull);
  const restore = new Set(contract.restore);
  return registryTables().map((table) => {
    const note = CLOUD_ONLY[table];
    const intent = declaredIntent(table);
    const actual = {
      push: push.has(table),
      pull: pull.has(table),
      restore: restore.has(table),
    };
    const issues: string[] = [];
    if (!intent.syncDirection) {
      issues.push("No sync decision has been recorded for this table.");
    } else if (intent.syncDirection === "cloud-only") {
      if (actual.push || actual.pull || actual.restore) {
        issues.push("Declared central-only, but the till syncs it.");
      }
    } else {
      if (intent.syncDirection !== "pull" && !actual.push) {
        issues.push("Should travel up to head office, but is never pushed.");
      }
      if (intent.syncDirection !== "push" && !actual.pull) {
        issues.push("Should come down to the till, but is never pulled.");
      }
    }
    if (intent.restoreRequired && !actual.restore) {
      issues.push("Needed after a rebuild, but is not restorable.");
    }
    return {
      table,
      ...actual,
      ...(note ? { note } : {}),
      ...(intent.syncDirection ? { declared: intent.syncDirection } : {}),
      ...(intent.securityClass ? { securityClass: intent.securityClass } : {}),
      restoreRequired: !!intent.restoreRequired,
      issues,
    };
  });
}

/** Tables a feature uses that are neither synced nor deliberately central. */
export function uncovered(rows: Coverage[]): Coverage[] {
  return rows.filter((r) => !r.push && !r.pull && !r.restore && !r.note);
}

/** Every row where what the till does differs from what the feature declared. */
export function mismatches(rows: Coverage[]): Coverage[] {
  return rows.filter((r) => (r.issues?.length ?? 0) > 0);
}

/** The audit document, generated. */
export function formatCoverage(rows: Coverage[]): string {
  const tick = (v: boolean) => (v ? "yes" : "—");
  const lines = [
    "# Sync coverage",
    "",
    "Generated from the feature registry and the till's own sync lists —",
    "do not edit by hand. Run `bun scripts/sync-coverage.cjs` after changing a",
    "feature or the sync contract.",
    "",
    "| Table | Kind | Intended | Pushed up | Pulled down | Restorable | Note |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...rows.map(
      (r) =>
        `| ${r.table} | ${r.securityClass ?? "—"} | ${r.declared ?? "not decided"} | ${tick(r.push)} | ${tick(r.pull)} | ${tick(r.restore)} | ${r.note ?? ""} |`,
    ),
  ];
  const bad = mismatches(rows);
  lines.push("", "## Gaps between intent and reality", "");
  lines.push(
    bad.length
      ? bad.map((r) => `- **${r.table}** — ${r.issues?.join(" ")}`).join("\n")
      : "None — every table behaves the way its feature declared.",
  );
  const gaps = uncovered(rows);
  lines.push("", "## Undecided tables", "");
  lines.push(
    gaps.length
      ? gaps.map((r) => `- ${r.table}`).join("\n")
      : "None — every table a feature uses is either synced or central by design.",
  );
  return `${lines.join("\n")}\n`;
}

/**
 * Conflict rules.
 *
 * When the same record is changed in two places, something has to give. The
 * rule is decided per table and written down, so nobody has to guess at three
 * in the morning why a price came back or why a count did not.
 *
 * - `cloud-wins`   — head office is authoritative; the till's copy is replaced.
 * - `till-wins`    — the terminal owns the record while it is trading.
 * - `append-only`  — nothing is overwritten; both versions live side by side.
 * - `immutable`    — once written the row never changes anywhere.
 */
export type ConflictRule = "cloud-wins" | "till-wins" | "append-only" | "immutable";

export const CONFLICT_RULE_TEXT: Record<ConflictRule, string> = {
  "cloud-wins": "Head office wins. The till replaces its copy on the next pull.",
  "till-wins": "The till wins while it holds the record; head office accepts what it sends.",
  "append-only": "Nothing is overwritten — each entry is kept in its own right.",
  immutable: "Written once and never changed; a correction is a new record.",
};

/** Rules that are not implied by the table's kind. */
const CONFLICT_OVERRIDE: Record<string, ConflictRule> = {
  // A branch edits its own members (points, phone) between syncs, but head
  // office owns the record overall, so the newer stamp decides — recorded as
  // cloud-wins because that is what the merge does on a tie.
  members: "cloud-wins",
  // Stock lives in both places: the till moves it by selling, head office by
  // receiving. Deltas are applied, never overwritten.
  products: "cloud-wins",
  bookings: "cloud-wins",
  booking_payments: "append-only",
  stock_transfers: "cloud-wins",
  stock_transfer_items: "cloud-wins",
  stock_adjustments: "append-only",
  held_orders: "till-wins",
};

/** The rule for one table, from the override list or its declared kind. */
export function conflictRule(table: string): ConflictRule {
  const override = CONFLICT_OVERRIDE[table];
  if (override) return override;
  const intent = declaredIntent(table);
  if (intent.securityClass === "financial") return "immutable";
  if (intent.securityClass === "governance") return "append-only";
  if (intent.syncDirection === "push") return "immutable";
  return "cloud-wins";
}

/** Every table a feature touches, with its rule — for docs and the dashboard. */
export function conflictRules(): { table: string; rule: ConflictRule; why: string }[] {
  return registryTables().map((table) => ({
    table,
    rule: conflictRule(table),
    why: CONFLICT_RULE_TEXT[conflictRule(table)],
  }));
}

/** The conflict-rules document, generated. */
export function formatConflictRules(): string {
  const rows = conflictRules();
  const lines = [
    "# Conflict rules",
    "",
    "What happens when the same record is changed centrally and at a till.",
    "Generated from the feature registry — do not edit by hand. Run",
    "`bun scripts/sync-coverage.cjs` after changing a feature.",
    "",
    "| Table | Rule | What that means |",
    "| --- | --- | --- |",
    ...rows.map((r) => `| ${r.table} | ${r.rule} | ${r.why} |`),
    "",
    "## Deletions",
    "",
    "Reference records (products, categories, barcodes, units, suppliers,",
    "promotions, membership tiers, locations, members) are never erased",
    "centrally: they are stamped with a deletion time. The stamp travels down",
    "the next sync and the till removes its own copy. Where local history still",
    "points at the record — a product on a past bill — the stamped row stays put",
    "and simply reads as gone. Transactional history is never deleted at all.",
  ];
  return `${lines.join("\n")}\n`;
}

/* ------------------------------------------------------------------ */
/* Recovery verdicts                                                   */
/* ------------------------------------------------------------------ */

/**
 * Recovery.
 *
 * One question, asked per feature: if this till's database were deleted
 * tonight, what would a replacement terminal get back from head office? The
 * answer is worked out from the same inputs as the coverage matrix, so it
 * cannot drift from what the sync loop actually does.
 *
 * - `full`       — everything the feature needs comes back.
 * - `partial`    — the records come back, part of their trail does not.
 * - `none`       — nothing of this feature survives a wipe.
 * - `not-needed` — read online by design; there is nothing to rebuild.
 */
export type RecoveryVerdict = "full" | "partial" | "none" | "not-needed";

export const RECOVERY_VERDICT_TEXT: Record<RecoveryVerdict, string> = {
  full: "Rebuilds completely",
  partial: "Rebuilds in part",
  none: "Does not rebuild",
  "not-needed": "Read online — nothing to rebuild",
};

export type Recovery = {
  feature: string;
  name: string;
  verdict: RecoveryVerdict;
  /** Tables that come back, and how. */
  recovered: string[];
  /** Tables that would be lost, in plain words. */
  losses: { table: string; what: string }[];
  /** Tables that live centrally on purpose. */
  central: string[];
};

/** The friendliest description we have of what a table holds. */
function tableMeaning(table: string): string {
  for (const feature of FEATURES) {
    for (const op of feature.ops) if (op.table === table) return op.label;
  }
  return table;
}

/** Per-feature recovery, given what the till really pushes, pulls and restores. */
export function recoveryVerdicts(contract: {
  push: string[];
  pull: string[];
  restore: string[];
}): Recovery[] {
  const rows = new Map(buildCoverage(contract).map((r) => [r.table, r]));
  return FEATURES.map((feature) => {
    const tables = [
      ...new Set(feature.ops.filter((o) => !o.table.startsWith("rpc:")).map((o) => o.table)),
    ];
    const recovered: string[] = [];
    const central: string[] = [];
    const losses: { table: string; what: string }[] = [];
    for (const table of tables) {
      const row = rows.get(table);
      const declared = row?.declared ?? declaredIntent(table).syncDirection;
      if (declared === "cloud-only" || (!row?.restore && !row?.pull && CLOUD_ONLY[table])) {
        central.push(table);
        continue;
      }
      if (row?.restore || row?.pull) recovered.push(table);
      else losses.push({ table, what: tableMeaning(table) });
    }
    const verdict: RecoveryVerdict =
      !recovered.length && !losses.length
        ? "not-needed"
        : losses.length === 0
          ? "full"
          : recovered.length === 0
            ? "none"
            : "partial";
    return { feature: feature.id, name: feature.name, verdict, recovered, losses, central };
  });
}

/** The recovery document, generated. */
export function formatRecovery(rows: Recovery[]): string {
  const full = rows.filter((r) => r.verdict === "full" || r.verdict === "not-needed").length;
  const lines = [
    "# Recovery after a wipe",
    "",
    "If a till's database is deleted, what does a replacement get back? Worked",
    "out from the feature registry and the till's own sync lists — do not edit",
    "by hand. Run `bun scripts/sync-coverage.cjs` after changing a feature.",
    "",
    `${full} of ${rows.length} features rebuild completely.`,
    "",
    "| Feature | Verdict | Comes back | Would be lost | Central by design |",
    "| --- | --- | --- | --- | --- |",
    ...rows.map(
      (r) =>
        `| ${r.name} | ${RECOVERY_VERDICT_TEXT[r.verdict]} | ${r.recovered.join(", ") || "—"} | ${
          r.losses.map((l) => `${l.table} (${l.what})`).join("; ") || "—"
        } | ${r.central.join(", ") || "—"} |`,
    ),
  ];
  return `${lines.join("\n")}\n`;
}
