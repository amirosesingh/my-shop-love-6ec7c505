import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { usePos } from "@/lib/pos-store";
import { downloadSqlBackup } from "@/lib/backup-sql";
import { drainOutbox } from "@/lib/sync-engine";
import { LocalDatabaseSettings } from "@/components/pos/LocalDatabaseSettings";
import { ConnectionCheck } from "@/components/pos/ConnectionCheck";
import { SyncLogViewer } from "@/components/SyncLogViewer";
import { logSync } from "@/lib/sync-log";
import { localDb } from "@/lib/local-db";
import {
  discardQuarantined,
  isOnline,
  isOnlineSyncEnabled,
  lastSyncedAt,
  listQueue,
  retryQuarantined,
  setOnlineSyncEnabled,
  subscribeOutbox,
} from "@/lib/sync-outbox";

/** Offline-first controls: sync toggle, outbox inspector and SQL backup. */
export function SyncSettings() {
  const { state } = usePos();
  const [, force] = useState(0);
  const bump = () => force((n) => n + 1);
  useEffect(() => {
    const off = subscribeOutbox(bump);
    return () => {
      off();
    };
  }, []);

  const queue = listQueue();
  const quarantined = queue.filter((q) => q.quarantined);
  const last = lastSyncedAt();

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Sales, stock moves and shifts are always written to this terminal first, so the till keeps
        working with no internet. Queued changes are pushed to the cloud automatically as soon as
        the connection returns.
      </p>

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

      <LocalDatabaseSettings />

      <ConnectionCheck />

      <div className="grid gap-2 rounded-md border border-border px-3 py-2 text-sm sm:grid-cols-3">
        <Stat label="Connection" value={isOnline() ? "Online" : "Offline"} />
        <Stat label="Queued changes" value={String(queue.length)} />
        <Stat label="Last synced" value={last ? new Date(last).toLocaleString() : "Never"} />
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

      {quarantined.length > 0 && (
        <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-3">
          <p className="text-sm font-medium text-destructive">
            {quarantined.length} change(s) need attention
          </p>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {quarantined.slice(0, 6).map((q) => (
              <li key={q.id}>
                {q.context} · {q.op.table} — {q.lastError ?? "unknown error"}
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                retryQuarantined();
                bump();
                void drainOutbox();
              }}
            >
              Retry all
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                discardQuarantined();
                bump();
                toast.success("Failed changes discarded");
              }}
            >
              Discard
            </Button>
          </div>
        </div>
      )}
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
