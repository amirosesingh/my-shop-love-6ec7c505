/**
 * Database & Cloud Connection — the tenant's central database URL and
 * publishable API key, entered manually on this device.
 *
 * Terminal apps (Windows till, Android APK) carry no baked-in cloud address:
 * until an admin saves the pair here, the device trades 100% locally and the
 * sync badge shows "Offline / Unconnected". Values are sealed with the
 * platform vault — Windows DPAPI on the till, the Android Keystore on a
 * phone — and the key is never shown again after saving.
 *
 * The web build manages its own publishable config, so this panel stays
 * hidden there.
 */
import { useCallback, useEffect, useState } from "react";
import { CloudCog, Loader2, PlugZap, ShieldCheck, ShieldAlert, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isTerminalApp } from "@/platform-config/platform";
import {
  cloudKeyStatus,
  removeCloudCredentials,
  saveCloudCredentials,
  subscribeCloudKeys,
  testCloudCredentials,
  type CloudKeyStatus,
} from "@/lib/secure-cloud-config";

export function CloudConnectionPanel() {
  const [status, setStatus] = useState<CloudKeyStatus | null>(null);
  const [url, setUrl] = useState("");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState<"test" | "save" | "remove" | null>(null);

  const refresh = useCallback(async () => {
    const next = await cloudKeyStatus();
    setStatus(next);
    if (next.configured && next.url) setUrl((current) => current || next.url);
  }, []);

  useEffect(() => {
    void refresh();
    return subscribeCloudKeys(() => void refresh());
  }, [refresh]);

  // Web build: the deployment carries its own publishable config.
  if (!isTerminalApp()) return null;

  const test = async () => {
    setBusy("test");
    try {
      const result = await testCloudCredentials(url, key);
      if (result.ok) toast.success(result.detail);
      else toast.error(result.detail);
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    setBusy("save");
    try {
      const res = await saveCloudCredentials(url, key);
      if (res.ok) {
        setKey("");
        toast.success(
          res.encrypted
            ? "Cloud connection saved — sealed with this device's secure storage"
            : "Cloud connection saved",
        );
        await refresh();
      } else {
        toast.error(res.error ?? "Could not save the credentials");
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

  const ready = url.trim().length > 0 && key.trim().length > 0 && busy === null;

  return (
    <section className="space-y-4 rounded-lg border border-border bg-card p-4">
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
          ? `Connected to ${status.url} (key ${status.keyHint})${status.encrypted ? " — sealed with this device's secure storage" : ""}`
          : "Not configured — the device trades fully offline. Save the central database URL and API key to enable automatic synchronization."}
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="cloud-url">Central database URL</Label>
          <Input
            id="cloud-url"
            type="url"
            autoComplete="off"
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

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => void test()} disabled={!ready}>
          {busy === "test" ? <Loader2 className="size-4 animate-spin" /> : <PlugZap className="size-4" />}
          Test connection
        </Button>
        <Button onClick={() => void save()} disabled={!ready}>
          {busy === "save" && <Loader2 className="size-4 animate-spin" />}
          Save &amp; connect
        </Button>
        {status?.configured && (
          <Button variant="ghost" onClick={() => void remove()} disabled={busy !== null}>
            {busy === "remove" ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
            Remove saved connection
          </Button>
        )}
      </div>
    </section>
  );
}
