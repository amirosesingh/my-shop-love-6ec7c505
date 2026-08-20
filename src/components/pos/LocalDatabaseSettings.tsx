import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  deriveLocalDbState,
  defaultLocalDbConfig,
  hasLocalDb,
  localDb,
  loadLocalDbConfig,
  type LocalDbConfig,
  type LocalSyncStatus,
} from "@/lib/local-db";
import { SqlConnectionModal } from "@/components/database/SqlConnectionModal";
import { SchemaPanel } from "@/components/database/SchemaPanel";

/**
 * Local Microsoft SQL Server controls. Only meaningful inside the Windows
 * desktop shell — in a browser there is no local server to talk to.
 */
export function LocalDatabaseSettings() {
  const available = hasLocalDb();
  const [config, setConfig] = useState<LocalDbConfig>(defaultLocalDbConfig);
  const [status, setStatus] = useState<LocalSyncStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [configured, setConfigured] = useState(false);

  useEffect(() => {
    void loadLocalDbConfig().then((saved) => {
      setConfig(saved);
      setConfigured(!!saved.server && !!saved.database);
    });
  }, []);

  const refresh = useCallback(async () => {
    const bridge = localDb();
    if (!bridge) return;
    setStatus(await bridge.status());
  }, []);

  useEffect(() => {
    const bridge = localDb();
    if (!bridge) return;
    void refresh();
    return bridge.onStatus(setStatus);
  }, [refresh]);

  if (!available) {
    return (
      <div className="rounded-md border border-border px-3 py-2">
        <p className="text-sm">Local database</p>
        <p className="text-xs text-muted-foreground">
          A local Microsoft SQL Server is only used by the Windows desktop app. In the browser this
          terminal queues changes on the device instead, which works the same way offline.
        </p>
      </div>
    );
  }

  const run = async (label: string, fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(true);
    try {
      const res = await fn();
      if (res.ok) toast.success(label);
      else toast.error(res.error ?? `${label} failed`);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const retryRow = async (table: string, id: string) => {
    const bridge = localDb();
    if (!bridge?.retryRow) return;
    const res = await bridge.retryRow(table, id);
    if (!res.ok) toast.error(res.error ?? "Retry failed");
    await refresh();
  };

  const totals = (status?.tables ?? []).reduce(
    (acc, t) => ({
      pending: acc.pending + t.pending,
      synced: acc.synced + t.synced,
      errored: acc.errored + t.errored,
    }),
    { pending: 0, synced: 0, errored: 0 },
  );

  const view = deriveLocalDbState({
    available,
    configured,
    status,
    pending: busy ? "saving" : null,
  });
  const tone =
    view.state === "connected"
      ? "bg-emerald-500"
      : view.state === "failed" || view.state === "unavailable"
        ? "bg-destructive"
        : view.busy
          ? "bg-amber-500 animate-pulse"
          : "bg-muted-foreground";

  return (
    <div className="space-y-3 rounded-md border border-border px-3 py-3">
      <div>
        <p className="text-sm">Local database</p>
        <p className="text-xs text-muted-foreground">
          Sales use the online database first and automatically fall back here. Connection details
          stay encrypted on this machine.
        </p>
      </div>

      {/* -------------------------- status -------------------------- */}
      <div className="flex items-start justify-between gap-3 rounded-md border border-border px-3 py-2">
        <div className="flex items-start gap-2">
          <span className={`mt-1.5 size-2 shrink-0 rounded-full ${tone}`} />
          <div>
            <p className="text-sm">{view.message}</p>
            {view.detail && <p className="text-xs text-muted-foreground">{view.detail}</p>}
          </div>
        </div>
        <Button size="sm" disabled={view.busy} onClick={() => setWizardOpen(true)}>
          {view.state === "connected" ? "Change connection" : "Set up connection"}
        </Button>
      </div>
      <SqlConnectionModal
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        onConnected={(next) => {
          setConfig(next);
          setConfigured(!!next.server && !!next.database);
          void refresh();
        }}
      />

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => run("Catalogue pulled", () => localDb()!.pull())}
        >
          Pull catalogue now
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => run("Backup written", () => localDb()!.backup())}
        >
          Back up branch database
        </Button>
        {totals.errored > 0 && (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => run("Queued for retry", () => localDb()!.retryErrored())}
          >
            Retry failed rows
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        The backup writes a full copy of this branch&apos;s SQL Server database to a file you
        choose.
      </p>

      {/* -------------------------- details -------------------------- */}
      <div className="rounded-md border border-border px-3 py-2">
        <button
          type="button"
          className="text-xs text-muted-foreground underline-offset-2 hover:underline"
          onClick={() => setShowDetails((s) => !s)}
        >
          {showDetails ? "Hide technical details" : "Show technical details"}
        </button>
        {showDetails && (
          <div className="mt-2 space-y-2 text-xs">
            <p>
              <span className="text-muted-foreground">Server</span> {config.server || "not set"}
              {" · "}
              <span className="text-muted-foreground">Database</span>{" "}
              {config.database || "not set"}
            </p>
            <p className="text-muted-foreground">
              {config.auth === "windows"
                ? "Signs in with this Windows account."
                : `SQL Server login${config.user ? ` (${config.user})` : ""}`}
            </p>
            <SchemaPanel />
          </div>
        )}
      </div>

      <div className="grid gap-2 text-sm sm:grid-cols-3">
        <Stat label="Waiting to sync" value={String(totals.pending)} />
        <Stat label="Synced" value={String(totals.synced)} />
        <Stat label="Failed" value={String(totals.errored)} />
        <Stat
          label="Last push"
          value={status?.lastPushAt ? new Date(status.lastPushAt).toLocaleString() : "Never"}
        />
        <Stat
          label="Last pull"
          value={status?.lastPullAt ? new Date(status.lastPullAt).toLocaleString() : "Never"}
        />
        <Stat
          label="Sync activity"
          value={
            status?.connected
              ? status.phase && status.phase !== "idle"
                ? status.phase === "pushing"
                  ? "Sending changes…"
                  : "Pulling catalogue…"
                : "Idle"
              : "Paused"
          }
        />
      </div>

      {!!status?.tables.length && (
        <div className="max-h-48 overflow-auto rounded-md border border-border">
          <table className="w-full text-xs">
            <thead className="text-muted-foreground">
              <tr>
                <th className="px-2 py-1 text-left">Table</th>
                <th className="px-2 py-1 text-right">Pending</th>
                <th className="px-2 py-1 text-right">Synced</th>
                <th className="px-2 py-1 text-right">Failed</th>
              </tr>
            </thead>
            <tbody>
              {status.tables.map((t) => (
                <tr key={t.table} className="border-t border-border">
                  <td className="px-2 py-1">{t.table}</td>
                  <td className="numeric px-2 py-1 text-right">{t.pending}</td>
                  <td className="numeric px-2 py-1 text-right">{t.synced}</td>
                  <td className="numeric px-2 py-1 text-right">{t.errored}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!!status?.queue?.length && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Sync queue</p>
          <div className="max-h-64 overflow-auto rounded-md border border-border">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="px-2 py-1 text-left">Record</th>
                  <th className="px-2 py-1 text-left">State</th>
                  <th className="px-2 py-1 text-left">Reason</th>
                  <th className="px-2 py-1" />
                </tr>
              </thead>
              <tbody>
                {status.queue.map((row) => {
                  const failed = row.status === "error" || row.status === "quarantined";
                  return (
                    <tr key={`${row.table}:${row.id}`} className="border-t border-border">
                      <td className="px-2 py-1">
                        <span>{row.table}</span>{" "}
                        <span className="text-muted-foreground">{row.id.slice(0, 8)}</span>
                      </td>
                      <td className="px-2 py-1">
                        <StatusBadge status={row.status} />
                      </td>
                      <td
                        className="max-w-[18rem] truncate px-2 py-1 text-muted-foreground"
                        title={row.error ?? ""}
                      >
                        {row.error ?? (failed ? "Unknown error" : "—")}
                      </td>
                      <td className="px-2 py-1 text-right">
                        {failed && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2 text-xs"
                            onClick={() => void retryRow(row.table, row.id)}
                          >
                            Retry
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    synced: { label: "Synced", className: "bg-emerald-500/15 text-emerald-600" },
    pending: { label: "Waiting to sync", className: "bg-amber-500/15 text-amber-600" },
    error: { label: "Sync failed", className: "bg-destructive/15 text-destructive" },
    quarantined: { label: "Parked", className: "bg-destructive/15 text-destructive" },
  };
  const tone = map[status] ?? { label: status, className: "bg-muted text-muted-foreground" };
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] ${tone.className}`}>{tone.label}</span>
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