/**
 * Brute-force protection for PIN keypads.
 *
 * Five wrong PINs on this machine lock entry for five minutes. The count lives
 * on the device, so it holds with no connection too.
 *
 * Each keypad gets its own counter: a cashier who mistyped their PIN must never
 * lock the terminal out of Emergency Access, and a wrong recovery code must
 * never lock the till keypad. Pass a scope to keep the two apart.
 */
const KEY = "pos.pin.lockout";
export const MAX_PIN_ATTEMPTS = 5;
export const LOCKOUT_MS = 5 * 60 * 1000;

/** Which keypad a count belongs to. */
export type LockoutScope = "cashier" | "recovery";

const keyFor = (scope: LockoutScope) => (scope === "cashier" ? KEY : `${KEY}.${scope}`);

type State = { fails: number; until: number };

function read(scope: LockoutScope): State {
  if (typeof window === "undefined") return { fails: 0, until: 0 };
  try {
    const raw = window.localStorage.getItem(keyFor(scope));
    if (!raw) return { fails: 0, until: 0 };
    const parsed = JSON.parse(raw) as Partial<State>;
    return { fails: Number(parsed.fails ?? 0), until: Number(parsed.until ?? 0) };
  } catch {
    return { fails: 0, until: 0 };
  }
}

function write(scope: LockoutScope, state: State) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(keyFor(scope), JSON.stringify(state));
  } catch {
    /* storage full — the limit falls back to this session only */
  }
}

/** Milliseconds left on the lockout, or 0 when entry is allowed. */
export function lockoutRemaining(scope: LockoutScope = "cashier"): number {
  const { until } = read(scope);
  return until > Date.now() ? until - Date.now() : 0;
}

/** Record a wrong PIN and return the lockout left afterwards. */
export function notePinFailure(scope: LockoutScope = "cashier"): number {
  const state = read(scope);
  const fails = state.fails + 1;
  if (fails >= MAX_PIN_ATTEMPTS) {
    const until = Date.now() + LOCKOUT_MS;
    write(scope, { fails: 0, until });
    return until - Date.now();
  }
  write(scope, { fails, until: 0 });
  return 0;
}

/** Attempts left before the keypad locks. */
export function attemptsLeft(scope: LockoutScope = "cashier"): number {
  return Math.max(0, MAX_PIN_ATTEMPTS - read(scope).fails);
}

/** A good PIN clears everything. */
export function clearPinFailures(scope: LockoutScope = "cashier") {
  write(scope, { fails: 0, until: 0 });
}

/** "4 minutes 20 seconds" style wording for the countdown. */
export function describeLockout(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m && s) return `${m} min ${s} sec`;
  if (m) return `${m} min`;
  return `${s} sec`;
}