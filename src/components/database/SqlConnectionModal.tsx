import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  CheckCircle2,
  Circle,
  Database,
  Loader2,
  Lock,
  CircleSlash,
  Plug,
  RotateCw,
  Eraser,
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
  reconnectLocalDatabase,
  resetLocalDatabase,
  removeStoredConnection,
  type LocalDbConfig,
  type LocalDbTestResult,
} from "@/core/local-db/local-db";
import { DESKTOP_ONLY, sqlAdmin, type SqlAdminFailure, type SqlDatabase } from "@/lib/sql-admin";
import { createRunGuard } from "@/lib/run-token";
import { DriverInstallPanel } from "@/components/database/DriverInstallPanel";
import {
  STEP_DEADLINE_MS,
  newAttemptId,
  traceAttempt,
  withClientDeadline,
} from "@/lib/connection-attempt";
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
type StepStatus = "pending" | "running" | "passed" | "failed" | "cancelled" | "timed_out";
type StepState = {
  status: StepStatus;
  detail?: string;
  error?: string;
  hint?: string | null;
  ms?: number;
  /** Identity of the run that produced this state. */
  attemptId?: string;
  code?: string | null;
  /** Combinations the shell tried before giving up (port, driver, encryption). */
  attempts?: { label: string; code?: string | null; error?: string }[];
};

const blankSteps = (): Record<StepKey, StepState> =>
  Object.fromEntries(STEPS.map((s) => [s.key, { status: "pending" as StepStatus }])) as Record<
    StepKey,
    StepState
  >;

/** True when the failure is "no Microsoft ODBC driver on this PC". */
export function isDriverMissing(state: {
  code?: string | null;
  error?: string;
  hint?: string | null;
}): boolean {
  const text = `${state.code ?? ""} ${state.error ?? ""} ${state.hint ?? ""}`.toLowerCase();
  return (
    state.code === "EDRIVER" ||
    text.includes("im002") ||
    text.includes("odbc driver") ||
    text.includes("driver not found") ||
    text.includes("data source name not found")
  );
}

/** Extra guidance on top of the driver's own hint. */
function tipFor(
  step: StepKey,
  result: { code?: string | null; error?: string; originalMessage?: string | null; stage?: string },
) {
  const text = `${result.code ?? ""} ${result.error ?? ""} ${result.originalMessage ?? ""}`.toLowerCase();
  if (text.includes("certificate"))
    return "Certificate error — switch 'Trust server certificate' ON, or turn 'Encrypt connection' OFF for a local instance.";
  if (result.code === "EDRIVER" || text.includes("im002") || text.includes("driver not"))
    return "Windows authentication needs a Microsoft ODBC SQL Server driver and the msnodesqlv8 desktop driver.";
  if (result.stage === "instance_lookup" || text.includes("instance"))
    return "Named instance not found — start the SQL Server Browser service, or type the instance's fixed TCP port.";
  if (result.stage === "login" || text.includes("login") || text.includes("elogin"))
    return "The server answered but rejected the sign-in — check the login, password, or that this Windows account has access.";
  if (step === "socket" && (result.stage === "port" || text.includes("socket") || text.includes("refused")))
    return "No answer on that port — enable TCP/IP in SQL Server Configuration Manager and allow the port through the firewall.";
  if (step === "handshake" && text.includes("timeout"))
    return "The SQL driver reached its sign-in deadline. Check authentication, the ODBC driver and encryption settings; the TCP check is not the cause.";
  if (step === "handshake" && text.includes("ebudget"))
    return "Earlier sign-in combinations used the connection deadline. Review the attempts below; the port check has already been handled separately.";
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
    port: 0,
    encrypt: true,
    trustServerCertificate: true,
    arithAbort: true,
  });
  const [targets, setTargets] = useState<string[]>([]);
  const [hostname, setHostname] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [running, setRunning] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [steps, setSteps] = useState<Record<StepKey, StepState>>(blankSteps);
  const [databases, setDatabases] = useState<SqlDatabase[]>([]);
  /**
   * Every run owns a token. A result from a cancelled or superseded run is
   * dropped instead of writing into fresh state, so closing the dialog mid-
   * handshake can never leave a spinner behind.
   */
  const guard = useRef(createRunGuard()).current;
  /** Identity of the current run; shared with the shell so it can be cancelled. */
  const attemptRef = useRef<string | null>(null);
  /** Port the TCP step proved open; reused by the handshake and the lock. */
  const provenPortRef = useRef<number | null>(null);
  /** Synchronous lock — protects against a double click within one render. */
  const startingRef = useRef(false);
  /**
   * True once the operator edits the form. "Reconnect now" then retries what
   * is on screen instead of the sealed file, which is how a corrected port
   * used to be ignored.
   */
  const dirtyRef = useRef(false);
  /** Server · database already sealed on this machine, "" when there is none. */
  const [savedLabel, setSavedLabel] = useState("");

  const set = <K extends keyof LocalDbConfig>(key: K, value: LocalDbConfig[K]) => {
    setConfig((c) => ({ ...c, [key]: value }));
    dirtyRef.current = true;
    // Any credential edit invalidates everything proved so far.
    setSteps(blankSteps());
    setDatabases([]);
  };


  const mark = (key: StepKey, patch: StepState) =>
    setSteps((s) => ({ ...s, [key]: { ...s[key], ...patch } }));

  /** Abandon whatever is running and tell the shell to drop its half-open pool. */
  const abandonRun = useCallback(() => {
    guard.abandon();
    startingRef.current = false;
    setRunning(false);
    const id = attemptRef.current;
    attemptRef.current = null;
    if (id) traceAttempt(id, "driver", "cancelled");
    void sqlAdmin()
      ?.cancel?.(id ?? undefined)
      .catch(() => {});
  }, [guard]);

  /** Operator pressed Stop: the running step is stopped, not failed. */
  const stopRun = () => {
    abandonRun();
    setSteps((s) => {
      const next = { ...s };
      for (const key of Object.keys(next) as StepKey[]) {
        if (next[key].status === "running")
          next[key] = { status: "cancelled", detail: "Cancelled before it finished." };
      }
      return next;
    });
  };

  /**
   * Full clean slate: cancels anything still running in the shell, closes both
   * pools and forgets the saved credentials. This is the way out of a
   * connection that refuses to finish or a machine that was set up wrongly.
   */
  /**
   * Closes everything and opens the connection again. When the form has been
   * edited the values on screen are used for the retry — repeating the sealed
   * file is exactly what made this button look dead after a port was fixed.
   */
  const reconnectNow = async () => {
    setResetting(true);
    abandonRun();
    setSteps(blankSteps());
    try {
      const override = dirtyRef.current
        ? {
            ...config,
            port: resolvedPort() ?? 0,
            directConnect: directConnect(),
          }
        : undefined;
      const res = await reconnectLocalDatabase(override);
      if (res.ok)
        toast.success(
          `Reconnected${res.activeDb ? ` to ${res.activeDb}` : ""}${
            override ? " using the details on screen" : ""
          }.`,
        );
      else
        toast.error(res.error ?? "Could not reconnect.", { description: res.hint ?? undefined });
    } finally {
      setResetting(false);
    }
  };


  /**
   * Deletes the sealed file outright, stops the background retry loop and
   * clears the driver crash counter, so the wizard starts from nothing instead
   * of fighting a connection that was saved earlier.
   */
  const resetConnection = async () => {
    setResetting(true);
    abandonRun();
    try {
      const res = savedLabel ? await removeStoredConnection() : await resetLocalDatabase();
      setSteps(blankSteps());
      setDatabases([]);
      if (res.ok) {
        setSavedLabel("");
        setConfig((c) => ({ ...c, ...defaultLocalDbConfig, database: DEFAULT_DATABASE }));
        dirtyRef.current = false;
        toast.success("Saved connection removed. Enter the server details and run the checks again.");
      } else toast.error(res.error ?? "Could not remove the saved connection.");
    } finally {
      setResetting(false);
    }
  };

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
    guard.abandon();
    startingRef.current = false;
    attemptRef.current = null;
    setRunning(false);
    setSteps(blankSteps());
    setDatabases([]);
    void (async () => {
      const saved = await loadLocalDbConfig();
      if (!alive) return;
      const hasSaved = saved.server && saved.server !== defaultLocalDbConfig.server;
      setSavedLabel(
        hasSaved ? [saved.server, saved.database].filter(Boolean).join(" · ") : "",
      );
      setConfig((current) => ({
        ...current,
        ...saved,
        database: saved.database || DEFAULT_DATABASE,
        port: saved.port ?? 0,
        trustServerCertificate: saved.trustServerCertificate ?? true,
        arithAbort: saved.arithAbort ?? true,
        directConnect: saved.directConnect ?? (saved.port ?? 0) > 0,
      }));
      dirtyRef.current = false;
      const list = await scan(true);
      if (!alive || hasSaved) return;
      const preferred = list.find((t) => t.includes("\\")) ?? list[0];
      if (preferred) setConfig((current) => ({ ...current, server: preferred }));
    })();
    return () => {
      alive = false;
    };
  }, [open, scan, abandonRun, guard]);

  /**
   * The port the operator actually asked for.
   *
   * A named instance and an explicit port are not mutually exclusive: an
   * earlier build discarded 1433 whenever the server text held a backslash,
   * which forced a SQL Browser lookup — and a stalled handshake — even though
   * the port was right there. Whatever is typed is now honoured; "automatic"
   * is expressed by leaving the port empty, or by turning direct mode off.
   */
  const resolvedPort = () => {
    const inline = /,\s*(\d+)\s*$/.exec(config.server);
    if (inline) return Number(inline[1]);
    return config.port || undefined;
  };

  /** Direct mode needs a real port; without one there is nothing to aim at. */
  const directConnect = () => config.directConnect === true && !!resolvedPort();

  const credentials = () => ({
    server: config.server,
    port: resolvedPort(),
    // The port the TCP step actually proved open. Passing it forward stops the
    // driver resolving the instance again over SQL Browser — the sub-step that
    // used to hang the handshake when that service is stopped.
    resolvedPort: provenPortRef.current ?? undefined,
    directConnect: directConnect(),
    auth: config.auth,
    user: config.user,
    password: config.password,
    encrypt: !!config.encrypt,
    trustServerCertificate: config.trustServerCertificate !== false,
  });

  const params = (database: string) => ({
    host: config.server,
    port: resolvedPort() ?? 0,
    directConnect: directConnect(),
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
      status: res.code === "ECANCELLED" ? "cancelled" : res.code === "ETIMEOUT" ? "timed_out" : "failed",
      ms,
      code: res.code ?? null,
      attemptId: attemptRef.current ?? undefined,
      error: `${res.code ? `${res.code}: ` : ""}${res.error ?? "Step failed"}`,
      hint: tipFor(key, res) ?? res.hint ?? null,
      attempts: "attempts" in res ? (res.attempts ?? []) : [],
    });
    traceAttempt(attemptRef.current ?? "-", key, res.code === "ECANCELLED" ? "cancelled" : "failed", ms);
    return false;
  };

  /**
   * Runs one bridge call under a hard client deadline. A call that never
   * answers becomes a `timed_out` step instead of an endless spinner, and the
   * abandoned request is cancelled in the shell.
   */
  const bounded = async <T,>(
    key: StepKey,
    work: Promise<T>,
  ): Promise<{ ok: true; value: T; ms: number } | { ok: false; ms: number }> => {
    const res = await withClientDeadline(work, STEP_DEADLINE_MS[key] ?? 30_000);
    if (res.timedOut) {
      const id = attemptRef.current;
      void sqlAdmin()
        ?.cancel?.(id ?? undefined)
        .catch(() => {});
      mark(key, {
        status: "timed_out",
        ms: res.elapsedMs,
        code: "ETIMEOUT",
        attemptId: id ?? undefined,
        error: "ETIMEOUT: this step did not finish within its deadline.",
        hint: "The attempt was stopped and released. Check the SQL Server service, then run the checks again.",
        attempts: [],
      });
      traceAttempt(id ?? "-", key, "timed_out", res.elapsedMs);
      return { ok: false, ms: res.elapsedMs };
    }
    return { ok: true, value: res.value, ms: res.elapsedMs };
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
      detail: `${config.server}${resolvedPort() ? `:${resolvedPort()}` : " · automatic port"} · ${
        config.auth === "sql" ? `SQL login ${config.user}` : "Windows Integrated"
      }`,
    });
    return true;
  };

  const runSocket = async () => {
    const bridge = sqlAdmin();
    if (!bridge?.probePort) return failure("socket", DESKTOP_ONLY);
    mark("socket", { status: "running", attemptId: attemptRef.current ?? undefined });
    provenPortRef.current = null;
    const call = await bounded("socket", bridge.probePort(credentials()));
    if (!call.ok) return false;
    const res = call.value;
    if (!res.ok) return failure("socket", res, res.elapsedMs);
    provenPortRef.current = res.skipped ? null : (res.port ?? null);
    mark("socket", {
      status: "passed",
      ms: res.elapsedMs,
      detail: res.skipped
        ? `${res.host}\\${res.instanceName} uses a dynamic port; continuing with the SQL driver`
        : `Port ${res.port} on ${res.host} is open${
            res.instanceName ? ` (instance ${res.instanceName}${res.browserAnswered ? ", resolved via SQL Browser" : ""})` : ""
          }`,
    });
    return true;
  };

  const runHandshake = async () => {
    const bridge = sqlAdmin();
    if (!bridge) return failure("handshake", DESKTOP_ONLY);
    mark("handshake", { status: "running", attemptId: attemptRef.current ?? undefined });
    traceAttempt(attemptRef.current ?? "-", "login", "running");
    const call = await bounded(
      "handshake",
      bridge.connectInstance({
        ...credentials(),
        database: "master",
        attemptId: attemptRef.current ?? undefined,
      }),
    );
    if (!call.ok) return false;
    const res = call.value;
    const ms = call.ms;
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
    mark("catalog", { status: "running", attemptId: attemptRef.current ?? undefined });
    const call = await bounded("catalog", bridge.listDatabases());
    if (!call.ok) return false;
    const res = call.value;
    const ms = call.ms;
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
    mark("lock", { status: "running", attemptId: attemptRef.current ?? undefined });
    const started = Date.now();
    if (bridge.lockDatabase) {
      const call = await bounded(
        "lock",
        bridge.lockDatabase({ ...credentials(), database: config.database }),
      );
      if (!call.ok) return false;
      if (!call.value.ok) return failure("lock", call.value, Date.now() - started);
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

  /**
   * Final proof: the till's own pool inserts a probe row, reads it back and
   * rolls the transaction back. Signing in is not the same as being able to
   * write, so this stage is separate and never inferred from the one before.
   */
  const runWrite = async () => {
    mark("write", { status: "running", attemptId: attemptRef.current ?? undefined });
    const call = await bounded("write", verifyLocalWrite());
    if (!call.ok) return false;
    const res = call.value;
    const ms = call.ms;
    if (!res.ok)
      return failure(
        "write",
        {
          ok: false,
          code: res.code ?? null,
          hint: res.hint ?? null,
          error: `Database write verification failed — ${res.error ?? "unknown reason"}`,
        },
        ms,
      );
    mark("write", {
      status: "passed",
      ms,
      detail: `Wrote and rolled back a probe row in ${res.activeDb ?? config.database}`,
    });
    await sqlAdmin()
      ?.disconnect()
      .catch(() => {});
    return true;
  };

  const RUNNERS: Record<StepKey, () => Promise<boolean>> = {
    credentials: runCredentials,
    socket: runSocket,
    handshake: runHandshake,
    catalog: runCatalog,
    lock: runLock,
    write: runWrite,
  };

  /** Runs `key` and, unless retrying a single step, everything after it. */
  const advance = async (from: StepKey, only = false) => {
    // Synchronous lock: two clicks in one render must not start two runs.
    if (running || startingRef.current) return false;
    startingRef.current = true;
    const token = guard.start();
    const live = () => guard.isLive(token);
    const attemptId = newAttemptId();
    attemptRef.current = attemptId;
    traceAttempt(attemptId, from, "running");
    setRunning(true);
    try {
      const order = STEPS.map((s) => s.key);
      for (const key of order.slice(order.indexOf(from))) {
        if (!live()) return false;
        const ok = await RUNNERS[key]();
        if (!live() || !ok) return false;
        // The catalogue step hands control back so a database can be picked.
        if (only || key === "catalog") return true;
      }
      return true;
    } finally {
      startingRef.current = false;
      if (live()) {
        setRunning(false);
        if (attemptRef.current === attemptId) attemptRef.current = null;
      }
    }
  };

  const finish = async () => {
    // Lock, then prove the very same connection can actually write.
    const ok = await advance("lock");
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
                value={config.port || ""}
                placeholder="Automatic"
                onChange={(e) => set("port", Number(e.target.value) || 0)}
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <div className="flex items-center justify-between gap-3 rounded-md border p-3">
                <div className="space-y-0.5">
                  <Label htmlFor="sql-direct" className="text-sm">
                    Direct connection (server, port)
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Connects straight to the port above and never asks the SQL Server Browser
                    service to look up the instance. Recommended whenever the port is known.
                  </p>
                </div>
                <Switch
                  id="sql-direct"
                  checked={config.directConnect === true}
                  onCheckedChange={(v) => set("directConnect", v)}
                />
              </div>
              {config.directConnect && !resolvedPort() && (
                <p className="text-xs text-destructive">
                  Direct connection needs a port — enter one above (usually 1433).
                </p>
              )}
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
                        state.status === "failed" || state.status === "timed_out"
                          ? "text-xs text-destructive"
                          : "text-xs text-muted-foreground"
                      }
                    >
                      {state.error ?? state.detail ?? step.hint}
                    </p>
                    {(state.status === "failed" || state.status === "timed_out") && state.hint && (
                      <p className="text-xs text-muted-foreground">{state.hint}</p>
                    )}
                    {(state.status === "failed" || state.status === "timed_out") && !!state.attempts?.length && (
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
                     {(state.status === "failed" || state.status === "timed_out") &&
                       isDriverMissing(state) && (
                         <DriverInstallPanel onInstalled={() => void advance(step.key, true)} />
                       )}
                   </div>
                  {(state.status === "failed" || state.status === "timed_out") && (
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

        {savedLabel && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
            <p className="text-xs text-muted-foreground">
              This machine already has a saved connection:{" "}
              <span className="font-medium text-foreground">{savedLabel}</span>. It is reused on
              every start until it is removed.
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={resetting}
              onClick={() => void resetConnection()}
            >
              Remove saved connection
            </Button>
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {running ? (
              <Button type="button" variant="outline" onClick={stopRun}>
                <CircleSlash className="mr-2 h-4 w-4" />
                Stop
              </Button>
            ) : (
              <Button type="button" variant="outline" onClick={() => void advance("credentials")}>
                Run checks
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              disabled={resetting}
              onClick={() => void reconnectNow()}
              title="Close both pools and open the saved connection again — credentials are kept."
            >
              {resetting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plug className="mr-2 h-4 w-4" />
              )}
              Reconnect now
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={resetting}
              onClick={() => void resetConnection()}
              title={
                savedLabel
                  ? `Cancel anything running and delete the saved details for ${savedLabel}.`
                  : "Cancel anything running and clear the connection."
              }
            >
              {resetting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Eraser className="mr-2 h-4 w-4" />
              )}
              {savedLabel ? `Remove saved connection (${savedLabel})` : "Forget connection"}
            </Button>
          </div>
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
  if (status === "failed" || status === "timed_out")
    return <TriangleAlert className="mt-0.5 h-4 w-4 text-destructive" />;
  if (status === "cancelled") return <CircleSlash className="mt-0.5 h-4 w-4 text-muted-foreground" />;
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
