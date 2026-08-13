import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  defaultLocalDbConfig,
  hasLocalDb,
  localDb,
  loadLocalDbConfig,
  writeLocalDbConfig,
  type LocalDbConfig,
  type LocalDbTestResult,
  type LocalSyncStatus,
} from "@/lib/local-db";
import { supabaseConfig } from "@/lib/external-supabase-config";

/**
 * Local Microsoft SQL Server controls. Only meaningful inside the Windows
 * desktop shell — in a browser there is no local server to talk to.
 */
export function LocalDatabaseSettings() {
  const available = hasLocalDb();
  const [config, setConfig] = useState<LocalDbConfig>(defaultLocalDbConfig);
  const [status, setStatus] = useState<LocalSyncStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [diagnostic, setDiagnostic] = useState<LocalDbTestResult | null>(null);

  useEffect(() => {
    void loadLocalDbConfig().then(setConfig);
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

  const set = <K extends keyof LocalDbConfig>(key: K, value: LocalDbConfig[K]) =>
    setConfig((c) => ({ ...c, [key]: value }));

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

  /** Test connection keeps the full driver diagnostic on screen. */
  const testConnection = async () => {
    setBusy(true);
    setDiagnostic(null);
    try {
      const res = await localDb()!.test(config);
      setDiagnostic(res);
      if (res.ok) toast.success("Connection works");
      else toast.error(res.error ?? "Could not connect");
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

  return (
    <div className="space-y-3 rounded-md border border-border px-3 py-3">
      <div>
        <p className="text-sm">Local database</p>
        <p className="text-xs text-muted-foreground">
          Sales use the online database first and automatically fall back here. Connection details
          stay encrypted on this machine.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Server / instance">
          <Input value={config.server} onChange={(e) => set("server", e.target.value)} />
        </Field>
        <Field label="Database">
          <Input value={config.database} onChange={(e) => set("database", e.target.value)} />
        </Field>
        <Field label="Sign-in">
          <Select
            value={config.auth}
            onValueChange={(v) => set("auth", v as LocalDbConfig["auth"])}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="windows">Windows account</SelectItem>
              <SelectItem value="sql">SQL Server login</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Port">
          <Input
            type="number"
            value={config.port}
            onChange={(e) => set("port", Number(e.target.value) || 1433)}
          />
        </Field>
        {config.auth === "sql" && (
          <>
            <Field label="User">
              <Input value={config.user} onChange={(e) => set("user", e.target.value)} />
            </Field>
            <Field label="Password">
              <Input
                type="password"
                value={config.password}
                onChange={(e) => set("password", e.target.value)}
              />
            </Field>
          </>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={testConnection}
        >
          Test connection
        </Button>
        <Button
          size="sm"
          disabled={busy}
          onClick={() =>
            run("Connected to local database", async () => {
              await writeLocalDbConfig(config);
              return localDb()!.connect(config, supabaseConfig());
            })
          }
        >
          Save &amp; connect
        </Button>
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
          Back up local database
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

      {diagnostic && (
        <div
          className={`rounded-md border px-3 py-2 text-xs ${
            diagnostic.ok
              ? "border-emerald-500/40 bg-emerald-500/10"
              : "border-destructive/40 bg-destructive/10"
          }`}
        >
          {diagnostic.ok ? (
            <p>
              Connected{diagnostic.serverName ? ` to ${diagnostic.serverName}` : ""}.{" "}
              <span className="text-muted-foreground">{diagnostic.version}</span>
            </p>
          ) : (
            <div className="space-y-1">
              <p className="font-medium">
                {diagnostic.code ? `${diagnostic.code}: ` : ""}
                {diagnostic.error}
              </p>
              {diagnostic.originalMessage && (
                <p className="text-muted-foreground">{diagnostic.originalMessage}</p>
              )}
              {diagnostic.hint && <p className="text-muted-foreground">{diagnostic.hint}</p>}
            </div>
          )}
        </div>
      )}

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
          label="Status"
          value={
            status?.connected
              ? status.phase && status.phase !== "idle"
                ? status.phase === "pushing"
                  ? "Sending changes…"
                  : "Pulling catalogue…"
                : "Connected"
              : (status?.error ?? "Offline")
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
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