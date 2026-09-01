/**
 * Sync coverage, worked out from the registry instead of by hand.
 *
 * Every table a feature reads or writes is classified against the till's sync
 * contract: does it travel up to head office, does it come back down on a
 * normal sync, and can it be recovered on a fresh terminal? The audit document
 * used to be maintained by hand and drifted; this derives it, so a table added
 * to a feature with no sync decision shows up immediately.
 */
import { FEATURES } from "./feature-schema";

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
  membership_tiers: "Tier setup is administered centrally.",
  pin_attempts: "Throttling state is central.",
  cashiers: "Legacy staff table, central only.",
  integration_settings: "Administered centrally.",
  sku_audit: "Central reporting table.",
  audit_logs: "Kept on the till, but not branch-scoped centrally.",
};

/** Every table any feature touches, in one sorted list. */
export function registryTables(): string[] {
  const seen = new Set<string>();
  for (const feature of FEATURES) for (const op of feature.ops) seen.add(op.table);
  return [...seen].sort();
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
    return {
      table,
      push: push.has(table),
      pull: pull.has(table),
      restore: restore.has(table),
      ...(note ? { note } : {}),
    };
  });
}

/** Tables a feature uses that are neither synced nor deliberately central. */
export function uncovered(rows: Coverage[]): Coverage[] {
  return rows.filter((r) => !r.push && !r.pull && !r.restore && !r.note);
}

/** The audit document, generated. */
export function formatCoverage(rows: Coverage[]): string {
  const tick = (v: boolean) => (v ? "yes" : "—");
  const lines = [
    "# Sync coverage",
    "",
    "Generated from the feature registry — do not edit by hand.",
    "Run `node scripts/sync-coverage.cjs` after changing a feature or the sync contract.",
    "",
    "| Table | Pushed up | Pulled down | Restorable | Note |",
    "| --- | --- | --- | --- | --- |",
    ...rows.map(
      (r) => `| ${r.table} | ${tick(r.push)} | ${tick(r.pull)} | ${tick(r.restore)} | ${r.note ?? ""} |`,
    ),
  ];
  const gaps = uncovered(rows);
  lines.push("", "## Undecided tables", "");
  lines.push(
    gaps.length
      ? gaps.map((r) => `- ${r.table}`).join("\n")
      : "None — every table a feature uses is either synced or central by design.",
  );
  return `${lines.join("\n")}\n`;
}
