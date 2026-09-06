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
import { CloudConnectionPanel } from "@/platforms/web/components/pos/settings/panels/CloudConnectionPanel";
import { LocalDatabaseSettings } from "@/platforms/web/components/pos/LocalDatabaseSettings";
import { ConnectionCheck } from "@/platforms/web/components/pos/ConnectionCheck";
import { isOnlineOnly } from "@/lib/live-mode";
import { useSystemStatus } from "@/lib/system-status";
import {
  databaseModeLabel,
  effectiveDatabaseMode,
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
              Every sale, shift and stock change is committed to this terminal's SQL database first.
              The background worker synchronizes pending changes to the central database.
            </p>
          </div>
          <Switch aria-label="Local database mode" disabled checked />
        </div>
      )}

      {!liveOnly && <LocalDatabaseSettings />}

      <ConnectionCheck />
    </div>
  );
}
