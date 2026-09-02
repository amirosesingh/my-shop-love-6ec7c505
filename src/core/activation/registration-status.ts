/**
 * The two independent checks the whole start-up flow is built on.
 *
 * `isRegistered()` only reads the sealed local activation record.
 * `isCloudConnected()` only reports whether the connection heartbeat is up.
 * Neither knows anything about the other — that separation is what stops a
 * dropped connection from being reported as "could not verify activation".
 */
import { useEffect, useState } from "react";

import {
  connectivity,
  lastHealth,
  subscribeConnectivity,
  checkHealth,
  cloudVerdict,
  type CloudVerdict,
} from "@/core/activation/connection-health";
import { cloudKeyStatus, subscribeCloudKeys } from "@/lib/secure-cloud-config";
import {
  graceValid,
  isRegistered,
  readActivationRecord,
  type ActivationRecord,
  type RegistrationState,
} from "@/core/activation/activation-record";

export type { RegistrationState };

/** Live connection verdict from the shared heartbeat. No activation logic. */
export function isCloudConnected(): boolean {
  if (connectivity() === "online") return true;
  return Boolean(lastHealth()?.cloud);
}

/** Force a fresh probe (used by "Re-check connection"). */
export async function checkCloudConnected(): Promise<boolean> {
  try {
    const report = await checkHealth(true);
    return Boolean(report.cloud) || connectivity() === "online";
  } catch {
    return false;
  }
}

export type StartupGate = {
  registration: RegistrationState | null;
  cloudConnected: boolean;
  /** why the central database is or is not usable right now */
  verdict: CloudVerdict;
  /** central database URL + key are saved on this device */
  cloudConfigured: boolean | null;
  record: ActivationRecord | null;
  /** true while the first read of the sealed record is in flight */
  loading: boolean;
  /** registered, offline, but still inside the grace window */
  offlineGrace: boolean;
  refresh: () => void;
};

/**
 * Registration + connectivity as one reactive view. The two values are
 * computed independently and never folded into a single boolean.
 */
export function useStartupGate(): StartupGate {
  const [registration, setRegistration] = useState<RegistrationState | null>(null);
  const [record, setRecord] = useState<ActivationRecord | null>(null);
  const [cloudConnected, setCloudConnected] = useState(() => isCloudConnected());
  const [verdict, setVerdict] = useState<CloudVerdict>(() => cloudVerdict());
  const [cloudConfigured, setCloudConfigured] = useState<boolean | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [state, rec] = await Promise.all([isRegistered(), readActivationRecord()]);
      if (cancelled) return;
      setRegistration(state);
      setRecord(rec);
    })();
    return () => {
      cancelled = true;
    };
  }, [tick]);

  useEffect(
    () =>
      subscribeConnectivity(() => {
        setCloudConnected(isCloudConnected());
        setVerdict(cloudVerdict());
      }),
    [],
  );

  useEffect(() => {
    const read = () =>
      void cloudKeyStatus()
        .then((s) => setCloudConfigured(Boolean(s.configured)))
        .catch(() => setCloudConfigured(false));
    read();
    return subscribeCloudKeys(read);
  }, [tick]);

  return {
    registration,
    cloudConnected,
    verdict,
    cloudConfigured,
    record,
    loading: registration === null,
    offlineGrace: registration === "registered" && !cloudConnected && graceValid(record),
    refresh: () => setTick((v) => v + 1),
  };
}

/** The four Emergency Access branches, derived from the two checks. */
export type EmergencyMode =
  | "online-verified"
  | "offline-grace"
  | "online-unregistered"
  | "offline-unregistered";

export function emergencyMode(gate: {
  registration: RegistrationState | null;
  cloudConnected: boolean;
}): EmergencyMode {
  const registered = gate.registration === "registered";
  if (registered && gate.cloudConnected) return "online-verified";
  if (registered) return "offline-grace";
  return gate.cloudConnected ? "online-unregistered" : "offline-unregistered";
}


/* ------------------------------------------------------------------ */
/* Start-up decision                                                    */
/* ------------------------------------------------------------------ */

export type StartupDecision =
  /** ask for the central database URL + key */
  | "connect-database"
  /** connection proven, this terminal is not registered yet */
  | "activate"
  /** registered, but no usable connection and no offline entitlement */
  | "offline-blocked"
  /** sign-in and trading may proceed */
  | "ready";

/**
 * The one rule the whole start-up flow follows.
 *
 * A saved activation record alone is never enough to reach the login screen:
 * either the connection is *proven* (`verified`), or this platform is allowed
 * to trade offline and the terminal is inside its grace window.
 */
export function startupDecision(input: {
  registration: RegistrationState | null;
  verdict: CloudVerdict;
  /** the terminal has a usable activation/config on this device */
  activated: boolean;
  /** the record's offline grace window is still open */
  graceOpen: boolean;
  /** this platform may trade with no connection (Windows till) */
  offlineCapable: boolean;
}): StartupDecision {
  const { registration, verdict, activated, graceOpen, offlineCapable } = input;
  // A missing or refused key is a configuration fault — always repairable.
  if (verdict === "unconfigured" || verdict === "rejected") return "connect-database";
  if (verdict === "verified") return activated ? "ready" : "activate";
  // Unreachable from here on.
  if (offlineCapable && activated && registration === "registered" && graceOpen) return "ready";
  if (activated) return "offline-blocked";
  return "connect-database";
}
