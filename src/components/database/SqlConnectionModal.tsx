import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Database, Loader2, Plug, TriangleAlert, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  defaultLocalDbConfig,
  loadLocalDbConfig,
  localDb,
  scanLocalInstances,
  testDirectConnection,
  writeLocalDbConfig,
  type LocalDbConfig,
  type LocalDbTestResult,
} from "@/lib/local-db";
import { supabaseConfig } from "@/lib/external-supabase-config";

const DEFAULT_DATABASE = "POS_Master_2025";

/** Extra guidance on top of the driver's own hint. */
function tipFor(result: LocalDbTestResult): string | null {
  const text = `${result.code ?? ""} ${result.error ?? ""} ${result.originalMessage ?? ""}`.toLowerCase();
  if (text.includes("certificate"))
    return "Certificate error — switch 'Trust Server Certificate' ON, or turn 'Encrypt Connection' OFF for a local instance.";
  if (text.includes("instance"))
    return "Named instance not found — start the SQL Server Browser service, or type the instance's fixed TCP port.";
  if (text.includes("login") || text.includes("elogin"))
    return "The server answered but rejected the sign-in — check the login, password, or that this Windows account has access.";
  if (text.includes("timeout") || text.includes("socket") || text.includes("refused"))
    return "No answer on that port — enable TCP/IP in SQL Server Configuration Manager and allow the port through the firewall.";
  return null;
}

/** Short version label such as "Microsoft SQL Server 2025 (v17.0)". */
function describeVersion(raw?: string): string {
  if (!raw) return "SQL Server";
  const year = /Microsoft SQL Server\s+(\d{4})/i.exec(raw)?.[1];
  const build = /-\s*(\d+\.\d+)/.exec(raw)?.[1];
  return `Microsoft SQL Server${year ? ` ${year}` : ""}${build ? ` (v${build})` : ""}`;
}

export function SqlConnectionModal({
  open,
  onOpenChange,
  onConnected,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConnected?: (config: LocalDbConfig) => void;
}) {
  const [config, setConfig] = useState<LocalDbConfig>({
    ...defaultLocalDbConfig,
    database: DEFAULT_DATABASE,
    port: 1433,
    encrypt: true,
    trustServerCertificate: true,
    arithAbort: true,
  });
  const [targets, setTargets] = useState<string[]>([]);
  const [hostname, setHostname] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<LocalDbTestResult | null>(null);

  const set = <K extends keyof LocalDbConfig>(key: K, value: LocalDbConfig[K]) =>
    setConfig((c) => ({ ...c, [key]: value }));

  const scan = useCallback(async (silent = false) => {
    setScanning(true);
    try {
      const res = await scanLocalInstances();
      const list = res.targets ?? [];
      setTargets(list);
      setHostname(res.hostname ?? null);
      if (!silent) {
        if (list.length) toast.success(`Found ${list.length} local target(s)`);
        else toast.message(res.hint ?? res.error ?? "No local SQL Server instance found");
      }
      return list;
    } finally {
      setScanning(false);
    }
  }, []);

  /* Pre-fill from the sealed config, then scan this PC. */
  useEffect(() => {
    if (!open) return;
    let alive = true;
    void (async () => {
      const saved = await loadLocalDbConfig();
      if (!alive) return;
      const hasSaved = saved.server && saved.server !== defaultLocalDbConfig.server;
      setConfig((current) => ({
        ...current,
        ...saved,
        database: saved.database || DEFAULT_DATABASE,
        port: saved.port || 1433,
        trustServerCertificate: saved.trustServerCertificate ?? true,
        arithAbort: saved.arithAbort ?? true,
      }));
      const list = await scan(true);
      if (!alive || hasSaved) return;
      const preferred = list.find((t) => t.includes("\\")) ?? list[0];
      if (preferred) setConfig((current) => ({ ...current, server: preferred }));
    })();
    return () => {
      alive = false;
    };
  }, [open, scan]);

  const params = () => ({
    host: config.server,
    port: config.port,
    database: config.database,
    authType: config.auth,
    username: config.user,
    password: config.password,
    encrypt: !!config.encrypt,
    trustServerCertificate: config.trustServerCertificate !== false,
    arithAbort: config.arithAbort !== false,
    timeout: 15000,
  });

  const test = async () => {
    setBusy(true);
    setResult(null);
    try {
      const res = await testDirectConnection(params());
      setResult(res);
      if (res.ok) toast.success("Connection works");
      else toast.error(res.error ?? "Could not connect");
      return res.ok;
    } finally {
      setBusy(false);
    }
  };

  const connect = async () => {
    setBusy(true);
    try {
      const probe = await testDirectConnection(params());
      setResult(probe);
      if (!probe.ok) {
        toast.error(probe.error ?? "Could not connect");
        return;
      }
      await writeLocalDbConfig(config);
      const bridge = localDb();
      const res = await bridge?.connect(config, supabaseConfig());
      if (res && !res.ok) {
        setResult(res);
        toast.error(res.error ?? "Could not open the connection pool");
        return;
      }
      toast.success("Connected to the local database");
      onConnected?.(config);
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  const options = Array.from(
    new Set([...(config.server ? [config.server] : []), ...targets]),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="h-4 w-4" />
            Connect to Local SQL Server 2025
          </DialogTitle>
          <DialogDescription>
            {hostname
              ? `This PC is "${hostname}". Pick a detected instance or type a server address.`
              : "Pick a detected instance or type a server address."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={scanning || busy}
              onClick={() => void scan()}
            >
              {scanning ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Zap className="mr-2 h-3.5 w-3.5" />
              )}
              Auto-Scan Local PC
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="sql-server">Server / instance</Label>
              <div className="flex gap-2">
                <Input
                  id="sql-server"
                  list="sql-server-targets"
                  placeholder="DESKTOP-POS-01\SQLEXPRESS"
                  value={config.server}
                  onChange={(e) => set("server", e.target.value)}
                />
                <datalist id="sql-server-targets">
                  {options.map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
                {targets.length > 0 && (
                  <Select value="" onValueChange={(v) => set("server", v)}>
                    <SelectTrigger className="w-[150px] shrink-0">
                      <SelectValue placeholder="Detected" />
                    </SelectTrigger>
                    <SelectContent>
                      {targets.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sql-port">Port</Label>
              <Input
                id="sql-port"
                type="number"
                value={config.port}
                onChange={(e) => set("port", Number(e.target.value) || 1433)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sql-database">Database name</Label>
              <Input
                id="sql-database"
                value={config.database}
                onChange={(e) => set("database", e.target.value)}
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label>Authentication</Label>
              <Select
                value={config.auth}
                onValueChange={(v) => set("auth", v as LocalDbConfig["auth"])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="windows">Windows Integrated / NTLM</SelectItem>
                  <SelectItem value="sql">SQL Server Authentication</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {config.auth === "sql" && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="sql-user">User name</Label>
                  <Input
                    id="sql-user"
                    autoComplete="off"
                    value={config.user}
                    onChange={(e) => set("user", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sql-password">Password</Label>
                  <Input
                    id="sql-password"
                    type="password"
                    autoComplete="new-password"
                    value={config.password}
                    onChange={(e) => set("password", e.target.value)}
                  />
                </div>
              </>
            )}
          </div>

          <div className="space-y-2 rounded-md border border-border px-3 py-2">
            <ToggleRow
              id="sql-encrypt"
              label="Encrypt connection"
              hint="Required by the TDS 8.0 protocol on SQL Server 2025."
              checked={!!config.encrypt}
              onChange={(v) => set("encrypt", v)}
            />
            <ToggleRow
              id="sql-trust"
              label="Trust server certificate"
              hint="Needed for local or self-signed certificates."
              checked={config.trustServerCertificate !== false}
              onChange={(v) => set("trustServerCertificate", v)}
            />
            <ToggleRow
              id="sql-arith"
              label="Enable ArithAbort"
              hint="Recommended for indexed views and computed columns."
              checked={config.arithAbort !== false}
              onChange={(v) => set("arithAbort", v)}
            />
          </div>

          {result &&
            (result.ok ? (
              <div className="flex items-start gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs">
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
                <div className="space-y-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="border-emerald-500/50">
                      Connected
                    </Badge>
                    <span>
                      {describeVersion(result.version)}
                      {typeof result.latencyMs === "number"
                        ? ` — Latency: ${result.latencyMs}ms`
                        : ""}
                    </span>
                  </p>
                  {result.activeDb && (
                    <p className="text-muted-foreground">Active database: {result.activeDb}</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs">
                <TriangleAlert className="mt-0.5 h-4 w-4 text-destructive" />
                <div className="space-y-1">
                  <p className="font-medium">
                    {result.code ? `${result.code}: ` : ""}
                    {result.error}
                  </p>
                  {result.originalMessage && (
                    <p className="text-muted-foreground">{result.originalMessage}</p>
                  )}
                  {(tipFor(result) ?? result.hint) && (
                    <p className="text-muted-foreground">{tipFor(result) ?? result.hint}</p>
                  )}
                </div>
              </div>
            ))}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button type="button" variant="outline" disabled={busy} onClick={() => void test()}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Test connection
          </Button>
          <Button type="button" disabled={busy} onClick={() => void connect()}>
            <Plug className="mr-2 h-4 w-4" />
            Connect &amp; save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ToggleRow({
  id,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <Label htmlFor={id} className="text-sm">
          {label}
        </Label>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}