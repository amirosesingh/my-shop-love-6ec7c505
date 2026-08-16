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
  return {
    terminal_id: terminalId(),
    store_id: activeBranchId() ?? null,
    terminal_name: cfg?.locationName ?? activeBranchName() ?? null,
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
    last_seen_at: new Date().toISOString(),
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
  if (error) throw error;
  return (data ?? []) as unknown as TelemetryRow[];
}

/** A till that has not checked in for five minutes is treated as unreachable. */
export const isStale = (row: TelemetryRow): boolean =>
  Date.now() - new Date(row.last_seen_at).getTime() > 5 * 60_000;
