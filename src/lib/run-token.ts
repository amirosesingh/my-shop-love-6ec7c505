/**
 * Guards a multi-step async run against its own leftovers.
 *
 * The connection wizard walks several IPC calls in sequence. If the dialog is
 * closed — or a new run started — halfway through, the earlier promises still
 * settle. Without a token they write their result into fresh state and the UI
 * shows a step spinning for a run nobody is waiting for any more.
 */
export type RunGuard = {
  /** Starts a new run, invalidating any earlier one. */
  start: () => number;
  /** True only while `token` is still the current run. */
  isLive: (token: number) => boolean;
  /** Invalidates the current run without starting another. */
  abandon: () => void;
  /** The token of the current run; 0 before the first start. */
  current: () => number;
};

export function createRunGuard(): RunGuard {
  let token = 0;
  return {
    start: () => ++token,
    isLive: (t) => t === token && t !== 0,
    abandon: () => void ++token,
    current: () => token,
  };
}