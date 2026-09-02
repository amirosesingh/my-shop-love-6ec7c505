/**
 * One shared answer to "can we reach a database right now?".
 *
 * The central database and the local SQL Server on this machine are checked
 * in parallel, each with its own short timeout, and the answer is cached for
 * two seconds so a burst of till actions never becomes a burst of probes.
 *
 * The local engine lives in the Windows desktop shell (native SQL Server
 * driver in the Electron main process); this module only asks the bridge.
 */
import { supabaseExternal } from "@/integrations/supabase/external-client";
import { localDb } from "@/lib/local-db";
import { hydrateTerminalConfig } from "@/core/activation/terminal-tokens";

export type HealthReport = {
  /** Central database answered in time. */
  cloud: boolean;
  /** Local SQL Server answered in time. */
  local: boolean;
  /** At least one place can take a read or a write. */
  anyOnline: boolean;
  /** When the probe ran (epoch ms). */
  at: number;
};

const CLOUD_TIMEOUT = 1000;
const LOCAL_TIMEOUT = 800;
const CACHE_MS = 2000;

const OFFLINE: HealthReport = { cloud: false, local: false, anyOnline: false, at: 0 };

let cached: HealthReport | null = null;
let inflight: Promise<HealthReport> | null = null;

type Listener = (report: HealthReport) => void;
const listeners = new Set<Listener>();

/** Resolve to `false` rather than hang when a target is slow to answer. */
function withTimeout(work: Promise<boolean>, ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), ms);
    work
      .then((ok) => {
        clearTimeout(timer);
        resolve(ok);
      })
      .catch(() => {
        clearTimeout(timer);
        resolve(false);
      });
  });
}

async function probeCloud(): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
  await hydrateTerminalConfig();
  const { error } = await supabaseExternal.from("public_flags").select("key").limit(1);
  return !error;
}

async function probeLocal(): Promise<boolean> {
  const bridge = localDb();
  if (!bridge) return false;
  const status = await bridge.status();
  return !!status?.connected;
}

/** The last probe result without running a new one. */
export const lastHealth = (): HealthReport | null => cached;

/** True when the cached answer is still fresh enough to reuse. */
const fresh = (report: HealthReport | null): report is HealthReport =>
  !!report && Date.now() - report.at < CACHE_MS;

/**
 * Check both databases. Repeated calls inside the cache window share one
 * result, and simultaneous callers share one in-flight probe.
 */
export function checkHealth(force = false): Promise<HealthReport> {
  if (!force && fresh(cached)) return Promise.resolve(cached);
  if (inflight) return inflight;
  inflight = (async () => {
    const [cloud, local] = await Promise.all([
      withTimeout(probeCloud(), CLOUD_TIMEOUT),
      withTimeout(probeLocal(), LOCAL_TIMEOUT),
    ]);
    const report: HealthReport = { cloud, local, anyOnline: cloud || local, at: Date.now() };
    cached = report;
    inflight = null;
    for (const l of listeners) l(report);
    return report;
  })();
  return inflight;
}

/** Is anything reachable? Uses the cached answer when it is still fresh. */
export async function anyDatabaseReachable(): Promise<boolean> {
  return (await checkHealth()).anyOnline;
}

/** Watch health changes (status pills, banners). */
export function subscribeHealth(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Forget the cached answer — used by tests and after a manual reconnect. */
export function resetHealthCache() {
  cached = null;
  inflight = null;
}

/* ------------------------------------------------------------------ */
/* Connectivity: the single source of truth for "are we online?"       */
/* ------------------------------------------------------------------ */

/**
 * `connecting` is the honest answer before the first heartbeat has come
 * back. The app shows a pulsing cloud during that window and never claims to
 * be offline on a guess — `navigator.onLine` is only ever used as a hint that
 * it is worth running a probe right now.
 */
export type Connectivity = "connecting" | "online" | "offline";

/** Shortest time the "connecting" cloud stays on screen, so the eye sees it. */
export const MIN_CONNECTING_MS = 1500;

type ConnListener = (state: Connectivity) => void;
const connListeners = new Set<ConnListener>();

let connectivityState: Connectivity = "connecting";
let resolvedOnce = false;
let minElapsed = false;
let pendingResolved: Exclude<Connectivity, "connecting"> | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
let minTimer: ReturnType<typeof setTimeout> | undefined;

/** Connectivity as it stands right now. */
export const connectivity = (): Connectivity => connectivityState;

export function subscribeConnectivity(listener: ConnListener) {
  connListeners.add(listener);
  return () => {
    connListeners.delete(listener);
  };
}

function publish(next: Connectivity) {
  if (next === connectivityState) return;
  connectivityState = next;
  for (const l of connListeners) l(next);
}

/**
 * A definitive answer is only shown once the minimum display time has also
 * elapsed; until then it waits. There is no upper cap — a slow network keeps
 * the connecting cloud on screen for as long as the probe really takes.
 */
function settle(next: Exclude<Connectivity, "connecting">) {
  resolvedOnce = true;
  pendingResolved = next;
  if (minElapsed) publish(next);
}

function startMinTimer() {
  if (minTimer || minElapsed) return;
  minTimer = setTimeout(() => {
    minTimer = undefined;
    minElapsed = true;
    if (pendingResolved) publish(pendingResolved);
  }, MIN_CONNECTING_MS);
}

/**
 * The first probe never races a stopwatch: it waits for the request to give a
 * real answer instead of assuming offline after a second.
 */
async function probeDefinitive(): Promise<boolean> {
  try {
    return await probeCloud();
  } catch {
    return false;
  }
}

/** Run one heartbeat now and publish the result. */
export async function heartbeat(): Promise<Connectivity> {
  const cloud = resolvedOnce
    ? await withTimeout(probeCloud(), CLOUD_TIMEOUT)
    : await probeDefinitive();
  const local = await withTimeout(probeLocal(), LOCAL_TIMEOUT);
  cached = { cloud, local, anyOnline: cloud || local, at: Date.now() };
  for (const l of listeners) l(cached);
  settle(cloud ? "online" : "offline");
  return connectivityState;
}

let monitoring = false;

/**
 * Start the one heartbeat loop for the whole app. Browser online/offline
 * events only nudge it to probe sooner; the probe result decides the state.
 */
export function startConnectivityMonitor(intervalMs = 20_000): () => void {
  if (typeof window === "undefined" || monitoring) return () => {};
  monitoring = true;
  startMinTimer();
  void heartbeat();
  heartbeatTimer = setInterval(() => void heartbeat(), intervalMs);
  const nudge = () => void heartbeat();
  window.addEventListener("online", nudge);
  window.addEventListener("offline", nudge);
  return () => {
    monitoring = false;
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = undefined;
    window.removeEventListener("online", nudge);
    window.removeEventListener("offline", nudge);
  };
}

/** Test seam: back to the pre-startup "connecting" state. */
export function resetConnectivity() {
  connectivityState = "connecting";
  resolvedOnce = false;
  minElapsed = false;
  pendingResolved = null;
  monitoring = false;
  if (minTimer) clearTimeout(minTimer);
  minTimer = undefined;
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = undefined;
}


export { OFFLINE as offlineHealth };