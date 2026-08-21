/**
 * The keys the desktop shell's own app server needs.
 *
 * Without the central database service key the bundled server cannot check a
 * cashier PIN, and sign-in fails with "no key configured". This panel shows
 * whether the key is present and lets an administrator set it; the value is
 * sealed with the operating system key store and never shown again.
 */
import { useCallback, useEffect, useState } from "react";
import { KeyRound, Loader2, ShieldCheck, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { localDb } from "@/lib/local-db";

type Status = {
  hasServiceKey: boolean;
  serviceKeyHint: string;
  hasSigningKey: boolean;
  fromEnvironment: boolean;
};

export function ServerKeysPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const res = await localDb()?.serverKeyStatus?.();
    if (res?.ok) setStatus(res);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Web build: there is no local server to configure.
  if (typeof window === "undefined" || !window.pos?.serverKeyStatus) return null;

  const save = async () => {
    setBusy(true);
    try {
      const res = await localDb()?.setServerServiceKey?.(value.trim());
      if (res?.ok) {
        setValue("");
        toast.success("Key saved — the till's server was restarted");
        await refresh();
      } else {
        toast.error(res?.error ?? "Could not save the key");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-4 rounded-lg border border-border bg-card p-4">
      <header className="flex items-center gap-2">
        <KeyRound className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Central database key (this PC)</h2>
      </header>

      <p
        className={`flex items-center gap-2 text-sm ${
          status?.hasServiceKey ? "text-success" : "text-destructive"
        }`}
      >
        {status?.hasServiceKey ? (
          <ShieldCheck className="size-4" />
        ) : (
          <ShieldAlert className="size-4" />
        )}
        {status?.hasServiceKey
          ? `Configured (${status.serviceKeyHint})${status.fromEnvironment ? " — from this machine's environment" : ""}`
          : "Not configured — cashier sign-in cannot reach the central database, so the till falls back to offline sign-in."}
      </p>

      <div className="space-y-1">
        <Label htmlFor="service-key">Service key</Label>
        <Input
          id="service-key"
          type="password"
          autoComplete="off"
          placeholder="sb_secret_… or the service role key"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Sealed with Windows Data Protection. Saving restarts this till&apos;s local server so the
          new key takes effect immediately.
        </p>
      </div>

      <div className="flex gap-2">
        <Button onClick={() => void save()} disabled={busy || !value.trim()}>
          {busy && <Loader2 className="size-4 animate-spin" />}
          Save key
        </Button>
        {status?.hasServiceKey && (
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setValue("");
              void (async () => {
                setBusy(true);
                await localDb()?.setServerServiceKey?.("");
                await refresh();
                setBusy(false);
                toast.success("Key removed");
              })();
            }}
          >
            Remove
          </Button>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Session signing key: {status?.hasSigningKey ? "generated on this PC" : "will be generated on next start"}.
      </p>
    </section>
  );
}
