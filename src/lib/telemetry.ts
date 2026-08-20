/**
 * Live health of every till, for the read-only branch monitoring centre.
 *
 * Each terminal publishes one row describing itself: where it is, who is
 * signed in, whether it is reaching the central database, how many changes
 * are still waiting to go up, and when the last successful sync happened.
 * Nothing on this screen can change a terminal's settings — it only reports.
 */
import { supabaseExternal as supabase } from "@/integrations/supabase/external-client";
import { terminalId } from "./activity-journal";
import { activeBranchId, activeBranchName } from "./active-branch";
import { isMissingSchema } from "./schema-guard";
import { databaseModeLabel, effectiveDatabaseMode, isFailingOver } from "./db-mode";
import { hasLocalSqlEngine } from "./local-db";
import { isLiveOnly } from "./live-mode";
import { conflictCount, isOnline, lastSyncedAt, pendingCount } from "./sync-outbox";
import { readTerminalConfig } from "./terminal-tokens";
import { APP_VERSION } from "@/version";

export type TelemetryRow = {
  terminal_id: string;
  store_id: string | null;
  terminal_name: string | null;
  /** human name the operator gave this machine when it was activated */
  device_name?: string | null;
  /** pc / mobile — how the device presents itself */
  device_type?: string | null;
  /** branch or warehouse this device is bound to */
  location_name?: string | null;
  session_status?: string | null;
  last_heartbeat_at?: string | null;
  staff_name: string | null;
  staff_role: string | null;
  db_mode: string;
  connection_status: string;
  storage_engine: string;
  pending_count: number;
  conflict_count: number;
  last_synced_at: string | null;
  app_version: string | null;
  platform: string | null;
  last_seen_at: string;
};

/** Which store keeps this terminal's offline copy of the data. */
export function storageEngine(): string {
  if (typeof window === "undefined") return "cloud";
  if (hasLocalSqlEngine()) return "sqlite";
  if (isLiveOnly()) return "live";
  return "indexeddb";
}

/** Plain-language connection state used by the monitoring centre. */
export function connectionStatus(): "online" | "offline" | "local" {
  if (!isOnline()) return "offline";
  if (isFailingOver() || effectiveDatabaseMode() === "local") return "local";
  return "online";
}

export const CONNECTION_LABEL: Record<string, string> = {
  online: "Online",
  offline: "Offline",
  local: "Local storage active",
};

export const ENGINE_LABEL: Record<string, string> = {
  sqlite: "Local SQLite",
  indexeddb: "Browser storage",
  live: "Live only (no local copy)",
  cloud: "Cloud only",
};

/** Snapshot of this terminal right now. */
export function snapshot(staff?: { name?: string | null; role?: string | null }): TelemetryRow {
  const cfg = typeof window === "undefined" ? null : readTerminalConfig();
  const now = new Date().toISOString();
  return {
    terminal_id: terminalId(),
    store_id: activeBranchId() ?? null,
    terminal_name: cfg?.deviceName ?? cfg?.locationName ?? activeBranchName() ?? null,
    device_name: cfg?.deviceName ?? null,
    device_type: cfg?.deviceType ?? (isMobilePlatform() ? "mobile" : "pc"),
    location_name: cfg?.locationName ?? activeBranchName() ?? null,
    session_status: staff?.name ? "signed_in" : "idle",
    last_heartbeat_at: now,
    staff_name: staff?.name ?? null,
    staff_role: staff?.role ?? null,
    db_mode: databaseModeLabel(),
    connection_status: connectionStatus(),
    storage_engine: storageEngine(),
    pending_count: pendingCount(),
    conflict_count: conflictCount(),
    last_synced_at: lastSyncedAt(),
    app_version: APP_VERSION,
    platform: typeof navigator === "undefined" ? null : navigator.platform || null,
    last_seen_at: now,
  };
}

/** Send this terminal's status up. Failures are silent — it is only telemetry. */
export async function publishTelemetry(staff?: { name?: string | null; role?: string | null }) {
  if (typeof window === "undefined") return;
  if (!isOnline()) return;
  try {
    await supabase.from("branch_telemetry").upsert(snapshot(staff) as never, {
      onConflict: "terminal_id",
    });
  } catch {
    /* telemetry never interrupts trading */
  }
}

/** Every terminal's latest status, newest heartbeat first. */
export async function listTelemetry(): Promise<TelemetryRow[]> {
  const { data, error } = await supabase
    .from("branch_telemetry")
    .select("*")
    .order("last_seen_at", { ascending: false });
  if (error) {
    // A database that has not had the repair script applied yet shows an
    // empty telemetry board rather than taking the settings screen down.
    if (isMissingSchema(error)) return [];
    throw error;
  }
  return (data ?? []) as unknown as TelemetryRow[];
}

/** How this machine presents itself, used when the activation predates naming. */
function isMobilePlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/** Name shown to people; falls back through the identifiers we do have. */
export const deviceLabel = (row: TelemetryRow): string =>
  row.device_name?.trim() || row.terminal_name?.trim() || row.terminal_id.slice(0, 8);

export type Health = "online" | "stale" | "offline" | "unknown";

export const HEALTH_LABEL: Record<Health, string> = {
  online: "Online",
  stale: "Stale",
  offline: "Offline",
  unknown: "Unknown",
};

/**
 * Live health from the heartbeat itself, never from the status a till last
 * managed to write: an old row is Stale, then Offline, and a till that has
 * never reported is Unknown.
 */
export function health(row: TelemetryRow, now = Date.now()): Health {
  const beat = row.last_heartbeat_at ?? row.last_seen_at;
  const at = beat ? new Date(beat).getTime() : NaN;
  if (!beat || Number.isNaN(at)) return "unknown";
  const age = now - at;
  if (age > 15 * 60_000) return "offline";
  if (age > 2 * 60_000) return "stale";
  return row.connection_status === "offline" ? "offline" : "online";
}

/** A till that has not checked in for five minutes is treated as unreachable. */
export const isStale = (row: TelemetryRow, now = Date.now()): boolean =>
  health(row, now) !== "online";
