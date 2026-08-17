import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FileCode2, Loader2, RefreshCw, TriangleAlert } from "lucide-react";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { localDb } from "@/lib/local-db";

type SchemaFile = { file?: string; tables: string[]; text: string };

/**
 * Master schema panel.
 *
 * Reading `database/schema.sql` is passive — it only ever shows what the file
 * would create. The file itself is executed exclusively when an operator
 * confirms the apply dialog, so no launch, reconnect or update can silently
 * rewrite a live database.
 */
export function SchemaPanel() {
  const [schema, setSchema] = useState<SchemaFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSql, setShowSql] = useState(false);
  const [busy, setBusy] = useState(false);
  const [applied, setApplied] = useState<{ ok: boolean; message: string } | null>(null);

  const load = async () => {
    const bridge = localDb();
    if (!bridge?.readSchema) {
      setError("The master schema file is only readable from the Windows desktop app.");
      return;
    }
    const res = await bridge.readSchema();
    if (!res.ok) {
      setError(res.error ?? "The schema file could not be read.");
      return;
    }
    setError(null);
    setSchema({ file: res.file, tables: res.tables ?? [], text: res.text ?? "" });
  };

  useEffect(() => {
    void load();
  }, []);

  const apply = async () => {
    const bridge = localDb();
    if (!bridge?.applySchema) return;
    setBusy(true);
    setApplied(null);
    try {
      const res = await bridge.applySchema();
      if (res.ok) {
        setApplied({ ok: true, message: "Schema applied. Missing tables and columns were created." });
        toast.success("Schema applied");
      } else {
        setApplied({ ok: false, message: res.error ?? "The schema could not be applied." });
        toast.error(res.error ?? "The schema could not be applied");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 rounded-md border border-border px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm">
            <FileCode2 className="h-4 w-4" />
            Database schema
          </p>
          <p className="text-xs text-muted-foreground">
            One master file defines every table. Nothing runs on its own — the database only
            changes when you apply it here.
          </p>
        </div>
        <Button type="button" size="sm" variant="ghost" onClick={() => void load()}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          Reload
        </Button>
      </div>

      {error && (
        <p className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 text-destructive" />
          {error}
        </p>
      )}

      {schema && (
        <>
          <div className="rounded-md border border-border px-3 py-2 text-xs">
            <p className="break-all">
              <span className="text-muted-foreground">File</span> {schema.file ?? "database/schema.sql"}
            </p>
            <p className="text-muted-foreground">
              Defines {schema.tables.length} table{schema.tables.length === 1 ? "" : "s"}.
            </p>
            {schema.tables.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {schema.tables.map((t) => (
                  <Badge key={t} variant="outline" className="font-normal">
                    {t}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setShowSql((v) => !v)}>
              {showSql ? "Hide SQL" : "Review SQL"}
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button type="button" size="sm" disabled={busy}>
                  {busy ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
                  Apply schema
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Apply the master schema?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This creates any missing tables and columns in the connected database. It never
                    drops a table, never deletes rows and never rewrites existing records. Objects
                    that already exist are left exactly as they are.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => void apply()}>Apply schema</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

          {applied && (
            <p
              className={`rounded-md border px-3 py-2 text-xs ${
                applied.ok
                  ? "border-emerald-500/40 bg-emerald-500/10"
                  : "border-destructive/40 bg-destructive/10"
              }`}
            >
              {applied.message}
            </p>
          )}

          {showSql && (
            <ScrollArea className="h-64 rounded-md border border-border">
              <pre className="p-3 text-[11px] leading-relaxed">{schema.text}</pre>
            </ScrollArea>
          )}
        </>
      )}
    </div>
  );
}
