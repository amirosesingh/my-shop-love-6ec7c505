/**
 * Saving register rules when the central system cannot be reached.
 *
 * A rule change is stored on the till first — through the same gateway every
 * other change uses, so the background sync worker uploads it, retries on its
 * own and only clears it once the central database has confirmed it. The till
 * applies the change immediately, and keeps applying it after a restart,
 * because the pending set is written to the encrypted device store as well.
 *
 * Nothing here decides who may change a rule: the screen has already checked
 * that, and the central save re-checks it on the server when the change is
 * uploaded.
 */
import { dbRouter } from "@/core/api/db-router";
import { writeCachedRules } from "./pos-rules-cache";
import { logRules } from "./pos-rules-log";
import type { PosRules } from "./pos-rules";

/** Marks a rule set that has not been confirmed centrally yet. */
export const PENDING_REVISION_PREFIX = "local:";

export type QueuedRules = {
  /** Where the change was actually stored. */
  target: string;
  savedAt: number;
};

/**
 * Park a rule change on this terminal and queue it for the central database.
 *
 * Throws when the change could not be stored anywhere at all — the caller
 * must then tell the operator the change was not kept.
 */
export async function queueRulesSave(input: {
  terminalId: string;
  branchId: string;
  rules: PosRules;
  patch: Record<string, boolean | number>;
  actor?: string | null;
}): Promise<QueuedRules> {
  const savedAt = Date.now();
  const row: Record<string, unknown> = {
    store_id: input.branchId || "",
    ...input.patch,
    updated_at: new Date(savedAt).toISOString(),
  };
  if (input.actor) row["updated_by"] = input.actor;

  const target = await dbRouter.upsert(
    "pos_store_settings",
    row,
    "store_id",
    "Saving register rules",
  );

  // The till must obey the new rules straight away, and still obey them after
  // a restart, so the pending set replaces the last confirmed one locally.
  await writeCachedRules({
    terminalId: input.terminalId,
    branchId: input.branchId,
    revision: `${PENDING_REVISION_PREFIX}${savedAt}`,
    syncedAt: savedAt,
    rules: input.rules,
    pending: true,
  });

  logRules("POS_RULES_SAVE_QUEUED", {
    terminal_id: input.terminalId,
    branch_id: input.branchId,
    category: String(target),
  });

  return { target: String(target), savedAt };
}

/** Two rule sets carry the same policy. */
export function rulesEqual(a: PosRules, b: PosRules): boolean {
  const keys = Object.keys(a) as (keyof PosRules)[];
  return keys.every((k) => a[k] === b[k]);
}

/** A pending change this old is abandoned rather than held against the branch. */
export const PENDING_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function pendingExpired(savedAt: number, now = Date.now()): boolean {
  return now - savedAt > PENDING_MAX_AGE_MS;
}
