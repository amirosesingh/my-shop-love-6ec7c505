/**
 * Last known good copy of the cloud data.
 *
 * The terminal writes a snapshot after every successful cloud load and reads
 * it back on start-up, so a Windows till with no connection opens straight
 * into a working register instead of waiting on a request that cannot finish.
 */
import type { CloudSlice } from "@/core/api/pos-db";
import { isOnlineOnly } from "./live-mode";

const KEY = "pos.offline.snapshot.v1";
let memory: Snapshot | null = null;
let hydrated = false;

const isBrowser = () => typeof window !== "undefined";

/**
 * Snapshots are a desktop-only convenience backed by the local SQL engine's
 * host shell. A plain browser build keeps nothing: it reads live or not at all.
 */
const canSnapshot = () =>
  isBrowser() && !!(window as unknown as { pos?: unknown }).pos && !isOnlineOnly();

export type Snapshot = CloudSlice & { savedAt: string };

const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/** Snapshots written by older builds can be missing whole slices. */
function normalise(raw: Partial<Snapshot>): Snapshot {
  return {
    ...raw,
    products: arr(raw.products),
    members: arr(raw.members),
    sales: arr(raw.sales),
    shifts: arr(raw.shifts),
    promotions: arr(raw.promotions),
    stores: arr(raw.stores),
    settings: (raw.settings ?? {}) as Snapshot["settings"],
    savedAt: raw.savedAt ?? new Date(0).toISOString(),
  } as Snapshot;
}

export function writeSnapshot(slice: CloudSlice) {
  // Android is live-only and the web build is cloud-only: nothing is kept.
  if (!canSnapshot()) return;
  memory = normalise({ ...slice, savedAt: new Date().toISOString() });
  const bridge = (window as unknown as {
    pos?: { setSetting?: (key: string, value: string | null) => Promise<unknown> };
  }).pos;
  const pending = bridge?.setSetting?.(KEY, JSON.stringify(memory));
  if (pending) void pending.catch(() => undefined);
}

/** Load the desktop snapshot from the embedded SQLite key/value table once. */
export async function hydrateSnapshot(): Promise<void> {
  if (!canSnapshot() || hydrated) return;
  hydrated = true;
  const bridge = (window as unknown as {
    pos?: { getSetting?: (key: string) => Promise<{ ok?: boolean; value?: string | null }> };
  }).pos;
  try {
    const stored = await bridge?.getSetting?.(KEY);
    memory = stored?.value ? normalise(JSON.parse(stored.value) as Partial<Snapshot>) : null;
  } catch {
    memory = null;
  }
}

export function readSnapshot(): Snapshot | null {
  if (!canSnapshot()) return null;
  return memory;
}

export function snapshotSavedAt(): string | null {
  return readSnapshot()?.savedAt ?? null;
}

export function clearSnapshot() {
  memory = null;
  if (!canSnapshot()) return;
  const bridge = (window as unknown as {
    pos?: { setSetting?: (key: string, value: string | null) => Promise<unknown> };
  }).pos;
  const pending = bridge?.setSetting?.(KEY, null);
  if (pending) void pending.catch(() => undefined);
}
