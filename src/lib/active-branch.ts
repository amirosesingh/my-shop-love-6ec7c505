/**
 * The one place that decides which branch a record belongs to.
 *
 * Order of truth:
 *   1. the branch this terminal is registered to (hardware binding),
 *   2. the branch currently in view,
 *   3. the branch mirrored locally by the desktop shell.
 *
 * Every write path uses this so a record can never be saved without a branch
 * while the terminal actually knows one.
 */
import { readBranch } from "./local-db";
import { readTerminalConfig } from "./terminal-tokens";

const clean = (v: string | null | undefined) => (v ?? "").trim() || null;

/**
 * Branch directory as last loaded. A single-branch business needs no explicit
 * assignment anywhere: the one branch that exists is the branch in use.
 */
let knownBranchIds: string[] = [];

/** Publish the loaded branch directory so the resolver can use it. */
export function setKnownBranches(ids: Array<string | null | undefined>) {
  knownBranchIds = ids.map((id) => (id ?? "").trim()).filter(Boolean);
}

/** The only branch this business has, or null when there are none or many. */
export function soleBranchId(): string | null {
  return knownBranchIds.length === 1 ? knownBranchIds[0] : null;
}

/** Branch id for this till, or null when nothing knows one yet. */
export function activeBranchId(inView?: string | null): string | null {
  return (
    clean(readTerminalConfig()?.locationId) ??
    clean(inView) ??
    clean(readBranch().branchId) ??
    soleBranchId()
  );
}

/** Human name for the branch, for messages and headers. */
export function activeBranchName(inView?: string | null): string | null {
  return clean(readTerminalConfig()?.locationName) ?? clean(inView) ?? clean(readBranch().branchName);
}

/**
 * Same as {@link activeBranchId} but refuses to return nothing, so a caller
 * never silently writes an orphan row.
 */
export function requireBranchId(inView?: string | null): string {
  const id = activeBranchId(inView);
  if (!id) {
    throw new Error(
      "This terminal has no branch yet — activate it or pick a branch before saving.",
    );
  }
  return id;
}