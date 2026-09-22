/** One online connection status shared by every client surface. */
import { useEffect, useState } from "react";
import {
  connectivity,
  lastHealth,
  subscribeConnectivity,
  type Connectivity,
} from "@/core/activation/connection-health";

export type StatusTone = "connecting" | "ok" | "busy" | "offline" | "error";

export type SystemStatus = {
  connectivity: Connectivity;
  tone: StatusTone;
  label: string;
  detail: string;
  checkedAt: string | null;
  credentialsInvalid: boolean;
  databaseMode: "Central database";
  // Compatibility fields for non-interactive status consumers. Online-only
  // clients never have queued, conflicting, syncing or local database state.
  pending: 0;
  conflicts: 0;
  syncing: false;
  syncEnabled: true;
  lastSyncAt: null;
  lastError: null;
  cloudConfigured: boolean;
  local: {
    connected: false;
    server: null;
    database: null;
    lastReadAt: null;
    lastWriteAt: null;
  };
};

export function describeStatus(input: {
  connectivity: Connectivity;
  credentialsInvalid?: boolean;
}): Pick<SystemStatus, "tone" | "label" | "detail"> {
  if (input.connectivity === "connecting") {
    return { tone: "connecting", label: "Connecting…", detail: "Checking the central database…" };
  }
  if (input.credentialsInvalid) {
    return {
      tone: "error",
      label: "Check credentials",
      detail: "The central database rejected this device's credentials.",
    };
  }
  if (input.connectivity === "offline") {
    return {
      tone: "offline",
      label: "Offline",
      detail: "The central database is unavailable. Work cannot be saved until it reconnects.",
    };
  }
  return {
    tone: "ok",
    label: "Online",
    detail: "Connected directly to the central database.",
  };
}

export function useSystemStatus(): SystemStatus {
  const [, force] = useState(0);
  useEffect(() => subscribeConnectivity(() => force((value) => value + 1)), []);

  const conn = connectivity();
  const health = lastHealth();
  const status = describeStatus({ connectivity: conn });
  return {
    connectivity: conn,
    ...status,
    checkedAt: health?.at ? new Date(health.at).toISOString() : null,
    credentialsInvalid: false,
    databaseMode: "Central database",
    pending: 0,
    conflicts: 0,
    syncing: false,
    syncEnabled: true,
    lastSyncAt: null,
    lastError: null,
    cloudConfigured: conn !== "connecting",
    local: {
      connected: false,
      server: null,
      database: null,
      lastReadAt: null,
      lastWriteAt: null,
    },
  };
}
