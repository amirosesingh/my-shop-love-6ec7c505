/**
 * Asks for an administrator's own username and PIN when the till refuses a
 * privileged action, and stops the register outright when the desktop process
 * reports that its records or identity can no longer be trusted.
 *
 * The refusal itself is made by the desktop process, not here: this component
 * only turns that refusal into something an operator can act on. It wraps the
 * bridge once, so every existing screen gets the prompt without being changed.
 */
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Ask = { message: string; resolve: (unlocked: boolean) => void };

/** Bridges that carry privileged calls. */
const BRIDGES = ["pos", "electronAPI", "sqlAdmin"] as const;

export function PrivilegeGate({ children }: { children: React.ReactNode }) {
  const [ask, setAsk] = useState<Ask | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const asking = useRef<Promise<boolean> | null>(null);

  /* One prompt at a time, however many calls are refused at once. */
  const requestUnlock = (message: string) => {
    if (!asking.current) {
      asking.current = new Promise<boolean>((resolve) => {
        setAsk({
          message,
          resolve: (ok) => {
            asking.current = null;
            setAsk(null);
            setUsername("");
            setPin("");
            setError("");
            resolve(ok);
          },
        });
      });
    }
    return asking.current;
  };

  useEffect(() => {
    const win = window as unknown as Record<string, Record<string, unknown> | undefined>;
    const pos = win["pos"] as { onFatal?: (cb: (p: { message: string }) => void) => () => void } | undefined;
    if (!pos) return; // web and Android have no desktop bridge

    const undo: Array<() => void> = [];
    let off: (() => void) | undefined;

    // The desktop shell hands these objects over read-only, so their functions
    // can never be replaced in place. A stand-in in front of the whole bridge
    // forwards every call untouched and only adds the administrator prompt
    // when a call comes back refused. Anything that goes wrong here must leave
    // the till running rather than blanking the screen.
    try {
      for (const name of BRIDGES) {
        const bridge = win[name];
        if (!bridge) continue;
        const proxy = wrapBridge(bridge, requestUnlock);
        try {
          win[name] = proxy as unknown as Record<string, unknown>;
          undo.push(() => {
            win[name] = bridge;
          });
        } catch {
          /* this shell will not let us stand in front of the bridge */
        }
      }

      off = pos.onFatal?.((payload) => setFatal(payload?.message ?? "This till has stopped."));
    } catch {
      /* never block the till from loading */
    }

    return () => {
      for (const restore of undo) {
        try {
          restore();
        } catch {
          /* ignore */
        }
      }
      off?.();
    };
  }, []);

  const submit = async () => {
    setBusy(true);
    setError("");
    const bridge = (window as unknown as {
      sqlAdmin?: { unlock?: (u: string, p: string) => Promise<{ ok: boolean; error?: string }> };
    }).sqlAdmin;
    const result = (await bridge?.unlock?.(username, pin)) ?? {
      ok: false,
      error: "This terminal cannot be unlocked from here.",
    };
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "That username or PIN was not accepted on this till.");
      return;
    }
    ask?.resolve(true);
  };

  if (fatal) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-8">
        <div className="max-w-md space-y-3 rounded-lg border border-destructive/40 bg-card p-6 text-center">
          <h1 className="text-lg font-semibold text-destructive">This till has stopped</h1>
          <p className="text-sm text-muted-foreground">{fatal}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {children}
      <Dialog open={Boolean(ask)} onOpenChange={(open) => !open && ask?.resolve(false)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Unlock this terminal</DialogTitle>
            <DialogDescription>
              {ask?.message ||
                "This action needs an administrator. Enter your username and PIN to continue."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="unlock-username">Username</Label>
              <Input
                id="unlock-username"
                autoFocus
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="unlock-pin">PIN</Label>
              <Input
                id="unlock-pin"
                type="password"
                inputMode="numeric"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => ask?.resolve(false)} disabled={busy}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={busy || !username || !pin}>
                {busy ? "Checking…" : "Unlock"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default PrivilegeGate;
