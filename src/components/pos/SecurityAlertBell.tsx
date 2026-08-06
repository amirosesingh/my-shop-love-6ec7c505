/**
 * Header bell that lights up when a deployment scan or the nightly database
 * self-check raises a new security finding. Admins only.
 */
import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/pos-auth";
import {
  listSecurityFindings,
  SEVERITY_TONE,
  SOURCE_LABEL,
  type SecurityFinding,
} from "@/lib/security-alerts";

const POLL_MS = 90_000;
const SEEN_KEY = "pos.security.seen";

function readSeen(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

export function SecurityAlertBell({ compact }: { compact?: boolean }) {
  const { isAdmin } = useAuth();
  const [findings, setFindings] = useState<SecurityFinding[]>([]);
  const [open, setOpen] = useState(false);

  const refresh = useCallback(async () => {
    const rows = (await listSecurityFindings()).filter((f) => f.status === "open");
    setFindings(rows);
    if (typeof window === "undefined") return;
    const seen = readSeen();
    const fresh = rows.filter((f) => !seen.includes(f.id));
    if (fresh.length > 0) {
      const worst = fresh[0];
      toast.warning(
        fresh.length === 1
          ? `New security finding: ${worst?.title ?? ""}`
          : `${fresh.length} new security findings need review`,
        { description: "Open the shield in the top bar to review them." },
      );
      localStorage.setItem(SEEN_KEY, JSON.stringify(rows.map((f) => f.id).slice(0, 300)));
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    void refresh();
    const t = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(t);
  }, [isAdmin, refresh]);

  if (!isAdmin) return null;

  const count = findings.length;
  const clean = count === 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size={compact ? "icon" : "sm"}
          aria-label={clean ? "Security: no open findings" : `Security: ${count} open findings`}
          className={cn(
            "relative h-8 shrink-0",
            compact ? "w-8" : "px-2 text-[11px]",
            clean ? "" : "border-destructive/40 bg-destructive/10 text-destructive",
          )}
        >
          {clean ? <ShieldCheck className="size-3.5" /> : <ShieldAlert className="size-3.5" />}
          {!compact && <span>{clean ? "Secure" : `${count} alert${count > 1 ? "s" : ""}`}</span>}
          {compact && !clean && (
            <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-destructive text-[9px] font-semibold text-destructive-foreground">
              {count > 9 ? "9+" : count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b border-border px-3 py-2">
          <p className="text-sm font-medium">Security alerts</p>
          <p className="text-[11px] text-muted-foreground">
            Raised after each deployment scan and by the nightly database check.
          </p>
        </div>
        <div className="max-h-72 overflow-y-auto">
          {clean ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              Nothing open. The last checks came back clean.
            </p>
          ) : (
            findings.slice(0, 8).map((f) => (
              <div key={f.id} className="border-b border-border/60 px-3 py-2 last:border-0">
                <div className="flex items-start gap-2">
                  <span
                    className={cn(
                      "shrink-0 rounded border px-1.5 py-0.5 text-[9px] uppercase",
                      SEVERITY_TONE[f.severity],
                    )}
                  >
                    {f.severity}
                  </span>
                  <p className="min-w-0 text-xs font-medium">{f.title}</p>
                </div>
                <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">{f.detail}</p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {SOURCE_LABEL[f.source]}
                  {f.deploymentRef ? ` · ${f.deploymentRef}` : ""}
                </p>
              </div>
            ))
          )}
        </div>
        <div className="border-t border-border p-2">
          <Button asChild size="sm" variant="secondary" className="w-full text-xs">
            <Link to="/settings/security-alerts" onClick={() => setOpen(false)}>
              Review all findings
            </Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
