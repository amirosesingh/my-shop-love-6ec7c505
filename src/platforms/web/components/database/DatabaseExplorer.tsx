import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronRight,
  Database,
  Loader2,
  Play,
  Plug,
  PlugZap,
  RefreshCw,
  Table2,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { scanLocalInstances } from "@/core/local-db/local-db";
import {
  checkReadOnly,
  hasSqlAdmin,
  sqlAdmin,
  type SqlAdminCredentials,
  type SqlAdminFailure,
  type SqlColumn,
  type SqlDatabase,
  type SqlTable,
} from "@/lib/sql-admin";

type Diagnostic = { ok: boolean; text: string; hint?: string | null };

const defaultCredentials: SqlAdminCredentials = {
  server: "localhost\\SQLEXPRESS",
  database: "master",
  port: 1433,
  auth: "windows",
  user: "",
  password: "",
  encrypt: false,
  trustServerCertificate: true,
};

const failText = (res: SqlAdminFailure) =>
  `${res.code ? `${res.code}: ` : ""}${res.error ?? "Unknown database error"}`;

/**
 * SSMS-style browser for the local Microsoft SQL Server: connect to an
 * instance, discover its databases, expand a table to load its columns, and
 * run read-only queries. Everything crosses IPC into the desktop main process.
 */
export function DatabaseExplorer() {
  const available = hasSqlAdmin();
  const [creds, setCreds] = useState<SqlAdminCredentials>(defaultCredentials);
  const [targets, setTargets] = useState<string[]>([]);
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [serverName, setServerName] = useState<string | null>(null);
  const [databases, setDatabases] = useState<SqlDatabase[]>([]);
  const [activeDb, setActiveDb] = useState<string>("");
  const [tables, setTables] = useState<SqlTable[]>([]);
  const [loadingTables, setLoadingTables] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, SqlColumn[] | "loading">>({});
  const [diagnostic, setDiagnostic] = useState<Diagnostic | null>(null);
  const [query, setQuery] = useState("SELECT TOP 100 * FROM sys.tables");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{
    columns: string[];
    rows: Record<string, unknown>[];
    rowCount: number;
    truncated: boolean;
    elapsedMs: number;
  } | null>(null);

  // The desktop process refuses every administration call until an
  // administrator unlocks it here, so the screen asks for that first.
  const [adminUnlocked, setAdminUnlocked] = useState<boolean | null>(null);
  const [adminUser, setAdminUser] = useState("");
  const [adminPin, setAdminPin] = useState("");
  const [unlocking, setUnlocking] = useState(false);

  useEffect(() => {
    const bridge = sqlAdmin();
    if (!bridge) return;
    void bridge
      .adminStatus?.()
      .then((s) => setAdminUnlocked(Boolean(s?.unlocked)))
      .catch(() => setAdminUnlocked(false));
  }, []);

  const unlockAdmin = async () => {
    const bridge = sqlAdmin();
    if (!bridge?.unlock) return;
    setUnlocking(true);
    try {
      const res = await bridge.unlock(adminUser.trim(), adminPin);
      setAdminPin("");
      if (res.ok) {
        setAdminUnlocked(true);
        toast.success("Database administration unlocked");
      } else {
        toast.error(res.error ?? "That sign-in was not accepted");
      }
    } finally {
      setUnlocking(false);
    }
  };

  /* Restore the live session when the page is re-opened mid-session. */
  useEffect(() => {
    const bridge = sqlAdmin();
    if (!bridge || adminUnlocked !== true) return;
    void bridge.status().then((s) => {
      if (!s.connected) return;
      setConnected(true);
      setServerName(s.serverName);
      setActiveDb(s.database ?? "");
      setCreds((c) => ({ ...c, server: s.server ?? c.server, auth: s.auth ?? c.auth }));
      void bridge.listDatabases().then((res) => {
        if (res.ok) setDatabases(res.databases);
      });
    });
  }, [adminUnlocked]);

  const scan = useCallback(async () => {
    const res = await scanLocalInstances();
    setTargets(res.targets ?? []);
    if (!res.targets?.length) toast.message(res.hint ?? "No SQL Server instance answered");
  }, []);

  const loadTables = useCallback(async (dbName: string) => {
    const bridge = sqlAdmin();
    if (!bridge || !dbName) return;
    setLoadingTables(true);
    setExpanded({});
    try {
      const res = await bridge.getTables(dbName);
      if (res.ok) {
        setTables(res.tables);
      } else {
        setTables([]);
        setDiagnostic({ ok: false, text: failText(res), hint: res.hint });
      }
    } finally {
      setLoadingTables(false);
    }
  }, []);

  const connect = async () => {
    const bridge = sqlAdmin();
    if (!bridge) return;
    setConnecting(true);
    setDiagnostic(null);
    try {
      const res = await bridge.connectInstance({ ...creds, database: "master" });
      if (!res.ok) {
        setConnected(false);
        setDiagnostic({ ok: false, text: failText(res), hint: res.hint });
        toast.error(res.error ?? "Could not connect");
        return;
      }
      setConnected(true);
      setServerName(res.serverName);
      setDatabases(res.databases);
      setDiagnostic({
        ok: true,
        text: `Connected to ${res.serverName ?? creds.server} — ${res.databases.length} online database(s).`,
        hint: res.usedTrustFallback
          ? "The server's certificate is self-signed, so the connection was retried with 'trust server certificate' on."
          : null,
      });
      const preferred =
        res.databases.find((d) => /pos/i.test(d.name))?.name ?? res.databases[0]?.name ?? "";
      setActiveDb(preferred);
      if (preferred) await loadTables(preferred);
      toast.success("Connected");
    } finally {
      setConnecting(false);
    }
  };

  const disconnect = async () => {
    await sqlAdmin()?.disconnect();
    setConnected(false);
    setDatabases([]);
    setTables([]);
    setExpanded({});
    setActiveDb("");
    setResult(null);
    setDiagnostic(null);
  };

  const pickDatabase = async (name: string) => {
    setActiveDb(name);
    setResult(null);
    await loadTables(name);
  };

  /** Columns are only fetched when a table node is opened. */
  const toggleTable = async (table: SqlTable) => {
    const key = `${table.schema}.${table.name}`;
    if (expanded[key]) {
      setExpanded(({ [key]: _drop, ...rest }) => rest);
      return;
    }
    setExpanded((e) => ({ ...e, [key]: "loading" }));
    const res = await sqlAdmin()?.getTableColumns(activeDb, table.name, table.schema);
    if (res?.ok) setExpanded((e) => ({ ...e, [key]: res.columns }));
    else {
      setExpanded(({ [key]: _drop, ...rest }) => rest);
      if (res) setDiagnostic({ ok: false, text: failText(res), hint: res.hint });
    }
  };

  const run = async () => {
    const problem = checkReadOnly(query);
    if (problem) {
      toast.error(problem);
      return;
    }
    setRunning(true);
    try {
      const res = await sqlAdmin()!.executeQuery(activeDb, query);
      if (!res.ok) {
        setResult(null);
        setDiagnostic({ ok: false, text: failText(res), hint: res.hint });
        toast.error(res.error ?? "Query failed");
        return;
      }
      setResult(res);
      setDiagnostic(null);
    } finally {
      setRunning(false);
    }
  };

  const serverOptions = useMemo(
    () => Array.from(new Set([creds.server, ...targets].filter(Boolean))),
    [creds.server, targets],
  );

  if (!available) {
    return (
      <div className="rounded-md border border-border px-4 py-3">
        <p className="text-sm font-medium">Database explorer</p>
        <p className="text-xs text-muted-foreground">
          Browsing a local Microsoft SQL Server is only possible from the Windows desktop app. In a
          browser there is no local instance to reach.
        </p>
      </div>
    );
  }

  if (adminUnlocked !== true) {
    return (
      <div className="max-w-sm space-y-3 rounded-md border border-border p-4">
        <p className="text-sm font-medium">Administrator sign-in required</p>
        <p className="text-xs text-muted-foreground">
          This terminal keeps its database tools locked until an administrator signs in here with
          their own username and PIN. The sign-in lasts fifteen minutes and is forgotten when the
          app closes.
        </p>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Username</Label>
          <Input
            value={adminUser}
            autoComplete="off"
            onChange={(e) => setAdminUser(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">PIN</Label>
          <Input
            type="password"
            value={adminPin}
            autoComplete="off"
            onChange={(e) => setAdminPin(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void unlockAdmin();
            }}
          />
        </div>
        <Button
          type="button"
          size="sm"
          disabled={unlocking || !adminUser.trim() || !adminPin}
          onClick={() => void unlockAdmin()}
        >
          Unlock
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
      {/* ---------------- connection + object tree ---------------- */}
      <div className="space-y-3">
        <div className="space-y-3 rounded-md border border-border p-3">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-2 text-sm font-medium">
              <Database className="size-4" /> Connection
            </p>
            <Button type="button" size="sm" variant="ghost" onClick={() => void scan()}>
              <Zap className="size-3.5" /> Scan
            </Button>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Server / instance</Label>
            <Input
              list="sqladmin-targets"
              value={creds.server}
              placeholder="localhost\SQLEXPRESS"
              onChange={(e) => setCreds((c) => ({ ...c, server: e.target.value }))}
            />
            <datalist id="sqladmin-targets">
              {serverOptions.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Port</Label>
              <Input
                type="number"
                min={1}
                max={65535}
                value={creds.port ?? 1433}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  setCreds((c) => ({
                    ...c,
                    port: Number.isFinite(next) && next > 0 && next <= 65535 ? next : 1433,
                  }));
                }}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Authentication</Label>
              <Select
                value={creds.auth}
                onValueChange={(v) =>
                  setCreds((c) => ({ ...c, auth: v as SqlAdminCredentials["auth"] }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="windows">Windows account</SelectItem>
                  <SelectItem value="sql">SQL Server login</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Windows auth signs in as the logged-on user — no credentials shown. */}
          {creds.auth === "sql" && (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Login</Label>
                <Input
                  value={creds.user ?? ""}
                  onChange={(e) => setCreds((c) => ({ ...c, user: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Password</Label>
                <Input
                  type="password"
                  value={creds.password ?? ""}
                  onChange={(e) => setCreds((c) => ({ ...c, password: e.target.value }))}
                />
              </div>
            </div>
          )}

          <div className="space-y-2 rounded-md bg-muted/40 p-2">
            <label className="flex items-center justify-between text-xs">
              Encrypt connection (TLS)
              <Switch
                checked={!!creds.encrypt}
                onCheckedChange={(v) => setCreds((c) => ({ ...c, encrypt: v }))}
              />
            </label>
            <label className="flex items-center justify-between text-xs">
              Trust server certificate
              <Switch
                checked={creds.trustServerCertificate !== false}
                onCheckedChange={(v) => setCreds((c) => ({ ...c, trustServerCertificate: v }))}
              />
            </label>
          </div>

          <div className="flex gap-2">
            <Button size="sm" disabled={connecting} onClick={() => void connect()}>
              {connecting ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Plug className="size-3.5" />
              )}
              {connected ? "Reconnect" : "Connect"}
            </Button>
            {connected && (
              <Button size="sm" variant="outline" onClick={() => void disconnect()}>
                <PlugZap className="size-3.5" /> Disconnect
              </Button>
            )}
          </div>

          {diagnostic && (
            <div
              className={`space-y-1 rounded-md border px-2 py-1.5 text-xs ${
                diagnostic.ok
                  ? "border-emerald-500/40 bg-emerald-500/10"
                  : "border-destructive/40 bg-destructive/10"
              }`}
            >
              <p>{diagnostic.text}</p>
              {diagnostic.hint && <p className="text-muted-foreground">{diagnostic.hint}</p>}
            </div>
          )}
        </div>

        {connected && (
          <div className="space-y-2 rounded-md border border-border p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Object explorer</p>
              <Button
                size="sm"
                variant="ghost"
                disabled={!activeDb || loadingTables}
                onClick={() => void loadTables(activeDb)}
              >
                <RefreshCw className={`size-3.5 ${loadingTables ? "animate-spin" : ""}`} />
              </Button>
            </div>
            <Select value={activeDb} onValueChange={(v) => void pickDatabase(v)}>
              <SelectTrigger>
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

            <div className="max-h-[24rem] overflow-auto rounded-md border border-border text-xs">
              {loadingTables ? (
                <p className="px-2 py-3 text-muted-foreground">Loading tables…</p>
              ) : tables.length === 0 ? (
                <p className="px-2 py-3 text-muted-foreground">No tables in this database.</p>
              ) : (
                tables.map((t) => {
                  const key = `${t.schema}.${t.name}`;
                  const cols = expanded[key];
                  return (
                    <div key={key} className="border-b border-border last:border-b-0">
                      <button
                        type="button"
                        className="flex w-full items-center gap-1 px-2 py-1.5 text-left hover:bg-muted/50"
                        onClick={() => void toggleTable(t)}
                      >
                        {cols ? (
                          <ChevronDown className="size-3.5 shrink-0" />
                        ) : (
                          <ChevronRight className="size-3.5 shrink-0" />
                        )}
                        <Table2 className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate">
                          {t.schema}.{t.name}
                        </span>
                        {t.type === "view" && (
                          <span className="ml-auto text-[10px] text-muted-foreground">view</span>
                        )}
                      </button>
                      {cols === "loading" && (
                        <p className="px-7 pb-1.5 text-muted-foreground">Loading columns…</p>
                      )}
                      {Array.isArray(cols) &&
                        cols.map((c) => (
                          <p
                            key={c.name}
                            className="flex justify-between gap-2 px-7 py-0.5 text-muted-foreground"
                          >
                            <span className="truncate">{c.name}</span>
                            <span className="shrink-0">
                              {c.type}
                              {c.length ? `(${c.length})` : ""}
                              {c.nullable ? "" : " ·not null"}
                            </span>
                          </p>
                        ))}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* ---------------- read-only query editor ---------------- */}
      <div className="space-y-3 rounded-md border border-border p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium">Query editor</p>
            <p className="text-xs text-muted-foreground">
              Read-only: a single SELECT statement against{" "}
              {activeDb ? <span className="font-medium">{activeDb}</span> : "the chosen database"}.
              Anything that would change data or schema is refused.
            </p>
          </div>
          <Button size="sm" disabled={!connected || !activeDb || running} onClick={() => void run()}>
            {running ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
            Run
          </Button>
        </div>

        <Textarea
          className="min-h-[8rem] font-mono text-xs"
          spellCheck={false}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        {result && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              {result.rowCount} row(s) in {result.elapsedMs} ms
              {result.truncated ? " · showing the first 1000" : ""}
              {serverName ? ` · ${serverName}` : ""}
            </p>
            <div className="max-h-[26rem] overflow-auto rounded-md border border-border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted text-muted-foreground">
                  <tr>
                    {result.columns.map((c) => (
                      <th key={c} className="whitespace-nowrap px-2 py-1 text-left font-medium">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row, i) => (
                    <tr key={i} className="border-t border-border">
                      {result.columns.map((c) => (
                        <td key={c} className="max-w-[18rem] truncate px-2 py-1">
                          {row[c] === null || row[c] === undefined ? (
                            <span className="text-muted-foreground">NULL</span>
                          ) : (
                            String(row[c])
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
