/**
 * Sync coverage, worked out from the registry instead of by hand.
 *
 * Every table a feature reads or writes is classified against the till's sync
 * contract: does it travel up to head office, does it come back down on a
 * normal sync, and can it be recovered on a fresh terminal? The audit document
 * used to be maintained by hand and drifted; this derives it, so a table added
 * to a feature with no sync decision shows up immediately.
 */
import { FEATURES, type SecurityClass, type SyncDirection } from "./feature-schema";

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
  audit_logs: "Kept on the till, but not branch-scoped centrally.",
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
  stock_transfers: { syncDirection: "both", restoreRequired: true, securityClass: "operational" },
  stock_transfer_items: {
    syncDirection: "both",
    restoreRequired: true,
    securityClass: "operational",
  },
  activity_events: { syncDirection: "push", restoreRequired: true, securityClass: "governance" },
  audit_logs: { syncDirection: "push", restoreRequired: false, securityClass: "governance" },
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
