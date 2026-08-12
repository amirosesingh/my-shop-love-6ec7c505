/**
 * Header bell for the live activity feed: sign-ins, shifts, sales, refunds,
 * drawer opens and staff changes as they happen. Admins and supervisors only.
 */
import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/pos-auth";
import {
  EVENT_LABELS,
  SEVERITY_TONE,
  flushActivityQueue,
  isActivityLogMissing,
  listActivityEvents,
  markActivitySeen,
  unseenEvents,
  type ActivityEvent,
} from "@/lib/activity-events";

const POLL_MS = 45_000;

const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString();
};

export function ActivityBell({ compact }: { compact?: boolean }) {
  const { isSupervisor } = useAuth();
  const allowed = isSupervisor;
  const [rows, setRows] = useState<ActivityEvent[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [missing, setMissing] = useState(false);

  const refresh = useCallback(async () => {
    void flushActivityQueue();
    const list = await listActivityEvents({ limit: 40 });
    if (isActivityLogMissing()) {
      setMissing(true);
      return;
    }
    setRows(list);
    const fresh = unseenEvents(list);
    setUnread(fresh.length);
    const critical = fresh.find((r) => r.severity === "critical");
    if (critical) {
      toast.warning(critical.title, { description: critical.message || undefined });
    }
  }, []);

  useEffect(() => {
    if (!allowed) return;
    void refresh();
    const t = setInterval(() => {
      // Stop polling a database that has no activity log.
      if (isActivityLogMissing()) {
        clearInterval(t);
        return;
      }
      void refresh();
    }, POLL_MS);
    return () => clearInterval(t);
  }, [allowed, refresh]);

  if (!allowed) return null;

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) {
          markActivitySeen(rows[0]?.createdAt ?? new Date().toISOString());
          setUnread(0);
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size={compact ? "icon" : "sm"}
          aria-label={unread ? `Activity: ${unread} new events` : "Activity feed"}
          className={cn(
            "relative h-8 shrink-0",
            compact ? "w-8" : "px-2 text-[11px]",
            unread ? "border-primary/40 bg-primary/10 text-primary" : "",
          )}
        >
          <Bell className="size-3.5" />
          {!compact && <span>{unread ? `${unread} new` : "Activity"}</span>}
          {compact && unread > 0 && (
            <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-primary text-[9px] font-semibold text-primary-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="border-b border-border px-3 py-2">
          <p className="text-sm font-medium">Activity</p>
          <p className="text-[11px] text-muted-foreground">
            Sign-ins, shifts, sales and stock changes from every terminal.
          </p>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {missing ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              The activity log is not set up on this database yet. Run
              <span className="font-medium"> supabase/sql/35_activity_and_token_columns.sql</span> to
              switch it on.
            </p>
          ) : rows.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              Nothing has happened yet today.
            </p>
          ) : (
            rows.slice(0, 12).map((r) => (
              <div key={r.id} className="border-b border-border/60 px-3 py-2 last:border-0">
                <div className="flex items-start gap-2">
                  <span
                    className={cn(
                      "shrink-0 rounded border px-1.5 py-0.5 text-[9px] uppercase",
                      SEVERITY_TONE[r.severity],
                    )}
                  >
                    {EVENT_LABELS[r.type] ? r.severity : r.type}
                  </span>
                  <p className="min-w-0 text-xs font-medium">{r.title}</p>
                </div>
                {r.message && (
                  <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">{r.message}</p>
                )}
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {when(r.createdAt)}
                  {r.actorName ? ` · ${r.actorName}` : ""}
                  {r.storeId ? ` · ${r.storeId}` : ""}
                  {r.whatsappStatus === "sent" ? " · WhatsApp sent" : ""}
                </p>
              </div>
            ))
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 border-t border-border p-2">
          <Button asChild size="sm" variant="secondary" className="text-xs">
            <Link to="/reports/notifications" onClick={() => setOpen(false)}>
              Open full log
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="text-xs">
            <Link to="/settings/notifications" onClick={() => setOpen(false)}>
              Alert settings
            </Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}