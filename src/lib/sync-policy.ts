/**
 * Live view of the current branch's sync switches for the sync engine.
 *
 * The engine cannot reach React state, so the POS store publishes the active
 * branch's policy here whenever it changes. Blocked writes simply stay in the
 * outbox until the switch is turned back on — nothing is ever dropped.
 */
import { defaultBranchPolicy, type BranchPolicy } from "@/core/types/pos-types";
import { syncAllowed } from "./branch-policy";

let current: BranchPolicy = defaultBranchPolicy;

export function setActiveBranchSyncPolicy(policy: BranchPolicy) {
  current = policy;
}

export function activeBranchSyncPolicy(): BranchPolicy {
  return current;
}

/** May a queued write for this table be pushed right now? */
export function tableSyncAllowed(table: string): boolean {
  return syncAllowed(current, table);
}
