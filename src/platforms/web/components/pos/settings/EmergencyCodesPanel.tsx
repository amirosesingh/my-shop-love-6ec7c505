/**
 * Emergency codes — the owner's view of the recovery code for each till.
 *
 * The secret itself never reaches this screen: the server unseals it, derives
 * the six digits for the current minute and returns only those. Every reveal
 * is written to the audit log, and the code is hidden again after two minutes.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Eye, EyeOff, KeyRound, Loader2, RefreshCw, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SettingsSections } from "@/platforms/web/components/pos/settings/SettingsSection";
import { notifyError } from "@/lib/notify";
import { getPosCallerAuth } from "@/lib/pos-caller-auth";
import {
  listEmergencyTerminalsFn,
  revealCompanyEmergencyCodeFn,
  revealEmergencyCodeFn,
} from "@/lib/emergency-codes.functions";

type Terminal = {
  tokenId: string;
  deviceName: string;
  locationName: string;
  platform: string;
  status: string;
  lastSeenAt: string | null;
  fingerprint: string | null;
  escrowedAt: string | null;
};

type Shown = { code: string; expiresInSeconds: number; fingerprint?: string; at: number };

const HIDE_AFTER_MS = 2 * 60 * 1000;

const seen = (value: string | null) =>
  value ? new Date(value).toLocaleString() : "never";

export function EmergencyCodesPanel() {
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [codes, setCodes] = useState<Record<string, Shown>>({});
  const [tick, setTick] = useState(0);
  const timer = useRef<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const auth = await getPosCallerAuth();
      if (!auth.accessToken) {
        notifyError("Sign in with an owner or administrator account to see emergency codes");
        setTerminals([]);
        return;
      }
      const res = await listEmergencyTerminalsFn({ data: { accessToken: auth.accessToken } });
      if (!res.ok) {
        notifyError(res.error ?? "Could not read the terminal list");
        setTerminals([]);
        return;
      }
      setTerminals(res.terminals);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // One second heartbeat so the countdown moves and stale codes disappear.
  useEffect(() => {
    timer.current = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, []);

  useEffect(() => {
    setCodes((current) => {
      const next: Record<string, Shown> = {};
      let changed = false;
      for (const [id, value] of Object.entries(current)) {
        if (Date.now() - value.at < HIDE_AFTER_MS) next[id] = value;
        else changed = true;
      }
      return changed ? next : current;
    });
  }, [tick]);

  async function reveal(tokenId: string) {
    setBusy(tokenId);
    try {
      const auth = await getPosCallerAuth();
      if (!auth.accessToken) {
        notifyError("Sign in with an owner or administrator account");
        return;
      }
      const res =
        tokenId === "__company"
          ? await revealCompanyEmergencyCodeFn({
              data: {
                accessToken: auth.accessToken,
                utcOffsetMinutes: -new Date().getTimezoneOffset(),
              },
            })
          : await revealEmergencyCodeFn({ data: { accessToken: auth.accessToken, tokenId } });
      if (!res.ok) {
        notifyError(res.error);
        return;
      }
      const shown: Shown = {
        code: res.code,
        expiresInSeconds: res.expiresInSeconds,
        ...("fingerprint" in res ? { fingerprint: String(res.fingerprint) } : {}),
        at: Date.now(),
      };
      setCodes((c) => ({ ...c, [tokenId]: shown }));
    } finally {
      setBusy(null);
    }
  }

  const hide = (tokenId: string) =>
    setCodes((c) => {
      const next = { ...c };
      delete next[tokenId];
      return next;
    });

  const left = (shown: Shown) =>
    Math.max(0, shown.expiresInSeconds - Math.floor((Date.now() - shown.at) / 1000));

  const codeCell = (id: string, ready: boolean) => {
    const shown = codes[id];
    if (shown) {
      const seconds = left(shown);
      return (
        <div className="flex items-center gap-2">
          <span className="font-mono text-xl tracking-[0.3em] tabular-nums">{shown.code}</span>
          <span className="text-[11px] text-muted-foreground">
            {seconds > 0 ? `${seconds}s` : "expired"}
          </span>
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            aria-label="Refresh code"
            onClick={() => void reveal(id)}
          >
            <RefreshCw className="size-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            aria-label="Hide code"
            onClick={() => hide(id)}
          >
            <EyeOff className="size-3.5" />
          </Button>
        </div>
      );
    }
    return (
      <Button
        size="sm"
        variant="outline"
        className="h-7 px-2 text-xs"
        disabled={!ready || busy === id}
        onClick={() => void reveal(id)}
      >
        {busy === id ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Eye className="size-3.5" />
        )}
        Show code
      </Button>
    );
  };

  return (
    <SettingsSections
      storageKey="pos.settings.emergency-codes"
      items={[
        {
          id: "company",
          title: "Company master code",
          blurb:
            "Opens any till of this company, including one that has never been online. It is derived from a secret that lives only on this server — never inside an installer.",
          content: (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-3">
              <div className="flex items-start gap-2">
                <ShieldAlert className="mt-0.5 size-4 text-amber-600" />
                <p className="max-w-xl text-sm text-muted-foreground">
                  Use this when a till has no code of its own yet. The till must have its clock
                  roughly right — three minutes either way is accepted.
                </p>
              </div>
              {codeCell("__company", true)}
            </div>
          ),
        },
        {
          id: "per-terminal",
          title: "Emergency code per terminal",
          blurb:
            "The code changes every minute and is read from the till's own recovery secret. Read it out to whoever is standing at the machine — never send it ahead of time.",
          content: (
            <div className="space-y-3">
              <div className="flex justify-end">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  onClick={() => void load()}
                  disabled={loading}
                >
                  {loading ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="size-3.5" />
                  )}
                  Refresh list
                </Button>
              </div>
              {loading ? (
                <p className="text-sm text-muted-foreground">Loading terminals…</p>
              ) : terminals.length === 0 ? (
                <div className="space-y-2 rounded-lg border border-dashed border-border p-4">
                  <p className="text-sm font-medium">No till is registered yet</p>
                  <p className="text-sm text-muted-foreground">
                    A Windows or Android till appears here once it has been activated, and its own
                    code becomes readable after it has been online once. Until then use the company
                    master code above.
                  </p>
                  <Link
                    to="/settings/terminals"
                    className="inline-flex text-sm font-medium text-primary underline-offset-4 hover:underline"
                  >
                    Open Terminal activation
                  </Link>
                </div>
              ) : (
                <div className="space-y-2">
                  {terminals.map((t) => (
                    <div
                      key={t.tokenId}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-3"
                    >
                      <div className="min-w-56">
                        <p className="text-sm font-medium">{t.deviceName}</p>
                        <p className="text-xs text-muted-foreground">
                          {t.locationName || "No branch"} · {t.platform} · last seen{" "}
                          {seen(t.lastSeenAt)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {t.fingerprint ? (
                            <>Device fingerprint {t.fingerprint}</>
                          ) : (
                            <span className="text-amber-600">
                              Waiting for this till to come online once — use the company master
                              code meanwhile.
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={t.status === "revoked" ? "destructive" : "secondary"}>
                          {t.status}
                        </Badge>
                        {codeCell(t.tokenId, !!t.fingerprint)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ),
        },
        {
          id: "how",
          title: "How to use it",
          blurb: "At the terminal: Emergency Access, then type the six digits.",
          content: (
            <div className="flex items-start gap-2 text-sm text-muted-foreground">
              <KeyRound className="mt-0.5 size-4" />
              <p>
                The code is valid for the minute it was generated in, plus three minutes of clock
                drift either side. It unlocks the recovery screen only — it never signs anyone in
                and never gives access to sales or reports.
              </p>
            </div>
          ),
        },
      ]}
    />
  );
}
