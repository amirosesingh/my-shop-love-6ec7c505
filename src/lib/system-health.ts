/**
 * Live health of the services the till depends on: the central database, the
 * realtime listener, the public member / redeem subdomains and the outbound
 * sync queue. Everything here is diagnostic — nothing blocks checkout.
 */
import { supabaseExternal } from "@/integrations/supabase/external-client";
import { pendingCount, retryQuarantined } from "@/lib/sync-outbox";

export type ServiceId = "database" | "realtime" | "sync" | (string & {});
export type ServiceState = "ok" | "degraded" | "down" | "checking";

export type ServiceCheck = {
  id: ServiceId;
  label: string;
  state: ServiceState;
  detail: string;
  /** round trip in ms, when the check measured one */
  latency?: number;
  at: string;
  /** for public domain checks: the URL that was tested */
  url?: string;
};

export type HealthError = {
  id: string;
  at: string;
  service: ServiceId;
  code: string;
  detail: string;
};

const ERR_KEY = "pos.health.errors";
const MAX_ERRORS = 100;

export function listHealthErrors(): HealthError[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(ERR_KEY) ?? "[]") as HealthError[];
  } catch {
    return [];
  }
}

export function clearHealthErrors() {
  if (typeof window !== "undefined") window.localStorage.removeItem(ERR_KEY);
}

function recordError(service: ServiceId, code: string, detail: string) {
  if (typeof window === "undefined") return;
  const entry: HealthError = {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    service,
    code,
    detail,
  };
  try {
    window.localStorage.setItem(
      ERR_KEY,
      JSON.stringify([entry, ...listHealthErrors()].slice(0, MAX_ERRORS)),
    );
  } catch {
    /* diagnostic only */
  }
}

const now = () => new Date().toISOString();

/** Can we read from the central database with the configured key? */
export async function checkDatabase(): Promise<ServiceCheck> {
  const started = Date.now();
  try {
    const { error } = await supabaseExternal
      .from("pos_settings")
      .select("id")
      .limit(1);
    if (error) throw error;
    return {
      id: "database",
      label: "Central POS database",
      state: "ok",
      detail: "Members, bills and catalogue reachable.",
      latency: Date.now() - started,
      at: now(),
    };
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    recordError("database", "DB_UNREACHABLE", detail);
    return {
      id: "database",
      label: "Central POS database",
      state: "down",
      detail,
      latency: Date.now() - started,
      at: now(),
    };
  }
}

/** Open a throwaway realtime channel to prove the websocket is alive. */
export function checkRealtime(timeoutMs = 6000): Promise<ServiceCheck> {
  return new Promise((resolve) => {
    const started = Date.now();
    const finish = (state: ServiceState, detail: string) => {
      window.clearTimeout(timer);
      try {
        void supabaseExternal.removeChannel(channel);
      } catch {
        /* already gone */
      }
      if (state !== "ok") recordError("realtime", "WS_NOT_CONNECTED", detail);
      resolve({
        id: "realtime",
        label: "Realtime listener",
        state,
        detail,
        latency: Date.now() - started,
        at: now(),
      });
    };
    const channel = supabaseExternal.channel(`health-${crypto.randomUUID()}`);
    const timer = window.setTimeout(
      () => finish("degraded", "Websocket did not connect in time — updates may lag."),
      timeoutMs,
    );
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") finish("ok", "Instant voucher and stock updates live.");
      else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT")
        finish("down", `Websocket status ${status}.`);
    });
  });
}

/** Are the public member / redeem subdomains serving? */
export async function checkSubdomains(domains: string[]): Promise<ServiceCheck> {
  const started = Date.now();
  const results = await Promise.all(
    domains.map(async (d) => {
      try {
        await fetch(d, { mode: "no-cors", cache: "no-store" });
        return true;
      } catch {
        return false;
      }
    }),
  );
  const okCount = results.filter(Boolean).length;
  const state: ServiceState =
    okCount === results.length ? "ok" : okCount > 0 ? "degraded" : "down";
  const detail =
    state === "ok"
      ? "Member signup and voucher redemption pages responding."
      : `${results.length - okCount} of ${results.length} public domains did not respond.`;
  if (state !== "ok") recordError("subdomains", "DOMAIN_UNREACHABLE", detail);
  return {
    id: "subdomains",
    label: "Public subdomains",
    state,
    detail,
    latency: Date.now() - started,
    at: now(),
  };
}

/** Anything still waiting to be pushed up from this terminal? */
export function checkSync(): ServiceCheck {
  const pending = pendingCount();
  const online = typeof navigator === "undefined" ? true : navigator.onLine;
  return {
    id: "sync",
    label: "POS sync queue",
    state: !online ? "degraded" : pending > 0 ? "degraded" : "ok",
    detail: !online
      ? "Offline — sales are queued locally and will upload on reconnect."
      : pending > 0
        ? `${pending} change${pending === 1 ? "" : "s"} waiting to upload.`
        : "Everything on this till has been uploaded.",
    at: now(),
  };
}

/** Worst state across every service, used for the top-bar pill. */
export { retryQuarantined };

export function overallState(checks: ServiceCheck[]): ServiceState {
  if (!checks.length) return "checking";
  if (checks.some((c) => c.state === "down")) return "down";
  if (checks.some((c) => c.state === "degraded" || c.state === "checking")) return "degraded";
  return "ok";
}

export const STATE_LABEL: Record<ServiceState, string> = {
  ok: "Connected",
  degraded: "Degraded / offline mode",
  down: "Disconnected",
  checking: "Checking…",
};

export async function runDiagnostics(domains: string[]): Promise<ServiceCheck[]> {
  const [database, realtime, subdomains] = await Promise.all([
    checkDatabase(),
    checkRealtime(),
    checkSubdomains(domains),
  ]);
  return [database, realtime, subdomains, checkSync()];
}
