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
  type LocalSyncStatus,
} from "@/lib/local-db";

/**
 * Local Microsoft SQL Server controls. Only meaningful inside the Windows
 * desktop shell — in a browser there is no local server to talk to.
 */
export function LocalDatabaseSettings() {
  const available = hasLocalDb();
  const [config, setConfig] = useState<LocalDbConfig>(defaultLocalDbConfig);
  const [status, setStatus] = useState<LocalSyncStatus | null>(null);
  const [busy, setBusy] = useState(false);

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
          Every sale is written here first. The connection details stay on this machine.
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
          onClick={() => run("Connection works", () => localDb()!.test(config))}
        >
          Test connection
        </Button>
        <Button
          size="sm"
          disabled={busy}
          onClick={() =>
            run("Connected to local database", async () => {
              await writeLocalDbConfig(config);
              return localDb()!.connect(config);
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
        <Stat label="Status" value={status?.connected ? "Connected" : (status?.error ?? "Offline")} />
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
    </div>
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