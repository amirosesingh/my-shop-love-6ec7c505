/**
 * Terminal identity + ordering for the offline activity journal.
 *
 * Every log entry and every queued cloud write is stamped with the branch it
 * happened at, the terminal that produced it and a monotonic per-terminal
 * sequence number. That makes replay after a long offline stretch
 * deterministic: the cloud can rebuild exactly what happened, in the order it
 * happened, for each branch independently.
 */
const TERMINAL_KEY = "pos.journal.terminalId";
const SEQ_KEY = "pos.journal.seq";
const BRANCH_KEY = "pos.journal.branchId";

const isBrowser = () => typeof window !== "undefined";

/** Stable id for this physical till, generated once and kept forever. */
export function terminalId(): string {
  if (!isBrowser()) return "server";
  let id = window.localStorage.getItem(TERMINAL_KEY);
  if (!id) {
    id = `T-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    window.localStorage.setItem(TERMINAL_KEY, id);
  }
  return id;
}

/** The branch this terminal is currently working at. */
export function branchId(): string | null {
  if (!isBrowser()) return null;
  return window.localStorage.getItem(BRANCH_KEY);
}

export function setBranchId(id: string | null) {
  if (!isBrowser()) return;
  if (id) window.localStorage.setItem(BRANCH_KEY, id);
  else window.localStorage.removeItem(BRANCH_KEY);
}

/** Monotonic counter — never reused, survives restarts and offline periods. */
export function nextSeq(): number {
  if (!isBrowser()) return 0;
  const next = Number(window.localStorage.getItem(SEQ_KEY) ?? "0") + 1;
  window.localStorage.setItem(SEQ_KEY, String(next));
  return next;
}

export function currentSeq(): number {
  if (!isBrowser()) return 0;
  return Number(window.localStorage.getItem(SEQ_KEY) ?? "0");
}

export type JournalStamp = {
  terminalId: string;
  branchId: string | null;
  seq: number;
  /** clock reading on the machine that produced the entry */
  deviceTime: string;
};

export function stamp(branch?: string | null): JournalStamp {
  return {
    terminalId: terminalId(),
    branchId: branch ?? branchId(),
    seq: nextSeq(),
    deviceTime: new Date().toISOString(),
  };
}

/** Oldest-first replay order for anything carrying a stamp. */
export function replayOrder<T extends { terminalId?: string; seq?: number; deviceTime?: string }>(
  entries: T[],
): T[] {
  return [...entries].sort((a, b) => {
    const ta = a.terminalId ?? "";
    const tb = b.terminalId ?? "";
    if (ta === tb) return (a.seq ?? 0) - (b.seq ?? 0);
    const da = Date.parse(a.deviceTime ?? "") || 0;
    const db = Date.parse(b.deviceTime ?? "") || 0;
    return da - db;
  });
}
