import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

type Profile = {
  host: string; port: number; database: string; authMode: "windows" | "sql";
  username: string; password: string; encrypt: boolean; trustServerCertificate: boolean;
  connectionTimeoutMs: number; requestTimeoutMs: number; retentionDays: number;
};
type DbState = { state: string; enabled: boolean; configured: boolean; connected: boolean; profile?: Partial<Profile> | null; detail?: { error?: string } | null };
type DatabaseApi = {
  getState(): Promise<DbState>; setEnabled(value: boolean): Promise<DbState>;
  testServer(profile: Profile): Promise<Record<string, unknown>>;
  listDatabases(profile: Profile): Promise<{ ok: boolean; databases?: Array<{ name: string; state_desc: string; compatibility_level: number }> ; error?: string }>;
  validateDatabase(profile: Profile): Promise<Record<string, unknown>>;
  migrateDatabase(profile: Profile): Promise<Record<string, unknown>>;
  saveAndConnect(profile: Profile): Promise<Record<string, unknown>>;
  removeConfiguration(): Promise<DbState>;
  subscribe(cb: (state: DbState) => void): () => void;
};
const api = () => (window.pos as unknown as { database?: DatabaseApi })?.database;
const initial: Profile = { host: "127.0.0.1", port: 1433, database: "", authMode: "windows", username: "", password: "", encrypt: true, trustServerCertificate: true, connectionTimeoutMs: 15000, requestTimeoutMs: 30000, retentionDays: 90 };
const steps = ["Mode", "Server", "Authentication", "Test", "Database", "Validate", "Save"];

export function LocalDatabaseWizard() {
  const [state, setState] = useState<DbState>({ state: "disabled", enabled: false, configured: false, connected: false });
  const [profile, setProfile] = useState<Profile>(initial);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [databases, setDatabases] = useState<Array<{ name: string; state_desc: string; compatibility_level: number }>>([]);
  const [search, setSearch] = useState("");
  useEffect(() => {
    const database = api();
    void database?.getState().then((next) => { setState(next); if (next.profile) setProfile((old) => ({ ...old, ...next.profile, password: "" })); });
    return database?.subscribe?.(setState);
  }, []);
  const shown = useMemo(() => databases.filter((item) => item.name.toLowerCase().includes(search.toLowerCase())), [databases, search]);
  const run = async (work: () => Promise<Record<string, unknown>>) => {
    if (busy) return;
    setBusy(true); setResult(null);
    try { setResult(await work()); }
    catch (error) { setResult({ ok: false, error: error instanceof Error ? error.message : String(error) }); }
    finally { setBusy(false); }
  };
  const ok = result?.ok === true;

  return <Card className="w-full">
    <CardHeader><CardTitle className="text-base">Local Microsoft SQL Server</CardTitle><CardDescription>Windows Electron only. Connections use the entered hostname and TCP port.</CardDescription></CardHeader>
    <CardContent className="space-y-4">
      <ol className="grid grid-cols-2 gap-1 text-center text-[11px] sm:grid-cols-4 xl:grid-cols-7" aria-label="Database setup steps">{steps.map((name, index) => <li key={name} className={index === step ? "font-semibold text-primary" : "text-muted-foreground"} aria-current={index === step ? "step" : undefined}>{index + 1}. {name}</li>)}</ol>
      <div className="max-h-[calc(100vh-240px)] min-h-48 overflow-y-auto rounded-md border p-4">
        {step === 0 && <div className="flex items-center justify-between gap-4"><div><Label htmlFor="local-db-enabled">Use local Microsoft SQL Server</Label><p className="text-sm text-muted-foreground">{state.enabled ? state.connected ? "Connected" : "Setup or connection check required" : "Central Online mode"}</p></div><Switch id="local-db-enabled" checked={state.enabled} onCheckedChange={(enabled) => void api()?.setEnabled(enabled).then((next) => { setState(next); if (enabled) setStep(1); })} /></div>}
        {step === 1 && <div className="grid gap-3 sm:grid-cols-2"><Field label="Server hostname or IP"><Input value={profile.host} onChange={(e) => setProfile({ ...profile, host: e.target.value })} /></Field><Field label="TCP port"><Input type="number" min={1} max={65535} value={profile.port} onChange={(e) => setProfile({ ...profile, port: Number(e.target.value) })} /></Field><Toggle label="Encrypt connection" value={profile.encrypt} change={(encrypt) => setProfile({ ...profile, encrypt })} /><Toggle label="Trust server certificate" value={profile.trustServerCertificate} change={(trustServerCertificate) => setProfile({ ...profile, trustServerCertificate })} /><Field label="Connection timeout (ms)"><Input type="number" value={profile.connectionTimeoutMs} onChange={(e) => setProfile({ ...profile, connectionTimeoutMs: Number(e.target.value) })} /></Field><Field label="Request timeout (ms)"><Input type="number" value={profile.requestTimeoutMs} onChange={(e) => setProfile({ ...profile, requestTimeoutMs: Number(e.target.value) })} /></Field></div>}
        {step === 2 && <div className="space-y-3"><div className="flex gap-2"><Button variant={profile.authMode === "windows" ? "default" : "outline"} onClick={() => setProfile({ ...profile, authMode: "windows", username: "", password: "" })}>Windows Integrated</Button><Button variant={profile.authMode === "sql" ? "default" : "outline"} onClick={() => setProfile({ ...profile, authMode: "sql" })}>SQL Server Authentication</Button></div>{profile.authMode === "sql" && <div className="grid gap-3 sm:grid-cols-2"><Field label="Username"><Input autoComplete="username" value={profile.username} onChange={(e) => setProfile({ ...profile, username: e.target.value })} /></Field><Field label="Password"><Input type="password" autoComplete="new-password" value={profile.password} onChange={(e) => setProfile({ ...profile, password: e.target.value })} /></Field></div>}</div>}
        {step === 3 && <Action title="Test direct server connection" text="Tests ODBC Driver 18, TCP, TLS and authentication against master." busy={busy} onClick={() => run(() => api()!.testServer(profile))} result={result} />}
        {step === 4 && <div className="space-y-3"><Action title="Choose an accessible database" text="System databases are excluded." busy={busy} onClick={() => run(async () => { const response = await api()!.listDatabases(profile); setDatabases(response.databases ?? []); return response as unknown as Record<string, unknown>; })} result={result} /><Input aria-label="Search databases" placeholder="Search databases" value={search} onChange={(e) => setSearch(e.target.value)} /><div className="max-h-52 overflow-y-auto">{shown.map((db) => <button type="button" key={db.name} onClick={() => setProfile({ ...profile, database: db.name })} className={`flex w-full justify-between rounded px-3 py-2 text-left text-sm ${profile.database === db.name ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}><span>{db.name}</span><span>{db.state_desc}</span></button>)}</div></div>}
        {step === 5 && <div className="space-y-3"><Action title={`Validate ${profile.database || "selected database"}`} text="Checks schema, columns, change tracking, permissions and a rolled-back write." busy={busy} onClick={() => run(() => api()!.validateDatabase(profile))} result={result} />{result?.status === "migration_required" && <Button variant="outline" disabled={busy} onClick={() => run(async()=>{const migrated=await api()!.migrateDatabase(profile);if(!migrated.ok)return migrated;return api()!.validateDatabase(profile);})}>Apply approved migration and validate again</Button>}</div>}
        {step === 6 && <div className="space-y-4"><Field label="Local history retention"><select className="h-10 w-full rounded-md border bg-background px-3" value={profile.retentionDays} onChange={(e) => setProfile({ ...profile, retentionDays: Number(e.target.value) })}><option value={30}>30 days</option><option value={90}>90 days</option><option value={180}>6 months</option><option value={365}>12 months</option><option value={730}>24 months</option><option value={7300}>All history</option></select></Field><Action title="Save and connect" text="The password is sealed with Windows DPAPI and is never returned to this screen." busy={busy} onClick={() => run(async () => { const response = await api()!.saveAndConnect(profile); if (response.ok) { setProfile((old) => ({ ...old, password: "" })); setState(await api()!.getState()); } return response; })} result={result} /></div>}
      </div>
      <div className="sticky bottom-0 flex justify-between gap-2 bg-card pt-2"><Button variant="outline" disabled={step === 0 || busy} onClick={() => { setResult(null); setStep((value) => value - 1); }}>Back</Button><div className="flex gap-2">{state.configured && <Button variant="destructive" onClick={() => void api()?.removeConfiguration().then(setState)}>Remove configuration</Button>}<Button disabled={!state.enabled || step === 6 || busy || (step === 3 && !ok) || (step === 4 && !profile.database) || (step === 5 && result?.ready !== true)} onClick={() => { setResult(null); setStep((value) => Math.min(6, value + 1)); }}>Next</Button></div></div>
    </CardContent>
  </Card>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="space-y-1 text-sm"><span className="font-medium">{label}</span>{children}</label>; }
function Toggle({ label, value, change }: { label: string; value: boolean; change(value: boolean): void }) { return <div className="flex items-center justify-between rounded-md border px-3"><Label>{label}</Label><Switch checked={value} onCheckedChange={change} /></div>; }
function Action({ title, text, busy, onClick, result }: { title: string; text: string; busy: boolean; onClick(): void; result: Record<string, unknown> | null }) { return <div className="space-y-3"><div><p className="font-medium">{title}</p><p className="text-sm text-muted-foreground">{text}</p></div><Button disabled={busy} onClick={onClick}>{busy ? "Working…" : title}</Button>{result && <ResultSummary result={result} />}</div>; }

function ResultSummary({ result }: { result: Record<string, unknown> }) {
  if (result.ok === false) return <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive" role="alert"><p className="font-medium">{String(result.error ?? "The check failed.")}</p>{result.hint ? <p className="mt-1">{String(result.hint)}</p> : null}{result.code ? <p className="mt-1 text-xs">Code: {String(result.code)}</p> : null}</div>;
  if (typeof result.requiredTables === "number") return <div className="grid gap-2 rounded-md bg-muted p-3 text-sm sm:grid-cols-2" role="status"><span>Required tables: {String(result.requiredTables)}</span><span>Present: {String(result.presentTables ?? 0)}</span><span>Missing: {Array.isArray(result.missingTables) ? result.missingTables.length : 0}</span><span>Columns compatible: {result.columnsCompatible ? "Yes" : "No"}</span><span>Write test: {result.writeTest ? "Passed and rolled back" : "Failed"}</span><span>Status: {result.ready ? "Ready" : String(result.status ?? "Migration required")}</span></div>;
  if (result.version || result.edition) return <div className="grid gap-2 rounded-md bg-muted p-3 text-sm sm:grid-cols-2" role="status"><span>SQL Server: {String(result.version ?? "Detected")}</span><span>Edition: {String(result.edition ?? "Unknown")}</span><span>Login: {String(result.loginName ?? "Verified")}</span><span>Latency: {String(result.latencyMs ?? "—")} ms</span><span>List databases: {result.canListDatabases ? "Allowed" : "Not allowed"}</span></div>;
  return <p className="rounded-md bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-400" role="status">{Array.isArray(result.databases) ? `${result.databases.length} accessible database${result.databases.length === 1 ? "" : "s"} loaded.` : Array.isArray(result.applied) ? `${result.applied.length} migration${result.applied.length === 1 ? "" : "s"} applied.` : "Completed successfully."}</p>;
}
