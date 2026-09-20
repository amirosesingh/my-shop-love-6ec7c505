import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DatabaseHealthCard } from "./DatabaseHealthCard";
import { DatabaseJobProgress, type DatabaseJob } from "./DatabaseJobProgress";

type DatabaseState = { state?: string; enabled?: boolean; connected?: boolean; profile?: { database?: string } | null };
type SyncState = { phase?: string; running?: boolean; paused?: boolean; pending?: number; failed?: number; conflicts?: number; lastPushAt?: string | null; lastPullAt?: string | null };
type Failures = { failures?: unknown[]; conflictRows?: unknown[]; conflicts?: number };
type Result = Record<string, unknown>;
type DatabaseApi = {
  getState(): Promise<DatabaseState>; health(): Promise<Result>; schemaStatus(): Promise<Result>;
  backup(file: string): Promise<Result>; restore(file: string): Promise<Result>;
  subscribe(cb: (state: DatabaseState) => void): () => void;
};
type JobsApi = { getActive(): Promise<DatabaseJob | null>; subscribe(cb: (job: DatabaseJob | null) => void): () => void };
type SyncApi = {
  getStatus(): Promise<SyncState>; getFailures(): Promise<Failures>; runNow(options: Result): Promise<Result>;
  pause(): Promise<Result>; resume(): Promise<Result>; reconcile(options: Result): Promise<Result>;
  subscribe(cb: (state: SyncState) => void): () => void;
};
const shell = () => window.pos as unknown as { database?: DatabaseApi; jobs?: JobsApi; sync?: SyncApi };
const when = (value?: string | null) => value ? new Date(value).toLocaleString() : "Never";
const label = (value?: string) => (value ?? "idle").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

export function LocalDatabaseOperations() {
  const [state, setState] = useState<DatabaseState>({});
  const [health, setHealth] = useState<Result>({});
  const [schema, setSchema] = useState<Result>({});
  const [job, setJob] = useState<DatabaseJob | null>(null);
  const [sync, setSync] = useState<SyncState>({});
  const [failures, setFailures] = useState<Failures>({});
  const [file, setFile] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const api = shell();
    const requests = await Promise.allSettled([
      api.database?.getState(), api.database?.health(), api.database?.schemaStatus(),
      api.jobs?.getActive(), api.sync?.getStatus(), api.sync?.getFailures(),
    ]);
    if (requests[0].status === "fulfilled" && requests[0].value) setState(requests[0].value as DatabaseState);
    if (requests[1].status === "fulfilled" && requests[1].value) setHealth(requests[1].value as Result);
    if (requests[2].status === "fulfilled" && requests[2].value) setSchema(requests[2].value as Result);
    if (requests[3].status === "fulfilled") setJob((requests[3].value as DatabaseJob | null | undefined) ?? null);
    if (requests[4].status === "fulfilled" && requests[4].value) setSync(requests[4].value as SyncState);
    if (requests[5].status === "fulfilled" && requests[5].value) setFailures(requests[5].value as Failures);
  }, []);

  useEffect(() => {
    void refresh();
    const api = shell();
    const unsubscribe = [api.database?.subscribe?.(setState), api.jobs?.subscribe?.(setJob), api.sync?.subscribe?.(setSync)].filter(Boolean) as Array<() => void>;
    return () => unsubscribe.forEach((stop) => stop());
  }, [refresh]);

  const run = async (success: string, work: () => Promise<Result>) => {
    if (busy) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      const result = await work();
      if (result.ok === false) throw new Error(String(result.error ?? "The operation did not complete."));
      const differences = Array.isArray(result.differences) ? result.differences.length : 0;
      setMessage(differences ? `${success} ${differences} difference${differences === 1 ? " remains" : "s remain"}.` : success);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally { setBusy(false); }
  };

  const failureCount = failures.failures?.length ?? 0;
  const conflictCount = Number(failures.conflicts ?? failures.conflictRows?.length ?? sync.conflicts ?? 0);
  if (state.state === "disabled" || state.enabled === false) return null;
  return (
    <div className="space-y-3">
      <DatabaseHealthCard state={state} health={health} schema={schema} />
      <Card>
        <CardHeader><CardTitle className="text-base">Database jobs and synchronization</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <DatabaseJobProgress job={job} />
          <div className="grid gap-3 rounded-md border p-3 text-sm sm:grid-cols-2 xl:grid-cols-5">
            <div><div className="text-xs text-muted-foreground">Phase</div><div>{sync.paused ? "Paused" : label(sync.phase)}</div></div>
            <div><div className="text-xs text-muted-foreground">Waiting</div><div>{Number(sync.pending ?? 0).toLocaleString()}</div></div>
            <div><div className="text-xs text-muted-foreground">Failures</div><div>{failureCount || Number(sync.failed ?? 0)}</div></div>
            <div><div className="text-xs text-muted-foreground">Conflicts</div><div>{conflictCount}</div></div>
            <div><div className="text-xs text-muted-foreground">Last completed</div><div>{when([sync.lastPushAt, sync.lastPullAt].filter(Boolean).sort().at(-1))}</div></div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy || !state.connected || sync.running} onClick={() => run("Synchronization completed.", () => shell().sync!.runNow({ batchSize: 500 }))}>Sync now</Button>
            <Button variant="outline" disabled={busy || !!sync.paused} onClick={() => run("Synchronization paused.", () => shell().sync!.pause())}>Pause</Button>
            <Button variant="outline" disabled={busy || !sync.paused} onClick={() => run("Synchronization resumed.", () => shell().sync!.resume())}>Resume</Button>
            <Button variant="outline" disabled={busy || !state.connected} onClick={() => run("Reconciliation completed.", () => shell().sync!.reconcile({}))}>Reconcile</Button>
            <Button variant="ghost" disabled={busy} onClick={() => void refresh()}>Refresh</Button>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Backup and recovery</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Input aria-label="SQL Server backup file" placeholder="C:\\Backups\\POS_LOCAL.bak" value={file} onChange={(event) => setFile(event.target.value)} />
          <p className="text-xs text-muted-foreground">Enter a path that the SQL Server service account can read and write.</p>
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy || !file.trim() || !state.connected} onClick={() => run("Backup created.", () => shell().database!.backup(file.trim()))}>Create backup</Button>
            <Button variant="destructive" disabled={busy || !file.trim()} onClick={() => run("Backup restored and database revalidated.", () => shell().database!.restore(file.trim()))}>Restore backup</Button>
          </div>
          {message ? <p className="rounded-md bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-400" role="status">{message}</p> : null}
          {error ? <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive" role="alert">{error}</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}
