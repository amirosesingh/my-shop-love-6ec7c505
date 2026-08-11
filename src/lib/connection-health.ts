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
import { localDb } from "./local-db";
import { hydrateTerminalConfig } from "./terminal-tokens";

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

export { OFFLINE as offlineHealth };