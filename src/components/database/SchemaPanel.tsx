import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronRight,
  Download,
  FileCode2,
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { localDb } from "@/lib/local-db";

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
  error?: string;
};
type ApplyOutcome = { ok: boolean; lines: string[] };

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

/**
 * Schema manager — one panel that lists every table and column the master
 * file defines, compares it live against the connected SQL Server and
 * repairs exactly the tables the operator picks. The table list is parsed
 * from database/schema.sql at runtime, so any table added in a future
 * update appears here automatically. Nothing runs on its own: applying
 * only ever happens from the confirm dialog, and every statement is
 * guarded (creates what is missing, never drops or rewrites anything).
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
      if (res.ok) {
        toast.success(`Repaired ${res.applied?.length ?? names.length} table(s)`);
        setOutcome({
          ok: true,
          lines: [`${res.batchCount ?? 0} statement batch(es) ran. Nothing existing was changed.`],
        });
      } else {
        toast.error("Some tables could not be repaired");
        setOutcome({
          ok: false,
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
    downloadText("pos-local-schema.sql", status.text);
    toast.success("Full schema SQL downloaded");
  };

  const downloadTable = async (name: string) => {
    const b = localDb();
    if (!b?.schemaTableSql) return;
    const res = await b.schemaTableSql([name]);
    if (!res.ok || !res.text) {
      toast.error(res.error ?? "SQL could not be prepared");
      return;
    }
    downloadText(`${name}.sql`, res.text);
  };

  return (
    <div className="space-y-3 rounded-md border border-border px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm">
            <FileCode2 className="h-4 w-4" />
            Schema manager
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
              Download full SQL
            </Button>
            <RepairDialog
              label={`Repair selected (${selected.size})`}
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
