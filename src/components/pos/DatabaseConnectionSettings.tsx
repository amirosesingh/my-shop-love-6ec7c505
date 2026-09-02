/**
 * Database connection — and nothing else.
 *
 * Everything about *where* this till reads and writes: the central (cloud)
 * project, the Microsoft SQL Server on this machine, which of the two is in
 * use, and the connection tests. Sync behaviour, queues and logs live on the
 * sync page; the two never share a screen again.
 */
import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { CloudConnectionPanel } from "@/components/pos/settings/panels/CloudConnectionPanel";
import { LocalDatabaseSettings } from "@/components/pos/LocalDatabaseSettings";
import { ConnectionCheck } from "@/components/pos/ConnectionCheck";
import { heartbeat } from "@/core/activation/connection-health";
import { isOnlineOnly } from "@/lib/live-mode";
import { useSystemStatus } from "@/lib/system-status";
import {
  databaseModeLabel,
  databaseModeLocked,
  effectiveDatabaseMode,
  preferredDatabaseMode,
  setPreferredDatabaseMode,
  subscribeDatabaseMode,
} from "@/core/local-db/db-mode";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="numeric text-sm">{value}</p>
    </div>
  );
}

export function DatabaseConnectionSettings() {
  const [, force] = useState(0);
  const status = useSystemStatus();

  useEffect(() => subscribeDatabaseMode(() => force((n) => n + 1)), []);

  const locked = databaseModeLocked();
  const localMode = preferredDatabaseMode() === "local";
  const liveOnly = isOnlineOnly();

  return (
    <div className="w-full space-y-3">
      <div className="grid gap-2 rounded-md border border-border px-3 py-2 text-sm sm:grid-cols-3">
        <Stat label="Central database" value={status.connectivity === "online" ? "Reachable" : status.label} />
        <Stat label="Database mode" value={databaseModeLabel()} />
        <Stat
          label="Writing to"
          value={effectiveDatabaseMode() === "local" ? "This terminal" : "Central database"}
        />
      </div>

      <CloudConnectionPanel />

      {!liveOnly && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
          <div>
            <p className="text-sm">Local database mode</p>
            <p className="text-xs text-muted-foreground">
              {locked
                ? "This device is a live client: everything is read from and written to the central database."
                : "On: every sale, shift and stock change is stored on this machine first. Off: changes go straight to the central database, and this terminal switches to local automatically if the connection drops."}
            </p>
          </div>
          <Switch
            aria-label="Local database mode"
            disabled={locked}
            checked={locked ? false : localMode}
            onCheckedChange={(v) => {
              setPreferredDatabaseMode(v ? "local" : "online");
              force((n) => n + 1);
              // Only re-check the connection: the sync panel owns transfers.
              void heartbeat();
            }}
          />
        </div>
      )}

      {!liveOnly && <LocalDatabaseSettings />}

      <ConnectionCheck />
    </div>
  );
}
