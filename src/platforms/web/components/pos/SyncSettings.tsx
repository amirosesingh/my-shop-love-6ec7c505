import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { usePos } from "@/lib/pos-store";
import { downloadSqlBackup } from "@/core/local-db/backup-sql";
import { drainOutbox } from "@/lib/sync-engine";
import { SyncBehaviourSettings } from "@/platforms/web/components/pos/SyncBehaviourSettings";
import { SyncLogViewer } from "@/platforms/web/components/SyncLogViewer";
import { logSync } from "@/lib/sync-log";
import { describeError, showNotification } from "@/lib/notify";
import { localDb } from "@/core/local-db/local-db";
import { databaseModeLabel, effectiveDatabaseMode, subscribeDatabaseMode } from "@/core/local-db/db-mode";
import {
  discardQuarantined,
  discardOp,
  isOnlineSyncEnabled,
  lastSyncedAt,
  listQueue,
  queueView,
  retryOp,
  retryQuarantined,
  setOnlineSyncEnabled,
  subscribeOutbox,
} from "@/lib/sync-outbox";
import type { QueueView } from "@/lib/sync-outbox";
import { isOnlineOnly } from "@/lib/live-mode";
import { isCloudConnected } from "@/core/activation/registration-status";
import { subscribeConnectivity } from "@/core/activation/connection-health";

/** Offline-first controls: sync toggle, outbox inspector and SQL backup. */
export function SyncSettings() {
  const { state } = usePos();
  const [, force] = useState(0);
  const bump = () => force((n) => n + 1);
  useEffect(() => {
    const off = subscribeOutbox(bump);
    const offMode = subscribeDatabaseMode(bump);
    const offNet = subscribeConnectivity(bump);
    return () => {
      off();
      offMode();
      offNet();
    };
  }, []);

  const queue = listQueue();
  const quarantined = queue.filter((q) => q.quarantined);
  const last = lastSyncedAt();

  // Web and Android have no local database engine behind them: there is
  // nothing to queue, mirror or back up, so the offline controls are hidden
  // rather than shown permanently empty.
  if (isOnlineOnly()) {
    return (
      <div className="space-y-3">
        <div className="rounded-md border border-border px-3 py-2">
          <p className="text-sm">Live connection only</p>
          <p className="text-xs text-muted-foreground">
            This device works directly with the central database. Every sale, shift and stock change
            is saved centrally as it happens — nothing is stored on the device and there is no queue
            to push. If the connection drops, the app pauses until it is back.
          </p>
        </div>
        <div className="grid gap-2 rounded-md border border-border px-3 py-2 text-sm sm:grid-cols-2">
          <Stat label="Connection" value={isCloudConnected() ? "Live" : "No connection"} />
          <Stat label="Writing to" value="Central database" />
        </div>
        <SyncBehaviourSettings />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Sales, stock moves and shifts are always written to this terminal first, so the till keeps
        working with no internet. Queued changes are pushed to the cloud automatically as soon as
        the connection returns.
      </p>

      <SyncBehaviourSettings />

      <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
        <div>
          <p className="text-sm">Online sync</p>
          <p className="text-xs text-muted-foreground">
            Turn off to work purely local (e.g. during a network outage or a migration).
          </p>
        </div>
        <Switch
          aria-label="Online sync"
          checked={isOnlineSyncEnabled()}
          onCheckedChange={(v) => {
            setOnlineSyncEnabled(v);
            bump();
            // The desktop worker owns pushing when the shell is present.
            void localDb()?.setSyncEnabled(v);
            if (v) void drainOutbox();
          }}
        />
      </div>

      <div className="grid gap-2 rounded-md border border-border px-3 py-2 text-sm sm:grid-cols-3">
        <Stat label="Connection" value={isCloudConnected() ? "Online" : "Offline"} />
        <Stat label="Queued changes" value={String(queue.length)} />
        <Stat label="Last synced" value={last ? new Date(last).toLocaleString() : "Never"} />
      </div>

      <div className="grid gap-2 rounded-md border border-border px-3 py-2 text-sm sm:grid-cols-2">
        <Stat label="Database mode" value={databaseModeLabel()} />
        <Stat
          label="Writing to"
          value={effectiveDatabaseMode() === "local" ? "This terminal" : "Central database"}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            downloadSqlBackup(state);
            logSync("backup", "all tables", true, "SQL backup downloaded");
            toast.success("SQL backup downloaded");
          }}
        >
          Download SQL backup
        </Button>
      </div>

      <SyncLogViewer />

      <Housekeeping />

    </div>
  );
}

/**
 * Desktop-only storage tidy-up. Only rows the central database has already
 * confirmed are ever removed, so nothing unsent can be lost here.
 */
function Housekeeping() {
  const [days, setDays] = useState(90);
  const [busy, setBusy] = useState(false);
  const bridge = localDb();
  if (!bridge?.housekeep) return null;

  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <div>
        <p className="text-sm">Storage housekeeping</p>
        <p className="text-xs text-muted-foreground">
          Removes bills, stock moves and logs older than the window below — but only once the
          central database has confirmed them. Anything still waiting to send is always kept.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-muted-foreground">
          Keep confirmed records for
          <input
            type="number"
            min={7}
            max={3650}
            value={days}
            onChange={(e) => setDays(Number(e.target.value) || 90)}
            className="numeric ml-2 w-24 rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground"
          />
          <span className="ml-2">days</span>
        </label>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const res = await bridge.housekeep?.({ retentionDays: days });
              if (!res?.ok) throw new Error(res?.error ?? "Cleanup could not finish");
              toast.success(
                `Cleanup done — ${res.rows ?? 0} record(s) and ${res.files ?? 0} leftover file(s) removed`,
              );
            } catch (error) {
              showNotification(describeError(error, "Storage cleanup"), "error");
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Cleaning…" : "Run cleanup now"}
        </Button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="numeric text-sm">{value}</p>
    </div>
  );
}

