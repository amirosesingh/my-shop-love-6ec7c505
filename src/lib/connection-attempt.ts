/**
 * Attempt identity and hard client deadlines for the SQL connection wizard.
 *
 * The desktop shell bounds every IPC channel, but the renderer must never rely
 * on that alone: if a reply is lost the wizard would spin for ever. Each step
 * therefore races the bridge call against its own deadline and always reaches
 * one terminal state.
 */
import type { SqlAttemptStage, SqlAttemptStatus } from "@/lib/sql-admin";

export type { SqlAttemptStage, SqlAttemptStatus };

let seq = 0;

/** Unique, human-readable identity for one wizard run. */
export function newAttemptId(): string {
  seq += 1;
  return `att_${Date.now().toString(36)}_${seq.toString(36)}`;
}

/** Deadlines sit just above the main-process bound for the same channel. */
export const STEP_DEADLINE_MS: Record<string, number> = {
  socket: 18_000,
  handshake: 48_000,
  catalog: 18_000,
  lock: 48_000,
  write: 25_000,
};

export type DeadlineResult<T> =
  | { timedOut: false; value: T; elapsedMs: number }
  | { timedOut: true; elapsedMs: number };

/**
 * Resolves with the call's value, or reports a timeout at `ms`. The underlying
 * promise is detached — never awaited again — and its rejection is swallowed so
 * a late failure cannot surface as an unhandled rejection.
 */
export function withClientDeadline<T>(work: Promise<T>, ms: number): Promise<DeadlineResult<T>> {
  const started = Date.now();
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ timedOut: true, elapsedMs: Date.now() - started });
    }, ms);
    work.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ timedOut: false, value, elapsedMs: Date.now() - started });
      },
      () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ timedOut: true, elapsedMs: Date.now() - started });
      },
    );
  });
}

/** Safe one-line diagnostic: identity and timing only, never credentials. */
export function traceAttempt(
  attemptId: string,
  stage: SqlAttemptStage | string,
  status: SqlAttemptStatus | "running",
  elapsedMs?: number,
) {
  // eslint-disable-next-line no-console
  console.info(
    `[sql-wizard] attempt=${attemptId} stage=${stage} status=${status}${
      elapsedMs === undefined ? "" : ` elapsed=${elapsedMs}ms`
    }`,
  );
}
