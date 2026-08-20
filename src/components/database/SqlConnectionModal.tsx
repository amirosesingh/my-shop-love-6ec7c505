import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  CheckCircle2,
  Circle,
  Database,
  Loader2,
  Lock,
  Plug,
  RotateCw,
  TriangleAlert,
  Zap,
} from "lucide-react";
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
  connectLocalDatabase,
  defaultLocalDbConfig,
  loadLocalDbConfig,
  scanLocalInstances,
  testDirectConnection,
  verifyLocalWrite,
  type LocalDbConfig,
  type LocalDbTestResult,
} from "@/lib/local-db";
import { DESKTOP_ONLY, sqlAdmin, type SqlAdminFailure, type SqlDatabase } from "@/lib/sql-admin";
import { supabaseConfig } from "@/lib/external-supabase-config";

const DEFAULT_DATABASE = "POS_Master_2025";

/**
 * SSMS-style connection wizard.
 *
 * Each phase is proved on its own so a failure names the real culprit: a
 * blocked port never looks like a bad password, and a login that cannot open
 * the catalogue never looks like a missing database.
 */
const STEPS = [
  { key: "credentials", label: "Credentials", hint: "Server, port and sign-in method." },
  { key: "socket", label: "TCP socket", hint: "Two-second raw port probe." },
  { key: "handshake", label: "Auth handshake", hint: "Sign in against master." },
  { key: "catalog", label: "Catalog discovery", hint: "List the databases you can open." },
  { key: "lock", label: "Lock & save", hint: "Point the till at the chosen database." },
  { key: "write", label: "Write verification", hint: "Insert and roll back a probe row." },
] as const;

type StepKey = (typeof STEPS)[number]["key"];
type StepStatus = "pending" | "running" | "passed" | "failed";
type StepState = {
  status: StepStatus;
  detail?: string;
  error?: string;
  hint?: string | null;
  ms?: number;
  /** Combinations the shell tried before giving up (port, driver, encryption). */
  attempts?: { label: string; code?: string | null; error?: string }[];
};

const blankSteps = (): Record<StepKey, StepState> =>
  Object.fromEntries(STEPS.map((s) => [s.key, { status: "pending" as StepStatus }])) as Record<
    StepKey,
    StepState
  >;

/** Extra guidance on top of the driver's own hint. */
function tipFor(result: { code?: string | null; error?: string; originalMessage?: string | null }) {
  const text = `${result.code ?? ""} ${result.error ?? ""} ${result.originalMessage ?? ""}`.toLowerCase();
  if (text.includes("certificate"))
    return "Certificate error — switch 'Trust server certificate' ON, or turn 'Encrypt connection' OFF for a local instance.";
  if (text.includes("instance"))
    return "Named instance not found — start the SQL Server Browser service, or type the instance's fixed TCP port.";
  if (text.includes("login") || text.includes("elogin"))
    return "The server answered but rejected the sign-in — check the login, password, or that this Windows account has access.";
  if (text.includes("timeout") || text.includes("socket") || text.includes("refused"))
    return "No answer on that port — enable TCP/IP in SQL Server Configuration Manager and allow the port through the firewall.";
  return null;
}

/** Short version label such as "Microsoft SQL Server 2025 (v17.0)". */
function describeVersion(raw?: string | null): string {
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
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<Record<StepKey, StepState>>(blankSteps);
  const [databases, setDatabases] = useState<SqlDatabase[]>([]);
  /**
   * Every run owns a token. A result from a cancelled or superseded run is
   * dropped instead of writing into fresh state, so closing the dialog mid-
   * handshake can never leave a spinner behind.
   */
  const runToken = useRef(0);

  const set = <K extends keyof LocalDbConfig>(key: K, value: LocalDbConfig[K]) => {
    setConfig((c) => ({ ...c, [key]: value }));
    // Any credential edit invalidates everything proved so far.
    setSteps(blankSteps());
    setDatabases([]);
  };

  const mark = (key: StepKey, patch: StepState) =>
    setSteps((s) => ({ ...s, [key]: { ...s[key], ...patch } }));

  /** Abandon whatever is running and tell the shell to drop its half-open pool. */
  const abandonRun = useCallback(() => {
    runToken.current += 1;
    setRunning(false);
    void sqlAdmin()?.cancel?.();
  }, []);

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
    if (!open) {
      abandonRun();
      setSteps(blankSteps());
      return;
    }
    let alive = true;
    runToken.current += 1;
    setRunning(false);
    setSteps(blankSteps());
    setDatabases([]);
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
  }, [open, scan, abandonRun]);

  const credentials = () => ({
    server: config.server,
    port: config.port,
    auth: config.auth,
    user: config.user,
    password: config.password,
    encrypt: !!config.encrypt,
    trustServerCertificate: config.trustServerCertificate !== false,
  });

  const params = (database: string) => ({
    host: config.server,
    port: config.port,
    database,
    authType: config.auth,
    username: config.user,
    password: config.password,
    encrypt: !!config.encrypt,
    trustServerCertificate: config.trustServerCertificate !== false,
    arithAbort: config.arithAbort !== false,
    timeout: 15000,
  });

  const failure = (key: StepKey, res: SqlAdminFailure | LocalDbTestResult, ms?: number) => {
    mark(key, {
      status: "failed",
      ms,
      error: `${res.code ? `${res.code}: ` : ""}${res.error ?? "Step failed"}`,
      hint: tipFor(res) ?? res.hint ?? null,
      attempts: "attempts" in res ? (res.attempts ?? []) : [],
    });
    return false;
  };

  /* ---------------- individual phases ---------------- */

  const runCredentials = async () => {
    mark("credentials", { status: "running" });
    if (!config.server.trim())
      return failure("credentials", { ok: false, error: "Enter a server or instance name." });
    if (config.auth === "sql" && !config.user.trim())
      return failure("credentials", {
        ok: false,
        error: "SQL authentication needs a login name.",
        hint: "Switch to Windows Integrated to use the signed-in account instead.",
      });
    mark("credentials", {
      status: "passed",
      detail: `${config.server}${config.port ? `:${config.port}` : ""} · ${
        config.auth === "sql" ? `SQL login ${config.user}` : "Windows Integrated"
      }`,
    });
    return true;
  };

  const runSocket = async () => {
    const bridge = sqlAdmin();
    if (!bridge?.probePort) return failure("socket", DESKTOP_ONLY);
    mark("socket", { status: "running" });
    const res = await bridge.probePort(credentials());
    if (!res.ok) return failure("socket", res, res.elapsedMs);
    mark("socket", {
      status: "passed",
      ms: res.elapsedMs,
      detail: `Port ${res.port} on ${res.host} is open${
        res.instanceName ? ` (instance ${res.instanceName}${res.browserAnswered ? ", resolved via SQL Browser" : ""})` : ""
      }`,
    });
    return true;
  };

  const runHandshake = async () => {
    const bridge = sqlAdmin();
    if (!bridge) return failure("handshake", DESKTOP_ONLY);
    mark("handshake", { status: "running" });
    const started = Date.now();
    const res = await bridge.connectInstance({ ...credentials(), database: "master" });
    const ms = Date.now() - started;
    if (!res.ok) return failure("handshake", res, ms);
    mark("handshake", {
      status: "passed",
      ms,
      detail: `${res.serverName ?? "Signed in"} · ${describeVersion(res.version)}${
        res.resolved ? ` · ${res.resolved.driver}, ${res.resolved.usedPort ? `port ${res.resolved.port}` : "instance lookup"}, encryption ${res.resolved.encrypt ? "on" : "off"}` : ""
      }${res.usedTrustFallback ? " · certificate trusted automatically" : ""}`,
    });
    setDatabases(res.databases ?? []);
    return true;
  };

  const runCatalog = async () => {
    const bridge = sqlAdmin();
    if (!bridge) return failure("catalog", DESKTOP_ONLY);
    mark("catalog", { status: "running" });
    const started = Date.now();
    const res = await bridge.listDatabases();
    const ms = Date.now() - started;
    if (!res.ok) return failure("catalog", res, ms);
    setDatabases(res.databases);
    if (!res.databases.length)
      return failure(
        "catalog",
        {
          ok: false,
          error: "This login cannot open any database on that server.",
          hint: "Grant the login access to the POS database, then run this step again.",
        },
        ms,
      );
    // Keep the operator's choice when it still exists, otherwise take the first.
    const names = res.databases.map((d) => d.name);
    if (!names.includes(config.database))
      setConfig((c) => ({ ...c, database: names.find((n) => n === DEFAULT_DATABASE) ?? names[0] }));
    mark("catalog", {
      status: "passed",
      ms,
      detail: `${res.databases.length} database(s) available`,
    });
    return true;
  };

  const runLock = async () => {
    const bridge = sqlAdmin();
    if (!bridge) return failure("lock", DESKTOP_ONLY);
    if (!config.database.trim())
      return failure("lock", { ok: false, error: "Choose the database to use." });
    mark("lock", { status: "running" });
    const started = Date.now();
    if (bridge.lockDatabase) {
      const locked = await bridge.lockDatabase({ ...credentials(), database: config.database });
      if (!locked.ok) return failure("lock", locked, Date.now() - started);
    }
    // Prove the operational pool — not just the admin pool — can use it.
    const probe = await testDirectConnection(params(config.database));
    if (!probe.ok) return failure("lock", probe, Date.now() - started);
    // Saves the details and returns as soon as the local database is proved;
    // cloud sync starts behind it, so this can never sit here spinning.
    const opened = await connectLocalDatabase(config, supabaseConfig());
    if (!opened.ok) return failure("lock", opened, Date.now() - started);
    mark("lock", {
      status: "passed",
      ms: Date.now() - started,
      detail: `Locked to ${opened.activeDb ?? probe.activeDb ?? config.database}`,
    });
    return true;
  };

  const RUNNERS: Record<StepKey, () => Promise<boolean>> = {
    credentials: runCredentials,
    socket: runSocket,
    handshake: runHandshake,
    catalog: runCatalog,
    lock: runLock,
  };

  /** Runs `key` and, unless retrying a single step, everything after it. */
  const advance = async (from: StepKey, only = false) => {
    setRunning(true);
    try {
      const order = STEPS.map((s) => s.key);
      for (const key of order.slice(order.indexOf(from))) {
        const ok = await RUNNERS[key]();
        if (!ok) return false;
        // The catalogue step hands control back so a database can be picked.
        if (only || key === "catalog") return true;
      }
      return true;
    } finally {
      setRunning(false);
    }
  };

  const finish = async () => {
    const ok = await advance("lock", true);
    if (!ok) return;
    toast.success("Connected to the local database");
    onConnected?.(config);
    onOpenChange(false);
  };

  const options = useMemo(
    () => Array.from(new Set([...(config.server ? [config.server] : []), ...targets])),
    [config.server, targets],
  );
  const catalogReady = steps.catalog.status === "passed";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="h-4 w-4" />
            Connect to Local SQL Server
          </DialogTitle>
          <DialogDescription>
            {hostname
              ? `This PC is "${hostname}". Each step is checked on its own so a failure tells you exactly what to fix.`
              : "Each step is checked on its own so a failure tells you exactly what to fix."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={scanning || running}
              onClick={() => void scan()}
            >
              {scanning ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Zap className="mr-2 h-3.5 w-3.5" />
              )}
              Auto-scan this PC
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

          {/* ---- step ladder ---- */}
          <ol className="divide-y divide-border overflow-hidden rounded-md border border-border">
            {STEPS.map((step, index) => {
              const state = steps[step.key];
              return (
                <li key={step.key} className="flex items-start gap-3 px-3 py-2.5 text-sm">
                  <StepIcon status={state.status} />
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      <span>
                        {index + 1}. {step.label}
                      </span>
                      {typeof state.ms === "number" && (
                        <span className="text-xs font-normal text-muted-foreground">
                          {state.ms} ms
                        </span>
                      )}
                    </p>
                    <p
                      className={
                        state.status === "failed"
                          ? "text-xs text-destructive"
                          : "text-xs text-muted-foreground"
                      }
                    >
                      {state.error ?? state.detail ?? step.hint}
                    </p>
                    {state.status === "failed" && state.hint && (
                      <p className="text-xs text-muted-foreground">{state.hint}</p>
                    )}
                    {state.status === "failed" && !!state.attempts?.length && (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-xs text-muted-foreground">
                          {state.attempts.length} connection attempt(s) tried
                        </summary>
                        <ul className="mt-1 space-y-1">
                          {state.attempts.map((a) => (
                            <li key={a.label} className="text-xs text-muted-foreground">
                              <span className="font-medium">{a.label}</span>
                              {" — "}
                              {a.code ? `${a.code}: ` : ""}
                              {a.error}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </div>
                  {state.status === "failed" && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={running}
                      onClick={() => void advance(step.key, true)}
                    >
                      <RotateCw className="mr-1.5 h-3.5 w-3.5" />
                      Retry
                    </Button>
                  )}
                </li>
              );
            })}
          </ol>

          {catalogReady && (
            <div className="space-y-1.5 rounded-md border border-border px-3 py-2.5">
              <Label htmlFor="sql-database">Database to use</Label>
              <Select value={config.database} onValueChange={(v) => setConfig((c) => ({ ...c, database: v }))}>
                <SelectTrigger id="sql-database">
                  <SelectValue placeholder="Choose a database" />
                </SelectTrigger>
                <SelectContent>
                  {databases.map((d) => (
                    <SelectItem key={d.name} value={d.name}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Only databases this login can actually open are listed. Nothing is created here —
                apply the master schema from Local database settings if the tables are missing.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            type="button"
            variant="outline"
            disabled={running}
            onClick={() => void advance("credentials")}
          >
            {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Run checks
          </Button>
          <Button type="button" disabled={running || !catalogReady} onClick={() => void finish()}>
            {catalogReady ? <Lock className="mr-2 h-4 w-4" /> : <Plug className="mr-2 h-4 w-4" />}
            Lock &amp; save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StepIcon({ status }: { status: StepStatus }) {
  if (status === "running") return <Loader2 className="mt-0.5 h-4 w-4 animate-spin text-primary" />;
  if (status === "passed") return <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />;
  if (status === "failed") return <TriangleAlert className="mt-0.5 h-4 w-4 text-destructive" />;
  return <Circle className="mt-0.5 h-4 w-4 text-muted-foreground" />;
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
