/**
 * Backend address — the hosted POS server this device sends its app-server
 * calls to (cashier sign-in, sync relay, health).
 *
 * It is deliberately the only server setting kept on a till or phone: the
 * address is not a secret, and every privileged operation behind it is
 * performed by the backend itself, so no private key ever sits on a shop
 * counter. The web build serves its own backend, so this panel stays hidden.
 */
import { useCallback, useEffect, useState } from "react";
import { Loader2, PlugZap, Server, ShieldAlert, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isTerminalApp } from "@/platform-config/platform";
import {
  backendUrl,
  saveBackendUrl,
  testBackendUrl,
  type BackendTestResult,
} from "@/lib/backend-config";

export function BackendAddressPanel() {
  const [saved, setSaved] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState<"test" | "save" | null>(null);
  const [result, setResult] = useState<BackendTestResult | null>(null);

  const refresh = useCallback(async () => {
    const current = await backendUrl();
    setSaved(current);
    setUrl((value) => value || current);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!isTerminalApp()) return null;

  const test = async () => {
    setBusy("test");
    try {
      const res = await testBackendUrl(url);
      setResult(res);
      if (res.url) setUrl(res.url);
      if (res.ok) toast.success(res.detail);
      else if (res.warn) toast.warning(res.detail);
      else toast.error(res.detail);
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    setBusy("save");
    try {
      const res = await saveBackendUrl(url);
      if (res.ok) {
        toast.success("Backend address saved for this device");
        await refresh();
      } else {
        toast.error(res.error ?? "Could not save the address");
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="space-y-4 rounded-lg border border-border bg-card p-4">
      <header className="flex items-center gap-2">
        <Server className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Backend address</h2>
      </header>

      <p
        className={`flex items-center gap-2 text-sm ${saved ? "text-success" : "text-destructive"}`}
      >
        {saved ? <ShieldCheck className="size-4" /> : <ShieldAlert className="size-4" />}
        {saved
          ? `Sign-in and sync are sent to ${saved}`
          : "Not configured — this device cannot reach the POS backend for sign-in or sync."}
      </p>

      <div className="space-y-1">
        <Label htmlFor="backend-url">Server address</Label>
        <Input
          id="backend-url"
          type="url"
          autoComplete="off"
          placeholder="https://pos.example.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Enter the web address you open the POS on — your own company domain, for example{" "}
          <code>https://pos.example.com</code>. This is <strong>not</strong> the central database
          address and <strong>not</strong> a key: the till talks to your POS site, and your POS
          site talks to the database with the key it holds on the server. No private key is ever
          stored on this device.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={test} disabled={busy !== null || !url.trim()}>
          {busy === "test" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <PlugZap className="size-4" />
          )}
          Test connection
        </Button>
        <Button onClick={save} disabled={busy !== null}>
          {busy === "save" ? <Loader2 className="size-4 animate-spin" /> : null}
          Save address
        </Button>
      </div>

      {result && (
        <p
          className={`text-xs ${
            result.ok ? "text-success" : result.warn ? "text-amber-600" : "text-destructive"
          }`}
        >
          {result.ok ? "✓" : result.warn ? "!" : "✕"} {result.detail}
        </p>
      )}
    </section>
  );
}
