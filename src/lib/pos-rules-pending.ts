/**
 * Small helpers about a rule change that is still waiting to reach the
 * central database. Kept separate from the write path so the reader can use
 * them without pulling the whole data gateway in.
 */
import type { PosRules } from "./pos-rules";

/** Marks a rule set that has not been confirmed centrally yet. */
export const PENDING_REVISION_PREFIX = "local:";

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
