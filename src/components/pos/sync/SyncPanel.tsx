/**
 * THE sync panel — the only place in the app that shows sync detail.
 *
 * One row per table, one progress line ("Syncing table 3 of 7…"), and exactly
 * one button that starts a sync. The button goes through the engine's mutex,
 * so a second click while a pass is running can never start an overlapping
 * cycle and leave two screens disagreeing.
 */
import { useEffect, useState } from "react";
import {
  CheckCircle2,
  CircleDashed,
  History,
  Loader2,
  RefreshCw,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { runExclusive, syncBusy } from "@/lib/sync-engine";
import { subscribeSyncProgress, syncProgress, type TableSyncStatus } from "@/lib/sync-progress";
import { useSystemStatus } from "@/lib/system-status";
import { localDb, type RestoreRun } from "@/lib/local-db";
import { toast } from "sonner";
import { RebuildCheck } from "./RebuildCheck";

const ICON: Record<TableSyncStatus, typeof CheckCircle2> = {
  idle: CircleDashed,
  syncing: Loader2,
  synced: CheckCircle2,
  missing: TriangleAlert,
  failed: XCircle,
};

const TONE: Record<TableSyncStatus, string> = {
  idle: "text-muted-foreground",
  syncing: "text-warning",
  synced: "text-success",
  missing: "text-warning",
  failed: "text-destructive",
};

const WORD: Record<TableSyncStatus, string> = {
  idle: "Waiting",
  syncing: "Syncing",
  synced: "Synced",
  missing: "Missing",
  failed: "Failed",
};

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : "—");

export function SyncPanel({ className }: { className?: string }) {
  const [, force] = useState(0);
  const status = useSystemStatus();

  useEffect(() => {
    const bump = () => force((n) => n + 1);
    const off = subscribeSyncProgress(bump);
    const timer = window.setInterval(bump, 2000);
    return () => {
      off();
      window.clearInterval(timer);
    };
  }, []);

  const run = syncProgress();
  const busy = run.status === "syncing" || syncBusy() || status.syncing;

  return (
    <section className={cn("w-full space-y-3", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">{status.label}</p>
          <p className="text-xs text-muted-foreground">
            {busy && run.total
              ? `Syncing table ${Math.max(run.currentIndex, 1)} of ${run.total}${
                  run.currentTable ? ` — ${run.currentTable}` : ""
                }`
              : `Last synced ${when(run.lastSyncedAt ?? status.lastSyncAt)}`}
          </p>
        </div>
        {/* The single sync trigger for the whole app. */}
        <div className="flex items-center gap-2">
          <RestoreHistoryButton disabled={busy} />
          <Button size="sm" disabled={busy} onClick={() => void runExclusive("manual")}>
            <RefreshCw className={cn("size-4", busy && "animate-spin")} />
            {busy ? "Syncing…" : "Sync now"}
          </Button>
        </div>
      </div>

      <Progress value={busy ? run.progress : run.tables.length ? 100 : 0} className="h-1.5" />

      <RebuildCheck />

      <div className="w-full overflow-x-auto rounded-md border border-border">
        <table className="w-full text-left text-xs">
          <thead className="bg-muted/60 text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Table</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Detail</th>
              <th className="px-3 py-2 font-medium">Last checked</th>
            </tr>
          </thead>
          <tbody>
            {run.tables.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-3 text-muted-foreground">
                  No sync pass has run on this device yet. Press “Sync now” to check every table.
                </td>
              </tr>
            )}
            {run.tables.map((row) => {
              const Icon = ICON[row.status];
              return (
                <tr key={row.table} className="border-t border-border">
                  <td className="px-3 py-2 font-medium">{row.table}</td>
                  <td className="px-3 py-2">
                    <span className={cn("inline-flex items-center gap-1.5", TONE[row.status])}>
                      <Icon
                        className={cn("size-3.5", row.status === "syncing" && "animate-spin")}
                      />
                      {WORD[row.status]}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{row.note || "—"}</td>
                  <td className="numeric px-3 py-2 text-muted-foreground">{when(row.at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {(run.lastError || status.lastError) && (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {run.lastError ?? status.lastError}
        </p>
      )}
    </section>
  );
}

/**
 * Trading history is push-only during normal sync, so a wiped or replaced till
 * starts empty. This is the one place an operator can pull this branch's
 * sales, payments and shift records back down. Rows still waiting to be pushed
 * are never overwritten.
 */
function RestoreHistoryButton({ disabled }: { disabled?: boolean }) {
  const bridge = localDb();
  const [run, setRun] = useState<RestoreRun | null>(null);
  const busy = Boolean(run?.running);

  useEffect(() => {
    if (!busy || !bridge?.restoreStatus) return;
    const timer = window.setInterval(() => {
      void bridge.restoreStatus!()
        .then((next) => setRun(next ?? null))
        .catch(() => {});
    }, 1000);
    return () => window.clearInterval(timer);
  }, [busy, bridge]);

  if (!bridge?.restore) return null;

  const start = async () => {
    const ok = window.confirm(
      "Restore this branch's trading history from the cloud (last 90 days)?\n\n" +
        "Anything this till has not pushed yet is left untouched.",
    );
    if (!ok) return;
    setRun({ running: true, table: null, index: 0, total: 0, restored: 0, skipped: 0 });
    try {
      const res = await bridge.restore!({ days: 90 });
      setRun({ ...res, running: false });
      if (res.ok) {
        toast.success(
          `Restored ${res.restored} rows${res.skipped ? ` — ${res.skipped} kept local` : ""}`,
        );
      } else {
        toast.error(res.error ?? "Restore failed");
      }
    } catch (err) {
      setRun(null);
      toast.error(String((err as Error)?.message ?? err));
    }
  };

  return (
    <div className="flex items-center gap-2">
      {busy && run && (
        <span className="text-xs text-muted-foreground">
          Restoring {run.table ?? ""} ({run.index}/{run.total}) — {run.restored} rows
        </span>
      )}
      <Button size="sm" variant="outline" disabled={disabled || busy} onClick={() => void start()}>
        <History className={cn("size-4", busy && "animate-pulse")} />
        {busy ? "Restoring…" : "Restore history"}
      </Button>
    </div>
  );
}
