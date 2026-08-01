import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowDownToLine, ArrowUpFromLine, HardDriveDownload, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { drainOutbox } from "@/lib/sync-engine";
import { lastSyncedAt, subscribeOutbox } from "@/lib/sync-outbox";
import { clearSyncLog, listSyncLog, subscribeSyncLog, type SyncDirection } from "@/lib/sync-log";

const stamp = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "medium" }) : "Never";

const directionIcon = (d: SyncDirection) =>
  d === "push" ? ArrowUpFromLine : d === "pull" ? ArrowDownToLine : HardDriveDownload;

/** Table of every push/pull/backup attempt with a manual "Sync now" control. */
export function SyncLogViewer() {
  const [, force] = useState(0);
  const [busy, setBusy] = useState(false);
  const bump = () => force((n) => n + 1);

  useEffect(() => {
    const offLog = subscribeSyncLog(bump);
    const offBox = subscribeOutbox(bump);
    return () => {
      offLog();
      offBox();
    };
  }, []);

  const entries = listSyncLog();

  const syncNow = async () => {
    setBusy(true);
    try {
      const { pushed, failed } = await drainOutbox();
      if (failed) toast.error(`Sync stopped after ${pushed} change(s) — see the log below`);
      else toast.success(pushed ? `Pushed ${pushed} change(s)` : "Everything is already up to date");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-3">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md border border-border px-3 py-2 sm:flex sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium">Sync &amp; backup log</p>
          <p className="truncate text-xs text-muted-foreground">
            Last successful sync: <span className="numeric">{stamp(lastSyncedAt())}</span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {entries.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => clearSyncLog()}>
              Clear
            </Button>
          )}
          <Button size="sm" disabled={busy} onClick={() => void syncNow()}>
            <RefreshCw className={`size-4 ${busy ? "animate-spin" : ""}`} />
            Sync now
          </Button>
        </div>
      </header>

      <div className="max-h-80 overflow-auto rounded-md border border-border">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-sidebar text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Timestamp</th>
              <th className="px-3 py-2 font-medium">Direction</th>
              <th className="px-3 py-2 font-medium">Table</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Details</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                  No sync activity recorded yet.
                </td>
              </tr>
            )}
            {entries.map((e) => {
              const Icon = directionIcon(e.direction);
              return (
                <tr key={e.id} className="border-t border-border align-top">
                  <td className="numeric whitespace-nowrap px-3 py-2">{stamp(e.at)}</td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 uppercase tracking-wide">
                      <Icon className="size-3" />
                      {e.direction}
                    </span>
                  </td>
                  <td className="px-3 py-2">{e.table}</td>
                  <td className="px-3 py-2">
                    <Badge variant={e.ok ? "secondary" : "destructive"}>
                      {e.ok ? "Success" : "Error"}
                    </Badge>
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