/**
 * Tunable numbers for the background sync worker.
 *
 * One place owns every timing constant so the worker, the queue and the
 * settings panel can never disagree. Values are stored on the device; the
 * defaults are used until someone changes them in Settings → Sync.
 */
export type SyncConfig = {
  /** How often the worker runs a full cycle while idle (ms). */
  intervalMs: number;
  /** How many queued changes one pass sends before yielding (batch size). */
  batchSize: number;
  /** Attempts before a change is parked as a dead letter. */
  maxAttempts: number;
  /** Longest wait between two attempts (ms). */
  maxBackoffMs: number;
  /** Heartbeat gap while the device looks healthy (ms). */
  heartbeatMs: number;
};

export const DEFAULT_SYNC_CONFIG: SyncConfig = {
  intervalMs: 20_000,
  batchSize: 25,
  maxAttempts: 10,
  // 5s, 15s, 45s, 135s … capped at five minutes.
  maxBackoffMs: 300_000,
  heartbeatMs: 20_000,
};

/** First wait after a failure; each further attempt triples it up to the cap. */
export const BASE_BACKOFF_MS = 5_000;
export const BACKOFF_FACTOR = 3;

const KEY = "pos.sync.config";

const isBrowser = () => typeof window !== "undefined";

type Listener = () => void;
const listeners = new Set<Listener>();

const LIMITS: Record<keyof SyncConfig, [number, number]> = {
  intervalMs: [5_000, 300_000],
  batchSize: [1, 500],
  maxAttempts: [1, 50],
  maxBackoffMs: [30_000, 1_800_000],
  heartbeatMs: [5_000, 300_000],
};

function clampConfig(patch: Partial<SyncConfig>): Partial<SyncConfig> {
  const out: Partial<SyncConfig> = {};
  for (const [key, value] of Object.entries(patch) as [keyof SyncConfig, unknown][]) {
    const n = Number(value);
    if (!Number.isFinite(n)) continue;
    const [min, max] = LIMITS[key];
    out[key] = Math.min(max, Math.max(min, Math.round(n)));
  }
  return out;
}

let cache: SyncConfig | null = null;

export function syncConfig(): SyncConfig {
  if (cache) return cache;
  if (!isBrowser()) return DEFAULT_SYNC_CONFIG;
  try {
    const raw = window.localStorage.getItem(KEY);
    const saved = raw ? (JSON.parse(raw) as Partial<SyncConfig>) : {};
    cache = { ...DEFAULT_SYNC_CONFIG, ...clampConfig(saved) };
  } catch {
    cache = DEFAULT_SYNC_CONFIG;
  }
  return cache;
}

export function setSyncConfig(patch: Partial<SyncConfig>): SyncConfig {
  const next = { ...syncConfig(), ...clampConfig(patch) };
  cache = next;
  if (isBrowser()) {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* storage full — the change applies for this session only */
    }
  }
  for (const l of listeners) l();
  return next;
}

export function resetSyncConfig(): SyncConfig {
  cache = { ...DEFAULT_SYNC_CONFIG };
  if (isBrowser()) window.localStorage.removeItem(KEY);
  for (const l of listeners) l();
  return cache;
}

export function subscribeSyncConfig(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test seam: forget the cached copy so the next read hits storage again. */
export function resetSyncConfigCache() {
  cache = null;
}
