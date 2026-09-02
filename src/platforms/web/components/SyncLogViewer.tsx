import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { notifyError } from "@/lib/notify";
import { ArrowDownToLine, ArrowUpFromLine, HardDriveDownload, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { drainOutbox } from "@/lib/sync-engine";
import { isOnline, lastSyncedAt, listQueue, subscribeOutbox } from "@/lib/sync-outbox";
import { electronDb, readBranch } from "@/core/local-db/local-db";
import {
  clearSyncLog,
  listSyncLog,
  subscribeSyncLog,
  type SyncDirection,
  type SyncFailureKind,
} from "@/lib/sync-log";

/** Plain-language name and colour for each kind of failure. */
const FAILURE: Record<SyncFailureKind, { label: string; className: string }> = {
  network: { label: "Connection", className: "border-warning/40 bg-warning/10 text-warning" },
  auth: { label: "Sign-in", className: "border-destructive/40 bg-destructive/10 text-destructive" },
  conflict: { label: "Conflict", className: "border-accent/40 bg-accent/10 text-accent" },
  validation: {
    label: "Data problem",
    className: "border-destructive/40 bg-destructive/10 text-destructive",
  },
  unknown: { label: "Unknown", className: "border-border bg-surface-2 text-muted-foreground" },
};

const stamp = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "medium" }) : "Never";

const directionIcon = (d: SyncDirection) =>
  d === "push" ? ArrowUpFromLine : d === "pull" ? ArrowDownToLine : HardDriveDownload;

/** Table of every push/pull/backup attempt with a manual "Sync now" control. */
export function SyncLogViewer() {
  const [, force] = useState(0);
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const bump = () => force((n) => n + 1);
  const branch = readBranch();

  /** Pending count comes from local SQL Server when the shell is present. */
  const refreshPending = useCallback(async () => {
    const bridge = electronDb();
    if (!bridge) {
      setPending(listQueue().length);
      return;
    }
    try {
      const res = await bridge.getPendingSyncCount();
      setPending(res.ok ? res.total : 0);
    } catch {
      setPending(0);
    }
  }, []);

  useEffect(() => {
    const offLog = subscribeSyncLog(bump);
    const offBox = subscribeOutbox(() => {
      bump();
      void refreshPending();
    });
    const sync = () => {
      setOnline(isOnline());
      void refreshPending();
    };
    sync();
    const timer = window.setInterval(sync, 10_000);
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      offLog();
      offBox();
      window.clearInterval(timer);
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, [refreshPending]);

  const entries = listSyncLog();
  // "It isn't syncing" — this is the answer, grouped by reason.
  const failureCounts = entries.reduce<Partial<Record<SyncFailureKind, number>>>((acc, e) => {
    if (e.ok) return acc;
    const kind = e.kind ?? "unknown";
    acc[kind] = (acc[kind] ?? 0) + 1;
    return acc;
  }, {});
  const failureKinds = Object.entries(failureCounts) as [SyncFailureKind, number][];

  const syncNow = async () => {
    setBusy(true);
    try {
      const { pushed, failed } = await drainOutbox();
      if (failed) toast.error(`Sync stopped after ${pushed} change(s) — see the log below`);
      else toast.success(pushed ? `Pushed ${pushed} change(s)` : "Everything is already up to date");
    } catch (err) {
      notifyError(err, "Branch sync failed");
    } finally {
      void refreshPending();
      setBusy(false);
    }
  };

  return (
    <section className="space-y-3">
      <header className="flex flex-wrap items-center gap-3 rounded-md border border-border px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-sm font-medium">
            <span
              aria-hidden
              className={`size-2.5 rounded-full ${online ? "bg-emerald-500" : "bg-muted-foreground"}`}
            />
            Branch: {branch.branchName || branch.branchId || "Not configured"}
            <span className="text-xs font-normal text-muted-foreground">
              {online ? "Connected to central server" : "Offline mode"}
            </span>
          </p>
          <p className="truncate text-xs text-muted-foreground">
            Last successful sync: <span className="numeric">{stamp(lastSyncedAt())}</span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant={pending ? "destructive" : "secondary"} className="whitespace-nowrap">
            {pending} sale{pending === 1 ? "" : "s"} waiting for cloud sync
          </Badge>
          {entries.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => clearSyncLog()}>
              Clear
            </Button>
          )}
          <Button size="sm" disabled={busy || !online} onClick={() => void syncNow()}>
            <RefreshCw className={`size-4 ${busy ? "animate-spin" : ""}`} />
            Sync branch data now
          </Button>
        </div>
      </header>

      {failureKinds.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border px-3 py-2 text-xs">
          <span className="text-muted-foreground">Recent failures:</span>
          {failureKinds.map(([kind, count]) => (
            <span
              key={kind}
              className={`rounded-full border px-2 py-0.5 ${FAILURE[kind].className}`}
            >
              {FAILURE[kind].label} · {count}
            </span>
          ))}
        </div>
      )}

      {!online && (
        <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          The branch is offline. Sales keep saving to the local database and will push
          automatically once the connection returns.
        </p>
      )}

      <div className="max-h-80 overflow-auto rounded-md border border-border">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-sidebar text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Transaction ID</th>
              <th className="px-3 py-2 font-medium">Timestamp</th>
              <th className="px-3 py-2 font-medium">Direction</th>
              <th className="px-3 py-2 font-medium">Table</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Error message</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                  No sync activity recorded yet.
                </td>
              </tr>
            )}
            {entries.map((e) => {
              const Icon = directionIcon(e.direction);
              return (
                <tr key={e.id} className="border-t border-border align-top">
                  <td className="numeric whitespace-nowrap px-3 py-2 text-muted-foreground">
                    {e.id.slice(0, 8)}
                  </td>
                  <td className="numeric whitespace-nowrap px-3 py-2">{stamp(e.at)}</td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 uppercase tracking-wide">
                      <Icon className="size-3" />
                      {e.direction === "push"
                        ? "PUSH local → central"
                        : e.direction === "pull"
                          ? "PULL central → local"
                          : "BACKUP"}
                    </span>
                  </td>
                  <td className="px-3 py-2">{e.table}</td>
                  <td className="px-3 py-2">
                    <Badge variant={e.ok ? "secondary" : "destructive"}>
                      {e.ok ? "Synced" : "Error"}
                    </Badge>
                    {!e.ok && (
                      <span
                        className={`ml-1 rounded-full border px-2 py-0.5 text-[10px] ${FAILURE[e.kind ?? "unknown"].className}`}
                      >
                        {FAILURE[e.kind ?? "unknown"].label}
                      </span>
                    )}
                  </td>
                  <td className="max-w-[24rem] break-words px-3 py-2 text-muted-foreground">
                    {e.details || (e.ok ? "Completed" : "Unknown error")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}