/**
 * Last known good copy of the cloud data.
 *
 * The terminal writes a snapshot after every successful cloud load and reads
 * it back on start-up, so a Windows till with no connection opens straight
 * into a working register instead of waiting on a request that cannot finish.
 */
import type { CloudSlice } from "./pos-db";

const KEY = "pos.offline.snapshot.v1";

const isBrowser = () => typeof window !== "undefined";

export type Snapshot = CloudSlice & { savedAt: string };

export function writeSnapshot(slice: CloudSlice) {
  if (!isBrowser()) return;
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
  if (!isBrowser()) return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Snapshot) : null;
  } catch {
    return null;
  }
}

export function snapshotSavedAt(): string | null {
  return readSnapshot()?.savedAt ?? null;
}

export function clearSnapshot() {
  if (isBrowser()) window.localStorage.removeItem(KEY);
}
