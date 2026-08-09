/**
 * Top-bar integration health. Green when the database and realtime link are
 * both up, amber when the till is running on local cache, red when the core
 * connection failed.
 */
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Activity, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { usePos } from "@/lib/pos-store";
import {
  disposeRealtimeProbe,
  overallState,
  runDiagnostics,
  STATE_LABEL,
  type ServiceCheck,
  type ServiceState,
} from "@/lib/system-health";

const dot: Record<ServiceState, string> = {
  ok: "bg-success",
  degraded: "bg-warning",
  down: "bg-destructive",
  checking: "bg-muted-foreground",
};

const pill: Record<ServiceState, string> = {
  ok: "border-success/40 bg-success/10 text-success",
  degraded: "border-warning/40 bg-warning/10 text-warning",
  down: "border-destructive/40 bg-destructive/10 text-destructive",
  checking: "border-border bg-surface-2 text-muted-foreground",
};

export function SystemStatusPill({ compact }: { compact?: boolean }) {
  const { state: pos } = usePos();
  const integrations = pos.settings.integrations;
  const [checks, setChecks] = useState<ServiceCheck[]>([]);
  const [busy, setBusy] = useState(false);

  const run = () => {
    setBusy(true);
    void runDiagnostics([
      { url: integrations.memberDomain, label: "Member domain" },
      { url: integrations.redeemDomain, label: "Redeem domain" },
    ])
      .then(setChecks)
      .finally(() => setBusy(false));
  };

  useEffect(() => {
    let live = true;
    const tick = () =>
      void runDiagnostics([
        { url: integrations.memberDomain, label: "Member domain" },
        { url: integrations.redeemDomain, label: "Redeem domain" },
      ]).then((r) => live && setChecks(r));
    tick();
    const t = window.setInterval(tick, 120_000);
    return () => {
      live = false;
      window.clearInterval(t);
      disposeRealtimeProbe();
    };
  }, [integrations.memberDomain, integrations.redeemDomain]);

  const state = busy && !checks.length ? "checking" : overallState(checks);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`System status: ${STATE_LABEL[state]}`}
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-medium",
            pill[state],
          )}
        >
          <span className={cn("size-2 rounded-full", dot[state])} />
          {!compact && <span>{STATE_LABEL[state]}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-3">
        <div className="flex items-center gap-2">
          <Activity className="size-4 text-primary" />
          <p className="text-sm font-semibold">System integration</p>
        </div>
        <ul className="space-y-2">
          {(checks.length ? checks : []).map((c) => (
            <li key={c.id} className="flex items-start gap-2">
              <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", dot[c.state])} />
              <div className="min-w-0">
                <p className="text-xs font-medium">{c.label}</p>
                <p className="text-[11px] text-muted-foreground">{c.detail}</p>
              </div>
            </li>
          ))}
          {!checks.length && (
            <li className="text-[11px] text-muted-foreground">Running first check…</li>
          )}
        </ul>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="flex-1" onClick={run} disabled={busy}>
            {busy ? "Testing…" : "Test again"}
          </Button>
          <Button asChild size="sm" className="flex-1">
            <Link to="/settings/system">
              <Settings2 className="size-3.5" /> Open settings
            </Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
