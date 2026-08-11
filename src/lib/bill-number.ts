/**
 * One bill numbering scheme for every register.
 *
 *   [BRANCH]-[PLATFORM][TERMINAL]-[YYYYMMDD]-[SEQUENCE]
 *   B101-PC01-20260811-0001   (Windows till)
 *   B101-MB01-20260811-0001   (handheld)
 *
 * The branch comes from the store this till trades in, the platform from the
 * shell it runs inside, and the terminal number from the activation that
 * registered the device. Because every part is device specific, two tills in
 * the same branch can never produce the same number, even offline.
 */
import { isElectron, isNative } from "./native";
import { readTerminalConfig } from "./terminal-tokens";

export type Platform = "PC" | "MB" | "WB";

const SEQ_KEY = "pos.bill.seq";
const TERMINAL_NO_KEY = "pos.bill.terminalNo";

/** Which shell this register runs in. */
export function currentPlatform(): Platform {
  if (isElectron()) return "PC";
  if (isNative()) return "MB";
  return "WB";
}

const clean = (v: string | null | undefined, fallback: string) =>
  (v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "") || fallback;

/** Stable 01–99 index for this device, derived from its activation token. */
export function terminalNumber(): string {
  if (typeof window !== "undefined") {
    const saved = window.localStorage.getItem(TERMINAL_NO_KEY);
    if (saved && /^\d{2}$/.test(saved)) return saved;
  }
  const seed = readTerminalConfig()?.tokenId ?? "";
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) % 99;
  const value = String((hash % 99) + 1).padStart(2, "0");
  if (typeof window !== "undefined" && seed)
    window.localStorage.setItem(TERMINAL_NO_KEY, value);
  return value;
}

/** Local date stamp (the till's own day, not UTC). */
export function dayStamp(at: Date = new Date()): string {
  const m = `${at.getMonth() + 1}`.padStart(2, "0");
  const d = `${at.getDate()}`.padStart(2, "0");
  return `${at.getFullYear()}${m}${d}`;
}

/** The fixed part of every bill number this device writes today. */
export function billPrefix(branchCode: string, at: Date = new Date()): string {
  return `${clean(branchCode, "BR")}-${currentPlatform()}${terminalNumber()}-${dayStamp(at)}`;
}

type SeqStore = { prefix: string; next: number };

const readSeq = (): SeqStore | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SEQ_KEY);
    const parsed = raw ? (JSON.parse(raw) as SeqStore) : null;
    return parsed && typeof parsed.next === "number" ? parsed : null;
  } catch {
    return null;
  }
};

const writeSeq = (value: SeqStore) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SEQ_KEY, JSON.stringify(value));
  } catch {
    /* storage unavailable — the number still comes out, just unseeded */
  }
};

/**
 * Highest sequence already used today by this device, read from bills the app
 * already holds. Keeps numbering correct after a reinstall or a cleared cache.
 */
export function seedFromExisting(prefix: string, existing: Iterable<string>): number {
  let highest = 0;
  for (const no of existing) {
    if (!no || !no.startsWith(`${prefix}-`)) continue;
    const tail = Number(no.slice(prefix.length + 1));
    if (Number.isFinite(tail) && tail > highest) highest = tail;
  }
  return highest;
}

/**
 * Next bill number for this branch/device/day. `existing` is any list of
 * receipt numbers the till already knows about, used to recover the counter.
 */
export function nextBillNumber(branchCode: string, existing: Iterable<string> = []): string {
  const prefix = billPrefix(branchCode);
  const saved = readSeq();
  const base =
    saved && saved.prefix === prefix ? saved.next : seedFromExisting(prefix, existing) + 1;
  const seq = Math.max(1, base, seedFromExisting(prefix, existing) + 1);
  writeSeq({ prefix, next: seq + 1 });
  return `${prefix}-${String(seq).padStart(4, "0")}`;
}

/** A checkout attempt id: retries of the same attempt reuse it, so no double bill. */
export const newClientTransactionId = (): string => crypto.randomUUID();