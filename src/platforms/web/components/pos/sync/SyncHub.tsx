/**
 * Data Sync & Audit hub.
 *
 * One screen that answers: what is this till syncing with, how far behind is
 * it, and what happened on the last few cycles. Force push / force pull go
 * through the sync engine's mutex, so nothing can overlap.
 */
import { isOnlineOnly } from "@/lib/live-mode";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ThemedSelect } from "@/platforms/web/components/pos/ThemedSelect";
import { Link } from "@tanstack/react-router";
import { useSystemStatus } from "@/lib/system-status";
import { usePos } from "@/lib/pos-store";
import { useAuth } from "@/lib/pos-auth";
import { databaseModeLabel } from "@/core/local-db/db-mode";
import { drainOutbox, runExclusive, syncBusy } from "@/lib/sync-engine";
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
import { localDb, type SyncQueueRow } from "@/core/local-db/local-db";
import {
  dismissConflict,
  listConflicts,
  subscribeConflicts,
  type SyncConflict,
} from "@/lib/sync-conflicts";
import {
  listUnappliedStock,
  retryAllUnappliedStock,
  retryUnappliedStock,
  subscribeUnappliedStock,
  reconcileStock,
  type UnappliedMovement,
} from "@/lib/stock-recovery";
import {
  describeDiagnostic,
  listDiagnostics,
  subscribeDiagnostics,
  type DiagnosticEvent,
} from "@/lib/diagnostics";

const when = (iso?: string | null) => (iso ? new Date(iso).toLocaleString() : "—");

const STATUS_TONE: Record<SyncAuditRow["status"], string> = {
  success: "border-success/40 bg-success/10 text-success",
  failed: "border-destructive/40 bg-destructive/10 text-destructive",
  skipped: "border-border bg-muted text-muted-foreground",
};

export function SyncHub() {
  // Web and Android write straight to the central database, so there is no
  // queue, mirror or audit trail of local pushes to show here.
  if (isOnlineOnly()) {
    return (
      <div className="rounded-md border border-border px-3 py-2">
        <p className="text-sm">Live connection only</p>
        <p className="text-xs text-muted-foreground">
          This device saves every sale, shift and stock change straight to the central database,
          so there is nothing waiting to be pushed and no local copy to compare.
        </p>
      </div>
    );
  }
  return <SyncHubDesktop />;
}

function SyncHubDesktop() {
  const { state } = usePos();
  const { isAdmin } = useAuth();
  const system = useSystemStatus();
  const badge = {
    label: system.label,
    pending: system.pending,
    conflicts: system.conflicts,
    online: system.connectivity === "online",
  };

  const [rows, setRows] = useState<SyncAuditRow[]>([]);
  const [engine, setEngine] = useState<LocalEngineInfo | null>(null);
  const [queue, setQueue] = useState<QueueView[]>([]);
  const [localQueue, setLocalQueue] = useState<SyncQueueRow[]>([]);
  const [localStats, setLocalStats] = useState<{ table: string; pending: number; errored: number }[]>([]);
  const [localConnected, setLocalConnected] = useState(false);
  const [conflicts, setConflicts] = useState<SyncConflict[]>([]);
  const [unapplied, setUnapplied] = useState<UnappliedMovement[]>([]);
  const [diagnostics, setDiagnostics] = useState<DiagnosticEvent[]>([]);
  const [retrying, setRetrying] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [busy, setBusy] = useState<"push" | "pull" | "cycle" | null>(null);
  const [progress, setProgress] = useState(0);
  const [direction, setDirection] = useState("all");
  const [status, setStatus] = useState("all");

  const refresh = useCallback(async () => {
    setRows(await listSyncAudit(200));
    setEngine(await localEngineInfo());
    setQueue(queueView());
    // Desktop tills keep their own queue in the branch database; parked rows
    // there belong in the same list as browser-queued ones.
    const bridge = localDb();
    if (bridge?.status) {
      try {
        const st = await bridge.status();
        setLocalConnected(!!st.connected);
        setLocalQueue(
          (st.queue ?? []).filter((r) => r.status === "error" || r.status === "quarantined"),
        );
        setLocalStats(
          (st as { tables?: { table: string; pending: number; errored: number }[] }).tables ?? [],
        );
      } catch {
        setLocalConnected(false);
        setLocalQueue([]);
        setLocalStats([]);
      }
    } else {
      setLocalConnected(false);
      setLocalQueue([]);
      setLocalStats([]);
    }
    setConflicts(listConflicts());
    setUnapplied(listUnappliedStock());
    setDiagnostics(listDiagnostics(50));
  }, []);

  useEffect(() => {
    void refresh();
    const off = subscribeSyncAudit(() => void refresh());
    const offConflicts = subscribeConflicts(() => setConflicts(listConflicts()));
    const offStock = subscribeUnappliedStock(() => setUnapplied(listUnappliedStock()));
    const offDiag = subscribeDiagnostics(() => setDiagnostics(listDiagnostics(50)));
    const timer = window.setInterval(() => void refresh(), 8000);
    return () => {
      off();
      offConflicts();
      offStock();
      offDiag();
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
      toast.success(
        kind === "pull" ? "Pull finished" : kind === "push" ? "Push finished" : "Sync finished",
      );
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
  // Two different stores, named for what they are: the branch SQL Server is the
  // operational database, the file below is only a mirror plus the audit ledger.
  const operational = localDb()
    ? localConnected
      ? "Branch SQL Server — connected"
      : "Branch SQL Server — unavailable"
    : "Browser storage (no local SQL Server)";

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
          <Field label="Operational database">{operational}</Field>
          <Field label="Mirror engine">{engine?.engine ?? "Browser storage"}</Field>
          <Field label="Last successful pull">{when(lastSuccessfulPull())}</Field>
          <Field label="Last sync">{when(engineState.lastSyncAt)}</Field>
          <Field label="Pending changes">{badge.pending}</Field>
          <Field label="Needs attention">{badge.conflicts}</Field>
          <Field label="Offline mirror & audit file" className="sm:col-span-2 lg:col-span-1">
            <span className="break-all text-xs text-muted-foreground">{engine?.path ?? "—"}</span>
            <span className="block text-xs text-muted-foreground">
              Holds the catalogue copy and the sync ledger — not the till&apos;s sales database.
            </span>
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
                    {localStats.find((t) => t.table === entity)?.pending ??
                      queue.filter((q) => q.op.table === entity).length}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* --------------------------- one trigger --------------------------- */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Running a sync</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Sync is started from one place only, so two passes can never overlap. Open the sync page
            for the live table-by-table view and the single “Sync now” button.
          </p>
          <Button asChild size="sm" variant="outline">
            <Link to="/settings/sync">
              <RefreshCw className="size-4" /> Open the sync panel
            </Link>
          </Button>
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
              Someone else changed these records while this till was working from an older copy. The
              central version was kept — check it and make the change again if it is still needed.
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

      {
        <Card className="border-warning/40">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <TriangleAlert className="size-4 text-warning" /> Unapplied stock movements
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={reconciling}
                onClick={async () => {
                  const { activeBranchId } = await import("@/lib/active-branch");
                  const branch = activeBranchId();
                  if (!branch) {
                    toast.error("Pick a branch before reconciling stock");
                    return;
                  }
                  setReconciling(true);
                  try {
                    const report = await reconcileStock(branch);
                    const total =
                      report.notApplied.length +
                      report.amountMismatch.length +
                      report.stockMismatch.length;
                    toast[total ? "warning" : "success"](
                      total
                        ? `${report.notApplied.length} not applied, ${report.amountMismatch.length} amount differences, ${report.stockMismatch.length} stock differences`
                        : "Stock matches the movement ledger",
                    );
                  } catch (e) {
                    toast.error((e as Error)?.message ?? "Could not reconcile stock");
                  } finally {
                    setReconciling(false);
                    await refresh();
                  }
                }}
              >
                {reconciling ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="size-3.5" />
                )}
                Reconcile stock
              </Button>
            </div>
            {unapplied.length > 0 ? (
              <>
                <p className="text-xs text-muted-foreground">
                  These stock changes were recorded on the bill but never reached the central stock
                  figure. Retrying is safe — each movement can only ever be applied once.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={retrying}
                  onClick={async () => {
                    setRetrying(true);
                    const res = await retryAllUnappliedStock({ force: true });
                    setRetrying(false);
                    toast[res.remaining ? "warning" : "success"](
                      `${res.applied} applied, ${res.remaining} still waiting${res.blocked ? `, ${res.blocked} need attention` : ""}`,
                    );
                    await refresh();
                  }}
                >
                  {retrying ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <RotateCcw className="size-3.5" />
                  )}
                  Retry all
                </Button>
                {unapplied.map((m) => (
                  <div
                    key={m.movementId}
                    className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2 text-xs"
                  >
                    <span className="font-mono">{m.productId.slice(0, 8)}</span>
                    <span className="tabular-nums">
                      {m.delta > 0 ? `+${m.delta}` : m.delta}
                    </span>
                    <span className="text-muted-foreground">{m.storeId ?? "—"}</span>
                    <span className="text-destructive">{m.reason}</span>
                    <span className="text-muted-foreground">
                      {m.retryable ? `retryable · attempt ${m.attempts}` : "needs attention"}
                    </span>
                    <span className="text-muted-foreground">{when(m.at)}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="ml-auto"
                      disabled={retrying || !m.retryable}
                      onClick={async () => {
                        const ok = await retryUnappliedStock(m.movementId);
                        toast[ok ? "success" : "error"](
                          ok ? "Stock movement applied" : "Still could not apply it",
                        );
                        await refresh();
                      }}
                    >
                      <RotateCcw className="size-3.5" /> Retry
                    </Button>
                  </div>
                ))}
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                No stock movement is waiting. Recent background checks that could not be completed
                are listed below.
              </p>
            )}
            {diagnostics.slice(0, 10).map((d) => (
              <div key={d.id} className="rounded-md border border-border p-2 text-xs">
                <span className="text-muted-foreground">{when(d.at)} — </span>
                {describeDiagnostic(d)}
              </div>
            ))}
          </CardContent>
        </Card>
      }

      {(failedQueue.length > 0 || localQueue.length > 0) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Changes needing attention</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {localQueue.length > 1 && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-2">
                <p className="text-xs text-muted-foreground">
                  Re-queue all parked rows after updating the app or repairing the database. Original
                  row and transaction IDs are preserved.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={retrying}
                  onClick={async () => {
                    setRetrying(true);
                    try {
                      const res = await localDb()?.retryErrored();
                      if (res && !res.ok) throw new Error("The parked rows could not be re-queued.");
                      toast.success("All parked rows were re-queued safely");
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : "Retry failed");
                    } finally {
                      setRetrying(false);
                      await refresh();
                    }
                  }}
                >
                  {retrying ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <RotateCcw className="size-3.5" />
                  )}
                  Retry all parked rows
                </Button>
              </div>
            )}
            {localQueue.map((r) => (
              <div
                key={`local-${r.table}-${r.id}`}
                className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2 text-xs"
              >
                <span className="font-medium">This till</span>
                <span className="text-muted-foreground">{r.table}</span>
                <span className="text-destructive">{r.error ?? r.status}</span>
                <div className="ml-auto flex gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      await localDb()?.retryRow?.(r.table, r.id);
                      await refresh();
                    }}
                  >
                    <RotateCcw className="size-3.5" /> Retry
                  </Button>
                  {isAdmin && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        const res = await localDb()?.discardRow?.(r.table, r.id);
                        if (res && !res.ok) toast.error(res.error ?? "Could not discard");
                        await refresh();
                      }}
                    >
                      Discard
                    </Button>
                  )}
                </div>
              </div>
            ))}
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
