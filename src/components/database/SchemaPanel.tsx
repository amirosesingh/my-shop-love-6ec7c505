import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronRight,
  Cloud,
  Download,
  FileCode2,
  KeyRound,
  Loader2,
  RefreshCw,
  TriangleAlert,
  Wrench,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { localDb } from "@/lib/local-db";
import { sqlAdmin } from "@/lib/sql-admin";
import { fetchCentralSchema } from "@/lib/central-schema.functions";
import { COMPARE_TABLES, compareTableLabel } from "@/lib/data-compare";

type ColumnInfo = { name: string; type: string; present: boolean | null };
type TableStatus = {
  name: string;
  exists: boolean | null;
  columns: ColumnInfo[];
  missingColumns: string[];
  extraColumns: string[];
  columnCount: number | null;
};
type SchemaStatus = {
  ok: boolean;
  connected?: boolean;
  file?: string;
  text?: string;
  tables?: TableStatus[];
  unknownTables?: string[];
  warnings?: string[];
  error?: string;
};
type ApplyOutcome = { ok: boolean; lines: string[]; permission?: boolean };

const downloadText = (filename: string, text: string) => {
  const blob = new Blob([text], { type: "application/sql" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

const hasIssue = (t: TableStatus) => t.exists === false || t.missingColumns.length > 0;

/** Columns the sync engine adds locally but the central database never holds. */
const SYNC_ONLY_COLUMNS = new Set(["synced_at", "pending_sync", "sync_attempts", "sync_error"]);

/** Master-schema (SQL Server) type → central database (PostgreSQL) type. */
export function pgType(mssqlType: string): string {
  const up = String(mssqlType ?? "").toUpperCase();
  if (up.startsWith("UNIQUEIDENTIFIER")) return "uuid";
  if (up.startsWith("BIGINT")) return "bigint";
  if (up.startsWith("SMALLINT") || up.startsWith("TINYINT")) return "smallint";
  if (up.startsWith("INT")) return "integer";
  if (up.startsWith("BIT")) return "boolean";
  if (/^(DECIMAL|NUMERIC)/.test(up)) return up.toLowerCase().replace("decimal", "numeric");
  if (up.startsWith("MONEY")) return "numeric(19,4)";
  if (up.startsWith("FLOAT")) return "double precision";
  if (up.startsWith("REAL")) return "real";
  if (/^DATETIME/.test(up)) return "timestamptz";
  if (up.startsWith("DATE")) return "date";
  if (up.startsWith("TIME")) return "time";
  if (up.startsWith("VARBINARY")) return "bytea";
  return "text";
}

const q = (ident: string) => `"${ident.replace(/"/g, '""')}"`;

/**
 * Schema manager — one panel that lists every table and column the master
 * file defines, compares it live against the connected SQL Server and
 * repairs exactly the tables the operator picks. The table list is parsed
 * from database/schema.sql at runtime, so any table added in a future
 * update appears here automatically. Nothing runs on its own: applying
 * only ever happens from the confirm dialog, and every statement is
 * guarded (creates what is missing, never drops or rewrites anything).
 *
 * Two escalation paths live here too:
 *  - the operational login lacks CREATE/ALTER rights → "Repair with
 *    administrator login" replays the same guarded batches through a
 *    one-off administrator session;
 *  - the central database drifts → the Central schema card compares the
 *    synced tables and downloads a PostgreSQL repair script.
 */
export function SchemaPanel() {
  const [status, setStatus] = useState<SchemaStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [outcome, setOutcome] = useState<ApplyOutcome | null>(null);

  const bridge = localDb();
  const available = !!bridge?.schemaStatus && !!bridge?.applySchemaTables;

  const load = useCallback(async () => {
    const b = localDb();
    if (!b?.schemaStatus) {
      setError(
        b
          ? "Update the desktop app to use the schema manager."
          : "The schema manager is only available in the Windows desktop app.",
      );
      return;
    }
    const res = await b.schemaStatus();
    if (!res.ok) {
      setError(res.error ?? "The schema could not be read.");
      return;
    }
    setError(null);
    setStatus(res);
    // Pre-select everything that needs attention so one click repairs it.
    setSelected(new Set((res.tables ?? []).filter(hasIssue).map((t) => t.name)));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const tables = useMemo(() => status?.tables ?? [], [status]);
  const issueCount = tables.filter(hasIssue).length;
  const connected = status?.connected === true;

  const toggle = (set: ReadonlySet<string>, name: string) => {
    const next = new Set(set);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    return next;
  };

  const repair = async (names: string[]) => {
    const b = localDb();
    if (!b?.applySchemaTables || !names.length) return;
    setBusy(true);
    setOutcome(null);
    try {
      const res = await b.applySchemaTables(names);
      const lines: string[] = [];
      for (const e of res.errors ?? []) {
        lines.push(`${e.scope}: ${e.error ?? e.code ?? "failed"}`);
      }
      for (const u of res.unknownTables ?? []) {
        lines.push(`${u}: not found in the master schema file`);
      }
      const permission =
        res.permission === true || (res.errors ?? []).some((e) => e.permission === true);
      if (res.ok) {
        toast.success(`Repaired ${res.applied?.length ?? names.length} table(s)`);
        setOutcome({
          ok: true,
          lines: [`${res.batchCount ?? 0} statement batch(es) ran. Nothing existing was changed.`],
        });
      } else {
        toast.error(
          permission ? "The database login lacks permission" : "Some tables could not be repaired",
        );
        setOutcome({
          ok: false,
          permission,
          lines: lines.length ? lines : [res.error ?? "The repair could not finish."],
        });
      }
    } finally {
      setBusy(false);
      await load();
    }
  };

  const downloadFull = () => {
    if (!status?.text) return;
    downloadText("pos-local-sql-server-schema.sql", status.text);
    toast.success("Local SQL Server schema downloaded");
  };

  const downloadTable = async (name: string) => {
    const b = localDb();
    if (!b?.schemaTableSql) return;
    const res = await b.schemaTableSql([name]);
    if (!res.ok || !res.text) {
      toast.error(res.error ?? "SQL could not be prepared");
      return;
    }
    downloadText(`pos-local-sql-server-${name}.sql`, res.text);
  };

  return (
    <div className="space-y-3 rounded-md border border-border px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm">
            <FileCode2 className="h-4 w-4" />
            Local SQL Server schema manager
          </p>
          <p className="text-xs text-muted-foreground">
            Every table and column the app needs, compared with this machine&apos;s database.
            Repair one table or all of them — existing data is never touched. Tables added in
            future updates appear here automatically.
          </p>
        </div>
        <Button type="button" size="sm" variant="ghost" onClick={() => void load()}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {error && (
        <p className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 text-destructive" />
          {error}
        </p>
      )}

      {status && (
        <>
          <div className="rounded-md border border-border px-3 py-2 text-xs">
            <p className="break-all">
              <span className="text-muted-foreground">Master file</span>{" "}
              {status.file ?? "database/schema.sql"}
            </p>
            <p className="text-muted-foreground">
              Defines {tables.length} table{tables.length === 1 ? "" : "s"}
              {connected
                ? issueCount
                  ? ` · ${issueCount} need${issueCount === 1 ? "s" : ""} attention`
                  : " · database matches the master schema"
                : " · not connected, showing what the file defines"}
              {!!status.unknownTables?.length &&
                ` · ${status.unknownTables.length} extra table(s) only in this database`}
            </p>
          </div>

          {!connected && (
            <p className="rounded-md border border-border px-3 py-2 text-xs text-muted-foreground">
              Connect to the local database above to see what is actually on this machine and to
              repair it.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!issueCount}
              onClick={() => setSelected(new Set(tables.filter(hasIssue).map((t) => t.name)))}
            >
              Select all with issues
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={!selected.size}
              onClick={() => setSelected(new Set())}
            >
              Clear selection
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={downloadFull}>
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Download local SQL Server script
            </Button>
            <RepairDialog
               label={`Local SQL Server — Repair selected (${selected.size})`}
              title={`Repair ${selected.size} selected table(s)?`}
              disabled={!connected || busy || !selected.size}
              busy={busy}
              onConfirm={() => void repair([...selected])}
            />
            <RepairDialog
              label="Repair all"
              title="Repair every table?"
              disabled={!connected || busy || !tables.length}
              busy={busy}
              onConfirm={() => void repair(tables.map((t) => t.name))}
            />
            <AdminRepairDialog
              tables={[...selected]}
              disabled={!connected || busy || !selected.size}
              onDone={() => void load()}
            />
          </div>

          {outcome && (
            <div
              className={`space-y-1 rounded-md border px-3 py-2 text-xs ${
                outcome.ok
                  ? "border-emerald-500/40 bg-emerald-500/10"
                  : "border-destructive/40 bg-destructive/10"
              }`}
            >
              {outcome.lines.map((line, i) => (
                <p key={i}>{line}</p>
              ))}
              {outcome.permission && (
                <p className="font-medium">
                  This login may read and write data but cannot create or alter tables. Use
                  &quot;Repair with admin login&quot; above and sign in with a database
                  administrator account (for example sa) — the same guarded statements then run
                  once through that login.
                </p>
              )}
            </div>
          )}

          {!!status.warnings?.length && (
            <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
              <p className="font-medium">Master schema parser warnings</p>
              {status.warnings.map((warning) => (
                <p key={warning} className="text-muted-foreground">{warning}</p>
              ))}
            </div>
          )}

          <div className="max-h-96 overflow-auto rounded-md border border-border">
            {tables.map((t) => (
              <TableRow
                key={t.name}
                table={t}
                checked={selected.has(t.name)}
                expanded={expanded.has(t.name)}
                onCheck={() => setSelected((s) => toggle(s, t.name))}
                onExpand={() => setExpanded((s) => toggle(s, t.name))}
                onDownload={() => void downloadTable(t.name)}
              />
            ))}
          </div>

          {!!status.unknownTables?.length && (
            <p className="text-xs text-muted-foreground">
              Only in this database (not managed by the app): {status.unknownTables.join(", ")}
            </p>
          )}

          <CentralSchemaCard manifestTables={tables} />
        </>
      )}
    </div>
  );
}

function statusBadge(t: TableStatus) {
  if (t.exists === null) return { label: "Not checked", className: "text-muted-foreground" };
  if (t.exists === false)
    return {
      label: "Missing table",
      className: "border-destructive/40 bg-destructive/10 text-destructive",
    };
  if (t.missingColumns.length)
    return {
      label: `${t.missingColumns.length} column${t.missingColumns.length === 1 ? "" : "s"} missing`,
      className: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
    };
  if (t.extraColumns.length)
    return {
      label: `OK · ${t.extraColumns.length} extra`,
      className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    };
  return {
    label: "OK",
    className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  };
}

function TableRow({
  table,
  checked,
  expanded,
  onCheck,
  onExpand,
  onDownload,
}: {
  table: TableStatus;
  checked: boolean;
  expanded: boolean;
  onCheck: () => void;
  onExpand: () => void;
  onDownload: () => void;
}) {
  const badge = statusBadge(table);
  const missing = new Set(table.missingColumns.map((c) => c.toLowerCase()));
  return (
    <div className="border-b border-border last:border-b-0">
      <div className="flex items-center gap-2 px-2 py-1.5">
        <button
          type="button"
          onClick={onExpand}
          aria-label={`Show columns of ${table.name}`}
          className="text-muted-foreground hover:text-foreground"
        >
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
        <Checkbox checked={checked} onCheckedChange={onCheck} aria-label={`Select ${table.name}`} />
        <span className="min-w-0 flex-1 truncate text-xs font-medium">{table.name}</span>
        <span className="text-[11px] text-muted-foreground">
          {table.columnCount ?? table.columns.length} col
          {(table.columnCount ?? table.columns.length) === 1 ? "" : "s"}
        </span>
        <Badge variant="outline" className={`font-normal ${badge.className}`}>
          {badge.label}
        </Badge>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 px-2"
          title={`Download SQL for ${table.name}`}
          onClick={onDownload}
        >
          <Download className="h-3.5 w-3.5" />
        </Button>
      </div>
      {expanded && (
        <div className="space-y-1 px-8 pb-2">
          <div className="grid gap-x-4 sm:grid-cols-2">
            {table.columns.map((c) => {
              const isMissing = c.present === false || missing.has(c.name.toLowerCase());
              return (
                <p key={c.name} className="flex items-baseline justify-between gap-2 text-[11px]">
                  <span className={isMissing ? "font-medium text-destructive" : ""}>{c.name}</span>
                  <span className="text-muted-foreground">
                    {c.type}
                    {isMissing ? " · will be created" : ""}
                  </span>
                </p>
              );
            })}
          </div>
          {!!table.extraColumns.length && (
            <p className="text-[11px] text-muted-foreground">
              Only in this database: {table.extraColumns.join(", ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function RepairDialog({
  label,
  title,
  disabled,
  busy,
  onConfirm,
}: {
  label: string;
  title: string;
  disabled: boolean;
  busy: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" size="sm" disabled={disabled}>
          {busy ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Wrench className="mr-1.5 h-3.5 w-3.5" />
          )}
          {label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>
            This creates any missing tables and columns in the connected database. It never drops
            a table, never deletes rows and never rewrites existing records. Objects that already
            exist are left exactly as they are.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Repair</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * One-off administrator elevation for schema repair. The operational POS
 * login often has data rights but no CREATE/ALTER rights; here the operator
 * signs in with a database administrator login and the exact same guarded
 * master-schema batches for the selected tables replay through that session.
 * The admin session is closed the moment the repair finishes.
 */
function AdminRepairDialog({
  tables,
  disabled,
  onDone,
}: {
  tables: string[];
  disabled: boolean;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [server, setServer] = useState("");
  const [database, setDatabase] = useState("");
  const [auth, setAuth] = useState<"sql" | "windows">("sql");
  const [user, setUser] = useState("sa");
  const [password, setPassword] = useState("");
  const [result, setResult] = useState<string | null>(null);

  // Prefill from the live local connection once the dialog opens.
  useEffect(() => {
    if (!open) return;
    void (async () => {
      try {
        const st = await localDb()?.status?.();
        const s = st as { server?: string | null; database?: string | null } | undefined;
        if (s?.server && !server) setServer(String(s.server));
        if (s?.database && !database) setDatabase(String(s.database));
      } catch {
        /* prefill is best-effort */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const run = async () => {
    const bridge = sqlAdmin();
    if (!bridge?.repair) {
      toast.error("Update the desktop app to use administrator repair.");
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const res = await bridge.repair({
        credentials: {
          server,
          auth,
          user: auth === "sql" ? user : undefined,
          password: auth === "sql" ? password : undefined,
          encrypt: false,
          trustServerCertificate: true,
        },
        database,
        tables,
      });
      if (res.ok) {
        toast.success(`Administrator repair finished (${res.ran}/${res.total} statements)`);
        setResult(null);
        setOpen(false);
        onDone();
      } else {
        const msg =
          res.error ??
          (res.stage === "connect"
            ? "The administrator sign-in failed."
            : "The repair did not complete.");
        setResult(msg);
        toast.error(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline" disabled={disabled}>
          <KeyRound className="mr-1.5 h-3.5 w-3.5" />
          Repair with admin login
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Repair with administrator login</DialogTitle>
          <DialogDescription>
            Use this when repair reports &quot;permission denied&quot;. The selected tables&apos;
            guarded statements run once through the administrator login you enter here; the login
            is not saved and the session closes immediately afterwards.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="adm-server">Server</Label>
              <Input
                id="adm-server"
                value={server}
                onChange={(e) => setServer(e.target.value)}
                placeholder="localhost\SQLEXPRESS"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="adm-db">POS database</Label>
              <Input
                id="adm-db"
                value={database}
                onChange={(e) => setDatabase(e.target.value)}
                placeholder="POS_Branch_DB"
              />
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Sign in with</span>
            <Button
              type="button"
              size="sm"
              variant={auth === "sql" ? "default" : "outline"}
              onClick={() => setAuth("sql")}
            >
              SQL login
            </Button>
            <Button
              type="button"
              size="sm"
              variant={auth === "windows" ? "default" : "outline"}
              onClick={() => setAuth("windows")}
            >
              Windows user
            </Button>
          </div>
          {auth === "sql" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="adm-user">Login</Label>
                <Input id="adm-user" value={user} onChange={(e) => setUser(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="adm-pass">Password</Label>
                <Input
                  id="adm-pass"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {tables.length} table(s) selected: {tables.slice(0, 6).join(", ")}
            {tables.length > 6 ? `, +${tables.length - 6} more` : ""}
          </p>
          {result && (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs">
              {result}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button
            type="button"
            disabled={busy || !server.trim() || !database.trim() || !tables.length}
            onClick={() => void run()}
          >
            {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            Run administrator repair
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Central-schema drift check. The synced tables are compared against the
 * central database's own table/column list; anything missing is listed and a
 * ready-to-run PostgreSQL repair script can be downloaded. Types are derived
 * from the same master schema file, so one file drives both databases.
 */
function CentralSchemaCard({ manifestTables }: { manifestTables: TableStatus[] }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cloud, setCloud] = useState<Map<string, Set<string>> | null>(null);

  const manifestByName = useMemo(() => {
    const map = new Map<string, TableStatus>();
    for (const t of manifestTables) map.set(t.name.toLowerCase(), t);
    return map;
  }, [manifestTables]);

  const expected = useMemo(
    () => COMPARE_TABLES.filter((spec) => manifestByName.has(spec.table)),
    [manifestByName],
  );

  const check = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetchCentralSchema();
      if (!res.ok) {
        setError(res.error);
        setCloud(null);
        return;
      }
      const map = new Map<string, Set<string>>();
      for (const row of res.rows) {
        const key = row.table.toLowerCase();
        if (!map.has(key)) map.set(key, new Set());
        map.get(key)!.add(row.column.toLowerCase());
      }
      setCloud(map);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The central schema could not be read.");
      setCloud(null);
    } finally {
      setBusy(false);
    }
  };

  const drift = useMemo(() => {
    if (!cloud) return [];
    return expected.map((spec) => {
      const local = manifestByName.get(spec.table)!;
      const wanted = local.columns.filter((c) => !SYNC_ONLY_COLUMNS.has(c.name.toLowerCase()));
      const have = cloud.get(spec.table);
      if (!have) return { spec, missingTable: true, missingColumns: wanted.map((c) => c.name) };
      const missingColumns = wanted
        .filter((c) => !have.has(c.name.toLowerCase()))
        .map((c) => c.name);
      return { spec, missingTable: false, missingColumns };
    });
  }, [cloud, expected, manifestByName]);

  const driftCount = drift.filter((d) => d.missingTable || d.missingColumns.length).length;

  const downloadRepair = () => {
    if (!cloud) return;
    const missingTables = drift.filter((d) => d.missingTable).map((d) => d.spec.table);
    if (missingTables.length) {
      toast.error(
        `A complete secured migration is required for missing table(s): ${missingTables.join(", ")}. Use the authoritative central schema; a column-only repair cannot safely create policies and constraints.`,
      );
      return;
    }
    const lines: string[] = [
      "-- POS central schema repair",
      "-- Generated from the master schema file. Every statement is idempotent:",
      "-- safe to run repeatedly, never drops or rewrites existing data.",
      "-- Run once in the central project's SQL editor, then re-check here.",
      "",
    ];
    let statements = 0;
    for (const d of drift) {
      const local = manifestByName.get(d.spec.table)!;
      const wanted = local.columns.filter((c) => !SYNC_ONLY_COLUMNS.has(c.name.toLowerCase()));
      if (d.missingColumns.length) {
        for (const c of wanted) {
          if (!d.missingColumns.includes(c.name)) continue;
          lines.push(
            `alter table public.${q(d.spec.table)} add column if not exists ${q(c.name)} ${pgType(c.type)};`,
          );
          statements += 1;
        }
        lines.push("");
      }
    }
    if (!statements) {
      toast.success("Central database already matches — nothing to repair");
      return;
    }
    downloadText("pos-central-postgresql-column-repair.sql", lines.join("\n"));
    toast.success("Central PostgreSQL repair SQL downloaded");
  };

  return (
    <div className="space-y-2 rounded-md border border-border px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm">
            <Cloud className="h-4 w-4" />
            Central schema
          </p>
          <p className="text-xs text-muted-foreground">
            Compares the synced tables with the central database. If a table or column is missing
            there (the &quot;unable to sync&quot; errors), download the repair script and run it
            once in the external central project&apos;s PostgreSQL SQL editor. Never run it in SQL
            Server Management Studio.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {cloud && (
            <Button type="button" size="sm" variant="outline" onClick={downloadRepair}>
              <Download className="mr-1.5 h-3.5 w-3.5" />
               Download central PostgreSQL repair script
            </Button>
          )}
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void check()}>
            {busy ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            )}
            {cloud ? "Re-check" : "Check central schema"}
          </Button>
        </div>
      </div>

      {error && (
        <p className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 text-destructive" />
          {error}
        </p>
      )}

      {cloud && (
        <>
          <p className="text-xs text-muted-foreground">
            {driftCount
              ? `${driftCount} of ${drift.length} synced table(s) need attention in the central database.`
              : `All ${drift.length} synced tables match the central database.`}
          </p>
          <div className="max-h-64 overflow-auto rounded-md border border-border">
            {drift.map((d) => {
              const bad = d.missingTable || d.missingColumns.length > 0;
              return (
                <div
                  key={d.spec.table}
                  className="flex items-center gap-2 border-b border-border px-2 py-1.5 last:border-b-0"
                >
                  <span className="min-w-0 flex-1 truncate text-xs font-medium">
                    {compareTableLabel(d.spec.table)}
                    <span className="ml-1 text-muted-foreground">({d.spec.table})</span>
                  </span>
                  {d.missingTable ? (
                    <Badge
                      variant="outline"
                      className="border-destructive/40 bg-destructive/10 font-normal text-destructive"
                    >
                      Missing table
                    </Badge>
                  ) : d.missingColumns.length ? (
                    <Badge
                      variant="outline"
                      className="border-amber-500/40 bg-amber-500/10 font-normal text-amber-600 dark:text-amber-400"
                      title={d.missingColumns.join(", ")}
                    >
                      {d.missingColumns.length} column{d.missingColumns.length === 1 ? "" : "s"}{" "}
                      missing
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="border-emerald-500/40 bg-emerald-500/10 font-normal text-emerald-600 dark:text-emerald-400"
                    >
                      OK
                    </Badge>
                  )}
                  {bad && (
                    <span className="max-w-56 truncate text-[11px] text-muted-foreground">
                      {d.missingTable ? "will be created by the script" : d.missingColumns.join(", ")}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
