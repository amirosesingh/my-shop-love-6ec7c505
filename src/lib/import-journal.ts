/**
 * The importer's notebook.
 *
 * Every batch that is genuinely saved is written down here before the next one
 * starts, so if the machine is shut down or the app is killed half way through
 * a large file, the till still knows exactly which lines went in. Reopening the
 * importer with the same file then offers to finish the rest instead of
 * starting again and creating duplicates.
 */
import type { ImportOutcome, RejectedRow } from "@/lib/product-import";

const KEY = "pos.import.journal";
const MAX_RUNS = 10;

export type ImportRun = {
  importId: string;
  fileName: string;
  storeId: string;
  startedAt: string;
  updatedAt: string;
  finishedAt?: string;
  total: number;
  created: number;
  restocked: number;
  /** Row keys already written to the database — the resume list is built from this. */
  done: string[];
  skipped: RejectedRow[];
  failed: RejectedRow[];
  pending: RejectedRow[];
};

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readRuns(): ImportRun[] {
  try {
    const raw = storage()?.getItem(KEY);
    const rows = raw ? (JSON.parse(raw) as ImportRun[]) : [];
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

function writeRuns(rows: ImportRun[]) {
  try {
    storage()?.setItem(KEY, JSON.stringify(rows.slice(0, MAX_RUNS)));
  } catch {
    /* a full disk must never stop an import */
  }
}

export function saveRun(run: ImportRun) {
  const rest = readRuns().filter((r) => r.importId !== run.importId);
  writeRuns([{ ...run, updatedAt: new Date().toISOString() }, ...rest]);
}

export function readRun(importId: string): ImportRun | undefined {
  return readRuns().find((r) => r.importId === importId);
}

/** The most recent run of this file at this branch that never reached the end. */
export function findUnfinished(fileName: string, storeId: string): ImportRun | undefined {
  return readRuns().find(
    (r) => !r.finishedAt && r.fileName === fileName && r.storeId === storeId && r.done.length > 0,
  );
}

export function clearRun(importId: string) {
  writeRuns(readRuns().filter((r) => r.importId !== importId));
}

export function runToOutcome(run: ImportRun): ImportOutcome {
  return {
    importId: run.importId,
    fileName: run.fileName,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    total: run.total,
    created: run.created,
    restocked: run.restocked,
    skipped: run.skipped,
    failed: run.failed,
    pending: run.pending,
  };
}
