/**
 * Setup / health check.
 *
 * Answers three questions in one place: is each database reachable, what is
 * each one missing against the schema this app version expects, and what do I
 * run to fix it. Cloud and local results never share a file — one versioned
 * `.sql` per environment, each recorded so a later scan shows only new gaps.
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Cloud, Database, Download, Loader2, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchCentralSchema } from "@/lib/central-schema.functions";
import { actualFromRows, computeCentralDrift } from "@/lib/central-drift";
import { hasLocalDb, localDb } from "@/lib/local-db";
import {
  downloadMigration,
  generateMigration,
  loadMigrations,
  markApplied,
  newGaps,
  reconcileApplied,
  type MigrationFile,
  type SchemaEnvironment,
  type SchemaGap,
} from "@/lib/schema-health";

type Reach = "unknown" | "ok" | "unreachable";

export function SchemaHealthPanel() {
  const [gaps, setGaps] = useState<SchemaGap[]>([]);
  const [files, setFiles] = useState<MigrationFile[]>([]);
  const [cloudReach, setCloudReach] = useState<Reach>("unknown");
  const [localReach, setLocalReach] = useState<Reach>("unknown");
  const [busy, setBusy] = useState(false);
  const [scannedAt, setScannedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setFiles(loadMigrations()), []);

  const scan = useCallback(async () => {
    setBusy(true);
    setError(null);
    const found: SchemaGap[] = [];

    try {
      const res = await fetchCentralSchema();
      if (res.ok) {
        setCloudReach("ok");
        for (const row of computeCentralDrift(actualFromRows(res.rows))) {
          const columns = row.missingColumns.map((c) => c.name);
          if (row.missingTable || columns.length) {
            found.push({
              environment: "cloud",
              table: row.table,
              columns,
              missingTable: row.missingTable,
            });
          }
        }
      } else {
        setCloudReach("unreachable");
        setError(res.error);
      }
    } catch (err) {
      setCloudReach("unreachable");
      setError(err instanceof Error ? err.message : "The central database could not be read.");
    }

    const bridge = localDb();
    if (hasLocalDb() && bridge?.schemaStatus) {
      try {
        const res = await bridge.schemaStatus();
        setLocalReach(res.ok && res.connected ? "ok" : "unreachable");
        for (const table of res.tables ?? []) {
          if (table.exists === false) {
            found.push({ environment: "local", table: table.name, columns: [], missingTable: true });
          } else if (table.missingColumns.length) {
            found.push({
              environment: "local",
              table: table.name,
              columns: table.missingColumns,
              missingTable: false,
            });
          }
        }
      } catch {
        setLocalReach("unreachable");
      }
    }

    setGaps(found);
    setFiles(reconcileApplied(found));
    setScannedAt(new Date().toLocaleString());
    setBusy(false);
  }, []);

  useEffect(() => {
    void scan();
  }, [scan]);

  const open = newGaps(gaps, files);
  const cloudGaps = open.filter((g) => g.environment === "cloud");
  const localGaps = open.filter((g) => g.environment === "local");

  const generate = (environment: SchemaEnvironment, scoped: SchemaGap[]) => {
    const file = generateMigration(environment, scoped);
    if (!file) return;
    setFiles(loadMigrations());
    downloadMigration(file);
    toast.success(`${file.filename} downloaded`);
  };

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" disabled={busy} onClick={() => void scan()}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          Run health check
        </Button>
        <p className="text-xs text-muted-foreground">
          {scannedAt ? `Last checked ${scannedAt}` : "Checking…"}
        </p>
      </div>

      {error && (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      )}

      <EnvironmentCard
        icon={<Cloud className="size-4" />}
        title="Central (cloud) database"
        reach={cloudReach}
        gaps={cloudGaps}
        note="Run this in your Supabase SQL editor."
        onGenerate={() => generate("cloud", cloudGaps)}
      />

      <EnvironmentCard
        icon={<Database className="size-4" />}
        title="Local PC database"
        reach={hasLocalDb() ? localReach : "unknown"}
        gaps={localGaps}
        note="Run this in your local database client."
        disabledReason={hasLocalDb() ? null : "This device has no local database."}
        onGenerate={() => generate("local", localGaps)}
      />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Migration files</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {files.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No migration file has been generated on this device yet.
            </p>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-1 font-medium">File</th>
                  <th className="py-1 font-medium">Target</th>
                  <th className="py-1 font-medium">Generated</th>
                  <th className="py-1 font-medium">Applied</th>
                  <th className="py-1" />
                </tr>
              </thead>
              <tbody>
                {[...files].reverse().map((file) => (
                  <tr key={file.id} className="border-t border-border">
                    <td className="py-1.5 font-medium">{file.filename}</td>
                    <td className="py-1.5">
                      {file.environment === "cloud" ? "Supabase cloud" : "Local PC"}
                    </td>
                    <td className="py-1.5 text-muted-foreground">
                      {new Date(file.generatedAt).toLocaleString()}
                    </td>
                    <td className="py-1.5">
                      {file.appliedAt ? (
                        <Badge variant="outline" className="text-success">
                          {new Date(file.appliedAt).toLocaleDateString()}
                        </Badge>
                      ) : (
                        <Badge variant="outline">Not yet</Badge>
                      )}
                    </td>
                    <td className="py-1.5">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-[11px]"
                          onClick={() => downloadMigration(file)}
                        >
                          <Download className="size-3" /> Download
                        </Button>
                        {!file.appliedAt && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 px-2 text-[11px]"
                            onClick={() => setFiles(markApplied(file.id))}
                          >
                            Mark as applied
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function EnvironmentCard({
  icon,
  title,
  reach,
  gaps,
  note,
  disabledReason,
  onGenerate,
}: {
  icon: React.ReactNode;
  title: string;
  reach: Reach;
  gaps: SchemaGap[];
  note: string;
  disabledReason?: string | null;
  onGenerate: () => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          {icon} {title}
          <Badge
            variant="outline"
            className={
              reach === "ok"
                ? "text-success"
                : reach === "unreachable"
                  ? "text-destructive"
                  : "text-muted-foreground"
            }
          >
            {reach === "ok" ? "Reachable" : reach === "unreachable" ? "Not reachable" : "Unknown"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {disabledReason ? (
          <p className="text-xs text-muted-foreground">{disabledReason}</p>
        ) : gaps.length === 0 ? (
          <p className="flex items-center gap-1.5 text-xs text-success">
            <CheckCircle2 className="size-3.5" /> Nothing new is missing here.
          </p>
        ) : (
          <>
            <ul className="space-y-1 text-xs">
              {gaps.map((gap) => (
                <li key={`${gap.table}-${gap.columns.join(",")}`} className="flex flex-wrap gap-2">
                  <span className="font-medium">{gap.table}</span>
                  <span className="text-muted-foreground">
                    {gap.missingTable ? "table missing" : `missing: ${gap.columns.join(", ")}`}
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={onGenerate}>
                <Download className="size-4" /> Generate migration file
              </Button>
              <span className="text-xs text-muted-foreground">{note}</span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
