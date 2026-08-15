/**
 * What version of each record this terminal last saw centrally.
 *
 * Every record in the central database carries a counter that goes up by one
 * on each change. When a till reads a record it remembers that counter here,
 * and when it later sends its own change back it says which version it was
 * working from. The database then keeps whichever copy is newer, so a till
 * that was offline for an hour can no longer undo work done elsewhere.
 */
const KEY = "pos.row.versions.v1";
/** Plenty for a shift's worth of edits; oldest entries fall off the end. */
const MAX = 4000;

type Versions = Record<string, number>;

const isBrowser = () => typeof window !== "undefined";

const cacheKey = (table: string, id: string) => `${table}:${id}`;

let memory: Versions | null = null;

function read(): Versions {
  if (memory) return memory;
  if (!isBrowser()) return (memory = {});
  try {
    memory = JSON.parse(window.localStorage.getItem(KEY) ?? "{}") as Versions;
  } catch {
    memory = {};
  }
  return memory;
}

function persist(next: Versions) {
  memory = next;
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage full — versions are an optimisation, never a source of truth */
  }
}

/** Remember the versions carried by rows that just came from the cloud. */
export function noteVersions(table: string, rows: unknown): void {
  if (!Array.isArray(rows) || !rows.length) return;
  const next = { ...read() };
  let touched = false;
  for (const row of rows as Record<string, unknown>[]) {
    const id = row?.["id"];
    const version = row?.["row_version"];
    if (typeof id !== "string" || typeof version !== "number") continue;
    next[cacheKey(table, id)] = version;
    touched = true;
  }
  if (!touched) return;
  const keys = Object.keys(next);
  if (keys.length > MAX) for (const k of keys.slice(0, keys.length - MAX)) delete next[k];
  persist(next);
}

/** The version this terminal believes the central copy is on, if it knows. */
export function knownVersion(table: string, id: string): number | undefined {
  return read()[cacheKey(table, id)];
}

/** Versions for a whole change, keyed by record id. */
export function versionsFor(table: string, ids: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of ids) {
    const v = knownVersion(table, id);
    if (typeof v === "number") out[id] = v;
  }
  return out;
}

/** Record ids a change touches, so their versions can be looked up. */
export function touchedIds(op: {
  kind: string;
  rows?: Record<string, unknown>[];
  match?: Record<string, unknown>;
}): string[] {
  if (op.kind === "insert" || op.kind === "upsert")
    return (op.rows ?? []).map((r) => String(r["id"] ?? "")).filter(Boolean);
  if (op.kind === "update") return [String(op.match?.["id"] ?? "")].filter(Boolean);
  return [];
}

/** Forget a record, so the next read decides its version afresh. */
export function forgetVersion(table: string, id: string) {
  const next = { ...read() };
  delete next[cacheKey(table, id)];
  persist(next);
}
