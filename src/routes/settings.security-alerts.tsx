import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { RefreshCw, ShieldAlert, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { SettingsFrame } from "@/components/pos/settings/SettingsFrame";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/pos-auth";
import {
  listSecurityFindings,
  runSecuritySelfCheck,
  setFindingStatus,
  SEVERITY_TONE,
  SOURCE_LABEL,
  type SecurityFinding,
} from "@/lib/security-alerts";

function when(value: string): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

function SecurityAlertsPage() {
  const { user, isAdmin } = useAuth();
  const [rows, setRows] = useState<SecurityFinding[]>([]);
  const [showResolved, setShowResolved] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setRows(await listSecurityFindings(showResolved));
  }, [showResolved]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(f: SecurityFinding, status: SecurityFinding["status"]) {
    try {
      await setFindingStatus(f.id, status, user.name || user.staffId);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function scanNow() {
    setBusy(true);
    try {
      const out = await runSecuritySelfCheck();
      toast.success(
        out.new > 0
          ? `${out.new} new finding${out.new > 1 ? "s" : ""} raised`
          : "Check complete — no new findings",
      );
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!isAdmin) {
    return (
      <SettingsFrame title="Security alerts" description="Administrators only.">
        <p className="text-sm text-muted-foreground">
          Ask an administrator to review security findings.
        </p>
      </SettingsFrame>
    );
  }

  const open = rows.filter((r) => r.status !== "resolved");

  return (
    <SettingsFrame
      title="Security alerts"
      description="Every deployment scan and the nightly database check report here. New findings raise a notice in the top bar for administrators."
    >
      <div className="flex flex-wrap items-center gap-3">
        <div
          className={cn(
            "flex items-center gap-2 rounded-md border px-3 py-2 text-sm",
            open.length === 0
              ? "border-success/40 bg-success/10 text-success"
              : "border-destructive/40 bg-destructive/10 text-destructive",
          )}
        >
          {open.length === 0 ? (
            <ShieldCheck className="size-4" />
          ) : (
            <ShieldAlert className="size-4" />
          )}
          {open.length === 0
            ? "No open findings"
            : `${open.length} finding${open.length > 1 ? "s" : ""} need review`}
        </div>
        <div className="flex items-center gap-2">
          <Switch id="resolved" checked={showResolved} onCheckedChange={setShowResolved} />
          <Label htmlFor="resolved" className="text-xs">
            Show resolved
          </Label>
        </div>
        <Button size="sm" variant="outline" className="ml-auto" disabled={busy} onClick={scanNow}>
          <RefreshCw className={cn("size-3.5", busy && "animate-spin")} /> Run check now
        </Button>
      </div>

      <div className="mt-4 space-y-2">
        {rows.length === 0 && (
          <p className="rounded-md border border-border bg-surface-2 px-3 py-6 text-center text-sm text-muted-foreground">
            Nothing reported yet.
          </p>
        )}
        {rows.map((f) => (
          <div key={f.id} className="rounded-md border border-border bg-card p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "rounded border px-1.5 py-0.5 text-[10px] uppercase",
                  SEVERITY_TONE[f.severity],
                )}
              >
                {f.severity}
              </span>
              <p className="min-w-0 flex-1 text-sm font-medium">{f.title}</p>
              <span className="text-[11px] capitalize text-muted-foreground">{f.status}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{f.detail}</p>
            <p className="mt-2 text-[11px] text-muted-foreground">
              {SOURCE_LABEL[f.source]}
              {f.deploymentRef ? ` · ${f.deploymentRef}` : ""} · first seen {when(f.firstSeenAt)} ·
              last seen {when(f.lastSeenAt)}
              {f.acknowledgedBy ? ` · handled by ${f.acknowledgedBy}` : ""}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {f.status === "open" && (
                <Button size="sm" variant="outline" onClick={() => void act(f, "acknowledged")}>
                  Acknowledge
                </Button>
              )}
              {f.status !== "resolved" && (
                <Button size="sm" variant="secondary" onClick={() => void act(f, "resolved")}>
                  Mark fixed
                </Button>
              )}
              {f.status === "resolved" && (
                <Button size="sm" variant="ghost" onClick={() => void act(f, "open")}>
                  Reopen
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </SettingsFrame>
  );
}

export const Route = createFileRoute("/settings/security-alerts")({
  head: () => ({
    meta: [
      { title: "Security Alerts — POS Settings" },
      {
        name: "description",
        content:
          "Review security findings raised by deployment scans and the nightly database posture check.",
      },
      { property: "og:title", content: "Security Alerts — POS Settings" },
      {
        property: "og:description",
        content: "Deployment and nightly security findings with acknowledge and resolve controls.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SecurityAlertsPage,
});
