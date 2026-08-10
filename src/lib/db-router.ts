/**
 * The one way in and out of stored data.
 *
 * Every write in the app goes through `dbRouter.write`, which tries the
 * targets in order:
 *
 *  1. this terminal — local SQL Server on Windows, the on-disk queue in a
 *     browser — and the change is flagged for cloud sync;
 *  2. the central database directly, if the local store is missing, full or
 *     refuses the write ("Cloud direct" shows in the status pill);
 *  3. nothing: the action stops and the operator is shown a modal saying the
 *     data could not be stored anywhere.
 *
 * Reads come from whatever is available: the local snapshot first when the
 * connection is down, the cloud otherwise.
 */
import { commitOps, commitLabel, type CommitTarget } from "./pos-db";
import { AllTargetsFailed, isCloudDirect, isConnectionError } from "./db-mode";
import type { SyncOp } from "./sync-outbox";

export { AllTargetsFailed, isCloudDirect };
export type { CommitTarget };

export const dbRouter = {
  /** Store a group of changes. Resolves only once the data is genuinely saved. */
  async write(context: string, ops: SyncOp[]): Promise<CommitTarget> {
    return commitOps(context, ops);
  },

  /**
   * Read through the router: the live source first, the local copy if the
   * connection is down or the live read fails.
   */
  async read<T>(live: () => Promise<T>, local: () => T | null): Promise<T> {
    try {
      return await live();
    } catch (e) {
      const cached = local();
      if (cached !== null && cached !== undefined && isConnectionError(e)) return cached;
      throw e;
    }
  },

  /** Plain wording for where a change landed. */
  label: commitLabel,
};