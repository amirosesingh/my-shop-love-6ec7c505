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
  try {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ ...slice, savedAt: new Date().toISOString() }),
    );
  } catch {
    /* storage full — the terminal simply falls back to the cloud next boot */
  }
}

export function readSnapshot(): Snapshot | null {
  if (!canSnapshot()) return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    return normalise(JSON.parse(raw) as Partial<Snapshot>);
  } catch {
    clearSnapshot();
    return null;
  }
}

export function snapshotSavedAt(): string | null {
  return readSnapshot()?.savedAt ?? null;
}

export function clearSnapshot() {
  if (isBrowser()) window.localStorage.removeItem(KEY);
}
