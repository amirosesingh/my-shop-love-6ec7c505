/**
 * The two independent checks the whole start-up flow is built on.
 *
 * `isRegistered()` only reads the sealed local activation record.
 * `isCloudConnected()` only reports whether the connection heartbeat is up.
 * Neither knows anything about the other — that separation is what stops a
 * dropped connection from being reported as "could not verify activation".
 */
import { useEffect, useState } from "react";

import { connectivity, lastHealth, subscribeConnectivity, checkHealth } from "@/core/activation/connection-health";
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

  useEffect(() => subscribeConnectivity(() => setCloudConnected(isCloudConnected())), []);

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
