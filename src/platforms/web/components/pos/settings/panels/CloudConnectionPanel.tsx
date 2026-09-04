/**
 * Database & Cloud Connection — the ONE place a device's connection details
 * are entered.
 *
 * Three settings live here and nowhere else:
 *   1. Central database URL
 *   2. API key (publishable)
 *   3. POS backend address — the web address of your POS site, used for
 *      cashier sign-in and the sync relay
 *
 * Together they are one connection profile: they are tested together and
 * saved together (`saveConnectionProfile`), so a device can never end up with
 * one customer's address and another customer's key.
 *
 * Storage is unchanged and still platform-sealed: Windows keeps the pair in
 * the OS vault (DPAPI via safeStorage), Android in the Keystore
 * (EncryptedSharedPreferences); the backend address, which is not a secret,
 * goes to the shell's own configuration store.
 *
 * On the web build the deployment supplies the database values through its
 * hosting variables, so the panel shows them read-only.
 */
import { useCallback, useEffect, useState } from "react";
import {
  CloudCog,
  Loader2,
  Lock,
  PlugZap,
  Server,
  ShieldCheck,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isTerminalApp } from "@/platform-config/platform";
import { useAuthOptional } from "@/lib/pos-auth";
import {
  cloudKeyStatus,
  probeCloudConnection,
  removeCloudCredentials,
  saveConnectionProfile,
  subscribeCloudKeys,
  type CloudKeyStatus,
  type CloudProbe,
} from "@/lib/secure-cloud-config";
import { backendUrl, testBackendUrl, type BackendTestResult } from "@/lib/backend-config";

export function CloudConnectionPanel() {
  const auth = useAuthOptional();
  const [status, setStatus] = useState<CloudKeyStatus | null>(null);
  const [url, setUrl] = useState("");
  const [key, setKey] = useState("");
  const [savedBackend, setSavedBackend] = useState("");
  const [backend, setBackend] = useState("");
  const [cloudResult, setCloudResult] = useState<CloudProbe | null>(null);
  const [backendResult, setBackendResult] = useState<BackendTestResult | null>(null);
  const [busy, setBusy] = useState<"test" | "save" | "remove" | null>(null);
  const [unlocked, setUnlocked] = useState(false);

  const refresh = useCallback(async () => {
    const next = await cloudKeyStatus();
    setStatus(next);
    if (next.configured && next.url) setUrl((current) => current || next.url);
    const current = await backendUrl();
    setSavedBackend(current);
    setBackend((value) => value || current);
  }, []);

  useEffect(() => {
    void refresh();
    return subscribeCloudKeys(() => void refresh());
  }, [refresh]);

  const terminal = isTerminalApp();

  // Web build: the deployment carries its own publishable config, so the
  // values are shown for confirmation but cannot be typed over here.
  if (!terminal) {
    return (
      <section className="space-y-3 rounded-lg border border-border bg-card p-4">
        <header className="flex items-center gap-2">
          <CloudCog className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Database &amp; Cloud Connection</h2>
        </header>
        <p
          className={`flex items-center gap-2 text-sm ${
            status?.configured ? "text-success" : "text-destructive"
          }`}
        >
          {status?.configured ? (
            <ShieldCheck className="size-4" />
          ) : (
            <ShieldAlert className="size-4" />
          )}
          {status?.configured
            ? `This website is connected to ${status.url}`
            : "Not configured — set the database address and publishable key in this site's hosting variables."}
        </p>
        <p className="text-xs text-muted-foreground">
          On the website these two values come from the hosting environment, and the site is its
          own backend, so there is nothing to enter here. On a Windows till or an Android terminal
          this same screen is where all three connection settings are typed in once.
        </p>
      </section>
    );
  }

  // An unconfigured terminal has nothing to protect and nobody to sign in as:
  // first-run setup is open. Once a connection exists, only a supervisor or
  // administrator may point this device at a different company.
  const firstRun = !status?.configured;
  const privileged = Boolean(auth?.isSupervisor || auth?.isAdmin);
  const editable = firstRun || privileged || unlocked;

  const testAll = async () => {
    setBusy("test");
    try {
      const cloud = await probeCloudConnection(url, key);
      setCloudResult(cloud);
      if (cloud.stage === "ok") toast.success(`Central database: ${cloud.detail}`);
      else if (cloud.stage === "no-schema") toast.warning(`Central database: ${cloud.detail}`);
      else toast.error(`Central database: ${cloud.detail}`);

      if (backend.trim()) {
        const res = await testBackendUrl(backend);
        setBackendResult(res);
        if (res.url) setBackend(res.url);
        if (res.ok) toast.success(`POS backend: ${res.detail}`);
        else if (res.warn) toast.warning(`POS backend: ${res.detail}`);
        else toast.error(`POS backend: ${res.detail}`);
      }
    } finally {
      setBusy(null);
    }
  };

  const saveAll = async () => {
    setBusy("save");
    try {
      const res = await saveConnectionProfile({
        supabaseUrl: url,
        supabaseKey: key,
        backendUrl: backend,
      });
      if (res.cloud) setCloudResult(res.cloud);
      if (res.backend) setBackendResult(res.backend);
      if (res.ok) {
        setKey("");
        toast.success(res.detail);
        await refresh();
      } else {
        toast.error(res.detail);
      }
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    setBusy("remove");
    try {
      const res = await removeCloudCredentials();
      if (res.ok) {
        setKey("");
        toast.success("Cloud keys removed — this device keeps trading locally");
        await refresh();
      } else {
        toast.error(res.error ?? "Could not remove the credentials");
      }
    } finally {
      setBusy(null);
    }
  };

  const complete = url.trim().length > 0 && key.trim().length > 0 && backend.trim().length > 0;
  const canTest = editable && complete && busy === null;
  const canSave = editable && complete && busy === null;

  return (
    <section className="space-y-4 rounded-lg border border-border bg-card p-4">
      <header className="flex items-center gap-2">
        <CloudCog className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Database &amp; Cloud Connection</h2>
      </header>

      <p className="text-xs text-muted-foreground">
        Everything this device needs to reach your company is entered here, once. Changing it
        points the terminal at a different company, so it is tested before it is saved and the
        three values are always stored together.
      </p>

      <p
        className={`flex items-center gap-2 text-sm ${
          status?.configured ? "text-success" : "text-destructive"
        }`}
      >
        {status?.configured ? (
          <ShieldCheck className="size-4" />
        ) : (
          <ShieldAlert className="size-4" />
        )}
        {status?.configured
          ? `Connected to ${status.url} (key ${status.keyHint})${status.encrypted ? " — sealed with this device's secure storage" : ""}`
          : "Not configured — the device trades fully offline. Save the central database URL, API key and backend address to connect it."}
      </p>

      {!editable && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <Lock className="size-4" />
          <span>
            This terminal is already connected. Only a supervisor or administrator may change where
            it reads and writes.
          </span>
          <Button size="sm" variant="outline" onClick={() => setUnlocked(true)} disabled={!privileged}>
            {privileged ? "Unlock to change" : "Sign in as a supervisor"}
          </Button>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="cloud-url">Central database URL</Label>
          <Input
            id="cloud-url"
            type="url"
            autoComplete="off"
            disabled={!editable}
            placeholder="https://your-project.supabase.co"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="cloud-key">API key (publishable)</Label>
          <Input
            id="cloud-key"
            type="password"
            autoComplete="off"
            disabled={!editable}
            placeholder={
              status?.configured ? `Saved (${status.keyHint}) — enter a new key to replace` : "sb_publishable_…"
            }
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Both values come from the central project&apos;s API settings. They are encrypted with this
        device&apos;s hardware-backed storage and decrypted only in memory while sync runs. The key
        is never displayed again after saving.
      </p>

      {cloudResult && (
        <div className="space-y-0.5 text-xs">
          <p className={cloudResult.reachable ? "text-success" : "text-destructive"}>
            {cloudResult.reachable ? "✓" : "✕"} Address reachable
          </p>
          <p className={cloudResult.authenticated ? "text-success" : "text-destructive"}>
            {cloudResult.authenticated ? "✓" : "✕"} API key accepted
          </p>
          <p className={cloudResult.schemaReady ? "text-success" : "text-amber-600"}>
            {cloudResult.schemaReady ? "✓" : "!"} POS tables provisioned
          </p>
          <p className="text-muted-foreground">{cloudResult.detail}</p>
        </div>
      )}

      <div className="space-y-1 border-t border-border pt-4">
        <Label htmlFor="backend-url" className="flex items-center gap-2">
          <Server className="size-4 text-muted-foreground" />
          POS backend address
        </Label>
        <Input
          id="backend-url"
          type="url"
          autoComplete="off"
          disabled={!editable}
          placeholder="https://pos.example.com"
          value={backend}
          onChange={(e) => setBackend(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          {savedBackend
            ? `Sign-in and sync are sent to ${savedBackend}.`
            : "Not configured — this device cannot reach the POS backend for sign-in or sync."}{" "}
          Enter the web address you open the POS on, for example <code>https://pos.example.com</code>
          . This is <strong>not</strong> the database address: the till talks to your POS site, and
          your POS site talks to the database with the key it holds on the server.
        </p>
        {backendResult && (
          <p
            className={`text-xs ${
              backendResult.ok
                ? "text-success"
                : backendResult.warn
                  ? "text-amber-600"
                  : "text-destructive"
            }`}
          >
            {backendResult.ok ? "✓" : backendResult.warn ? "!" : "✕"} {backendResult.detail}
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => void testAll()} disabled={!canTest}>
          {busy === "test" ? <Loader2 className="size-4 animate-spin" /> : <PlugZap className="size-4" />}
          Test connection
        </Button>
        <Button onClick={() => void saveAll()} disabled={!canSave}>
          {busy === "save" && <Loader2 className="size-4 animate-spin" />}
          Save &amp; connect
        </Button>
        {status?.configured && (
          <Button variant="ghost" onClick={() => void remove()} disabled={busy !== null || !editable}>
            {busy === "remove" ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
            Remove saved connection
          </Button>
        )}
      </div>
    </section>
  );
}
