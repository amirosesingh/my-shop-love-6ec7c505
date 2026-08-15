/**
 * Data Sync & Audit hub.
 *
 * One screen that answers: what is this till syncing with, how far behind is
 * it, and what happened on the last few cycles. Force push / force pull go
 * through the sync engine's mutex, so nothing can overlap.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CloudDownload,
  CloudUpload,
  Database,
  Loader2,
  RefreshCw,
  RotateCcw,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ThemedSelect } from "@/components/pos/ThemedSelect";
import { useSyncBadge } from "@/components/pos/sync/SyncBadge";
import { usePos } from "@/lib/pos-store";
import { useAuth } from "@/lib/pos-auth";
import { databaseModeLabel } from "@/lib/db-mode";
import { drainOutbox, pullDelta, runExclusive, syncBusy } from "@/lib/sync-engine";
import { lastSuccessfulPull, syncState } from "@/lib/sync-status";
import {
  clearSyncAudit,
  listSyncAudit,
  localEngineInfo,
  subscribeSyncAudit,
  type LocalEngineInfo,
  type SyncAuditRow,
} from "@/lib/sync-audit";
import { discardOp, queueView, retryOp, type QueueView } from "@/lib/sync-outbox";
import {
  dismissConflict,
  listConflicts,
  subscribeConflicts,
  type SyncConflict,
} from "@/lib/sync-conflicts";

const when = (iso?: string | null) => (iso ? new Date(iso).toLocaleString() : "—");

const STATUS_TONE: Record<SyncAuditRow["status"], string> = {
  success: "border-success/40 bg-success/10 text-success",
  failed: "border-destructive/40 bg-destructive/10 text-destructive",
  skipped: "border-border bg-muted text-muted-foreground",
};

export function SyncHub() {
  const { state } = usePos();
  const { isAdmin } = useAuth();
  const badge = useSyncBadge();

  const [rows, setRows] = useState<SyncAuditRow[]>([]);
  const [engine, setEngine] = useState<LocalEngineInfo | null>(null);
  const [queue, setQueue] = useState<QueueView[]>([]);
  const [conflicts, setConflicts] = useState<SyncConflict[]>([]);
  const [busy, setBusy] = useState<"push" | "pull" | "cycle" | null>(null);
  const [progress, setProgress] = useState(0);
  const [direction, setDirection] = useState("all");
  const [status, setStatus] = useState("all");

  const refresh = useCallback(async () => {
    setRows(await listSyncAudit(200));
    setEngine(await localEngineInfo());
    setQueue(queueView());
    setConflicts(listConflicts());
  }, []);

  useEffect(() => {
    void refresh();
    const off = subscribeSyncAudit(() => void refresh());
    const offConflicts = subscribeConflicts(() => setConflicts(listConflicts()));
    const timer = window.setInterval(() => void refresh(), 8000);
    return () => {
      off();
      offConflicts();
      window.clearInterval(timer);
    };
  }, [refresh]);

  /** Runs an action behind a visible progress bar; the engine owns the mutex. */
  const run = async (kind: "push" | "pull" | "cycle", fn: () => Promise<unknown>) => {
    if (busy || syncBusy()) {
      toast.info("A sync cycle is already running.");
      return;
    }
    setBusy(kind);
    setProgress(8);
    const tick = window.setInterval(() => setProgress((p) => (p < 90 ? p + 7 : p)), 300);
    try {
      await fn();
      setProgress(100);
      toast.success(kind === "pull" ? "Pull finished" : kind === "push" ? "Push finished" : "Sync finished");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sync failed");
    } finally {
      window.clearInterval(tick);
      window.setTimeout(() => setProgress(0), 600);
      setBusy(null);
      await refresh();
    }
  };

  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          (direction === "all" || r.direction === direction) &&
          (status === "all" || r.status === status),
      ),
    [rows, direction, status],
  );

  const cloudCounts: Record<string, number> = {
    products: state.products.length,
    members: state.members.length,
    sales: state.sales.length,
    bookings: state.bookings?.length ?? 0,
  };

  const failedQueue = queue.filter((q) => q.state === "refused" || q.reason);
  const engineState = syncState();

  return (
    <div className="space-y-4">
      {/* ------------------------------ engine ------------------------------ */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="size-4" /> Engine
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Status">
            <Badge variant="outline" className="capitalize">
              {badge.label}
            </Badge>
          </Field>
          <Field label="Database mode">{databaseModeLabel()}</Field>
          <Field label="Local engine">{engine?.engine ?? "Browser storage"}</Field>
          <Field label="Last successful pull">{when(lastSuccessfulPull())}</Field>
          <Field label="Last sync">{when(engineState.lastSyncAt)}</Field>
          <Field label="Pending changes">{badge.pending}</Field>
          <Field label="Needs attention">{badge.conflicts}</Field>
          <Field label="Local database file" className="sm:col-span-2 lg:col-span-1">
            <span className="break-all text-xs text-muted-foreground">{engine?.path ?? "—"}</span>
          </Field>
          {engineState.lastError && (
            <p className="sm:col-span-2 lg:col-span-4 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
              {engineState.lastError}
            </p>
          )}
        </CardContent>
      </Card>

      {/* ------------------------------ metrics ----------------------------- */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Records</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[440px] text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="py-1">Entity</th>
                <th className="py-1 text-right">Cloud copy</th>
                <th className="py-1 text-right">Local copy</th>
                <th className="py-1 text-right">Waiting</th>
              </tr>
            </thead>
            <tbody>
              {Object.keys(cloudCounts).map((entity) => (
                <tr key={entity} className="border-t border-border">
                  <td className="py-1.5 capitalize">{entity}</td>
                  <td className="py-1.5 text-right tabular-nums">{cloudCounts[entity]}</td>
                  <td className="py-1.5 text-right tabular-nums">
                    {engine ? (engine.counts[entity] ?? 0) : "—"}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">
                    {engine?.pending.byEntity[entity] ??
                      queue.filter((q) => q.op.table === entity).length}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* ------------------------------ actions ----------------------------- */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Force a sync</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!!busy}
              onClick={() => void run("push", () => drainOutbox())}
            >
              {busy === "push" ? <Loader2 className="size-4 animate-spin" /> : <CloudUpload className="size-4" />}
              Force push
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!!busy}
              onClick={() => void run("pull", () => pullDelta())}
            >
              {busy === "pull" ? <Loader2 className="size-4 animate-spin" /> : <CloudDownload className="size-4" />}
              Force pull
            </Button>
            <Button
              size="sm"
              disabled={!!busy}
              onClick={() => void run("cycle", () => runExclusive("manual"))}
            >
              {busy === "cycle" ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              Full sync cycle
            </Button>
          </div>
          {progress > 0 && <Progress value={progress} className="h-2" />}
          {!badge.online && (
            <p className="text-xs text-muted-foreground">
              This till is offline — sales keep working and queued changes go up as soon as the
              connection returns.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ----------------------------- refusals ----------------------------- */}
      {conflicts.length > 0 && (
        <Card className="border-warning/40">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <TriangleAlert className="size-4 text-warning" /> Records changed elsewhere
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Someone else changed these records while this till was working from an older copy.
              The central version was kept — check it and make the change again if it is still
              needed.
            </p>
            {conflicts.map((c) => (
              <div
                key={c.id}
                className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2 text-xs"
              >
                <span className="font-medium">{c.context}</span>
                <span className="text-muted-foreground">{c.table}</span>
                <span className="font-mono text-muted-foreground">{c.recordId.slice(0, 8)}</span>
                <span className="text-muted-foreground">
                  this till had v{c.baseVersion}, central is on v{c.centralVersion}
                </span>
                <span className="text-muted-foreground">{when(c.at)}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto"
                  onClick={() => dismissConflict(c.id)}
                >
                  Got it
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {failedQueue.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Changes needing attention</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {failedQueue.map((q) => (
              <div
                key={q.id}
                className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2 text-xs"
              >
                <span className="font-medium">{q.context}</span>
                <span className="text-muted-foreground">{q.op.table}</span>
                <span className="text-destructive">{q.reason}</span>
                <div className="ml-auto flex gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      retryOp(q.id);
                      void drainOutbox().then(refresh);
                    }}
                  >
                    <RotateCcw className="size-3.5" /> Retry
                  </Button>
                  {isAdmin && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        discardOp(q.id);
                        void refresh();
                      }}
                    >
                      Discard
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ------------------------------ ledger ------------------------------ */}
      <Card>
        <CardHeader className="flex-row flex-wrap items-center gap-2 space-y-0 pb-2">
          <CardTitle className="mr-auto text-base">Audit ledger</CardTitle>
          <ThemedSelect
            value={direction}
            onChange={(v) => setDirection(v)}
            options={[
              { value: "all", label: "All directions" },
              { value: "push", label: "Push" },
              { value: "pull", label: "Pull" },
              { value: "mirror", label: "Mirror" },
              { value: "system", label: "System" },
            ]}
          />
          <ThemedSelect
            value={status}
            onChange={(v) => setStatus(v)}
            options={[
              { value: "all", label: "All results" },
              { value: "success", label: "Success" },
              { value: "failed", label: "Failed" },
              { value: "skipped", label: "Skipped" },
            ]}
          />
          {isAdmin && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void clearSyncAudit().then(refresh)}
              disabled={!rows.length}
            >
              <Trash2 className="size-3.5" /> Clear
            </Button>
          )}
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {filtered.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nothing logged yet. Run a sync and the operations appear here.
            </p>
          ) : (
            <table className="w-full min-w-[620px] text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-1">When</th>
                  <th className="py-1">Direction</th>
                  <th className="py-1">Entity</th>
                  <th className="py-1 text-right">Records</th>
                  <th className="py-1">Result</th>
                  <th className="py-1">Detail</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-t border-border align-top">
                    <td className="py-1.5 whitespace-nowrap text-xs">{when(r.at)}</td>
                    <td className="py-1.5 capitalize">{r.direction}</td>
                    <td className="py-1.5">{r.entity}</td>
                    <td className="py-1.5 text-right tabular-nums">{r.records}</td>
                    <td className="py-1.5">
                      <Badge variant="outline" className={`text-[10px] ${STATUS_TONE[r.status]}`}>
                        {r.status}
                      </Badge>
                    </td>
                    <td className="py-1.5 text-xs text-muted-foreground">
                      {r.error ? (
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-destructive">{r.error}</span>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 px-2 text-[11px]"
                            disabled={!!busy}
                            onClick={() => void run("cycle", () => runExclusive("retry"))}
                          >
                            <RotateCcw className="size-3" /> Retry
                          </Button>
                        </span>
                      ) : (
                        (r.record_id ?? "—")
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-0.5 text-sm">{children}</div>
    </div>
  );
}
