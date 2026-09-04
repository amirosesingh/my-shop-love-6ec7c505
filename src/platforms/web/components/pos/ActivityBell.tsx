/**
 * The Approval & Activity Centre in the header.
 *
 * One bell for everybody: cashiers see the requests they sent and the
 * decisions that have come back, approvers see what is waiting for them, and
 * supervisors keep the branch activity feed they already had. Clearing an
 * entry only hides it for the person who cleared it — the request, the
 * decision and the audit trail are never touched.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
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
  clearActivityEntry,
  clearedIds,
  reopenActivityEntry,
  type ActivityEvent,
} from "@/lib/activity-events";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CENTRE_POLL_MS,
  loadApprovalCentre,
  subscribeApprovals,
  type CentreView,
} from "@/lib/approval-centre";
import { AUTH_ACTION_LABEL, type AuthorizationRequest } from "@/lib/authorization";

const POLL_MS = 45_000;

const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString();
};

export function ActivityBell({ compact }: { compact?: boolean }) {
  const { isSupervisor, user } = useAuth();
  // Everyone gets the centre; only supervisors get the branch activity feed.
  const showActivity = isSupervisor;
  const allowed = true;
  const [centre, setCentre] = useState<CentreView | null>(null);
  const [clearedTick, setClearedTick] = useState(0);
  const meKey = user?.staffId ?? user?.name ?? "";
  const [rows, setRows] = useState<ActivityEvent[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [missing, setMissing] = useState(false);

  const refreshCentre = useCallback(async () => {
    try {
      setCentre(await loadApprovalCentre());
    } catch {
      /* offline — the poll will pick it up again */
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!showActivity) return;
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

  // Live decisions, with the existing poll kept as reconciliation.
  useEffect(() => {
    void refreshCentre();
    const off = subscribeApprovals(() => void refreshCentre());
    const t = setInterval(() => void refreshCentre(), CENTRE_POLL_MS);
    const onCleared = () => setClearedTick((n) => n + 1);
    window.addEventListener("pos:activity-cleared-changed", onCleared);
    return () => {
      off();
      clearInterval(t);
      window.removeEventListener("pos:activity-cleared-changed", onCleared);
    };
  }, [refreshCentre]);

  useEffect(() => {
    if (!showActivity) return;
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
  }, [showActivity, refresh]);

  const hidden = useMemo(() => new Set(clearedIds(meKey)), [meKey, clearedTick]);
  const visibleRows = rows.filter((r) => !hidden.has(r.id));
  const toDecide = (centre?.toDecide ?? []).filter((r) => !hidden.has(r.id));
  const waiting = (centre?.waiting ?? []).filter((r) => !hidden.has(r.id));
  const ready = (centre?.ready ?? []).filter((r) => !hidden.has(r.id));
  const history = centre?.history ?? [];
  const clearedCount = hidden.size;
  const badge = unread + toDecide.length + ready.length;

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
          aria-label={badge ? `Approvals and activity: ${badge} new` : "Approvals and activity"}
          className={cn(
            "relative h-8 shrink-0",
            compact ? "w-8" : "px-2 text-[11px]",
            badge ? "border-primary/40 bg-primary/10 text-primary" : "",
          )}
        >
          <Bell className="size-3.5" />
          {!compact && <span>{badge ? `${badge} new` : "Activity"}</span>}
          {compact && badge > 0 && (
            <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-primary text-[9px] font-semibold text-primary-foreground">
              {badge > 9 ? "9+" : badge}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[26rem] p-0">
        <div className="border-b border-border px-3 py-2">
          <p className="text-sm font-medium">Approvals &amp; activity</p>
          <p className="text-[11px] text-muted-foreground">
            Requests waiting on you, decisions on yours, and what is happening in the branch.
          </p>
        </div>

        <Tabs defaultValue={toDecide.length ? "decide" : ready.length ? "ready" : "waiting"}>
          <TabsList className="grid w-full grid-cols-5 rounded-none">
            <TabsTrigger value="decide" className="text-[10px]">
              Decide{toDecide.length ? ` ${toDecide.length}` : ""}
            </TabsTrigger>
            <TabsTrigger value="waiting" className="text-[10px]">
              Waiting{waiting.length ? ` ${waiting.length}` : ""}
            </TabsTrigger>
            <TabsTrigger value="ready" className="text-[10px]">
              Ready{ready.length ? ` ${ready.length}` : ""}
            </TabsTrigger>
            <TabsTrigger value="activity" className="text-[10px]">
              Activity
            </TabsTrigger>
            <TabsTrigger value="cleared" className="text-[10px]">
              Cleared{clearedCount ? ` ${clearedCount}` : ""}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="decide" className="m-0 max-h-80 overflow-y-auto">
            <RequestList
              rows={toDecide}
              empty="Nothing is waiting for your decision."
              onClear={(id) => clearActivityEntry(meKey, id)}
              actionLabel="Review"
              onAction={() => setOpen(false)}
            />
          </TabsContent>

          <TabsContent value="waiting" className="m-0 max-h-80 overflow-y-auto">
            <RequestList
              rows={waiting}
              empty="You have nothing waiting for approval."
              onClear={(id) => clearActivityEntry(meKey, id)}
            />
          </TabsContent>

          <TabsContent value="ready" className="m-0 max-h-80 overflow-y-auto">
            <RequestList
              rows={ready}
              empty="No decisions to pick up."
              onClear={(id) => clearActivityEntry(meKey, id)}
            />
          </TabsContent>

          <TabsContent value="activity" className="m-0 max-h-80 overflow-y-auto">
            {!showActivity ? (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                The branch activity feed is for supervisors.
              </p>
            ) : missing ? (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                The activity log is not set up on this database yet. Run
                <span className="font-medium">
                  {" "}
                  supabase/sql/35_activity_and_token_columns.sql
                </span>{" "}
                to switch it on.
              </p>
            ) : visibleRows.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                Nothing has happened yet today.
              </p>
            ) : (
              visibleRows.slice(0, 12).map((r) => (
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
                    <button
                      type="button"
                      className="ml-auto text-[10px] text-muted-foreground underline"
                      onClick={() => clearActivityEntry(meKey, r.id)}
                    >
                      Clear
                    </button>
                  </div>
                  {r.message && (
                    <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                      {r.message}
                    </p>
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
          </TabsContent>

          <TabsContent value="cleared" className="m-0 max-h-80 overflow-y-auto">
            {clearedCount === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                Nothing has been cleared.
              </p>
            ) : (
              <>
                <p className="px-3 pt-2 text-[10px] text-muted-foreground">
                  Clearing only hides an entry here. Nothing is deleted.
                </p>
                {[...clearedIds(meKey)].reverse().map((id) => {
                  const row =
                    rows.find((r) => r.id === id) ??
                    [...(centre?.toDecide ?? []), ...(centre?.waiting ?? []), ...(centre?.ready ?? []), ...history].find(
                      (r) => r.id === id,
                    );
                  return (
                    <div
                      key={id}
                      className="flex items-center gap-2 border-b border-border/60 px-3 py-2 last:border-0"
                    >
                      <p className="min-w-0 flex-1 truncate text-xs">
                        {row && "title" in row
                          ? row.title
                          : row
                            ? (AUTH_ACTION_LABEL[(row as AuthorizationRequest).actionKey] ??
                              (row as AuthorizationRequest).actionKey)
                            : id}
                      </p>
                      <button
                        type="button"
                        className="text-[10px] text-primary underline"
                        onClick={() => reopenActivityEntry(meKey, id)}
                      >
                        Reopen
                      </button>
                    </div>
                  );
                })}
              </>
            )}
          </TabsContent>
        </Tabs>

        <div className="grid grid-cols-3 gap-2 border-t border-border p-2">
          <Button asChild size="sm" className="text-xs">
            <Link to="/approvals" onClick={() => setOpen(false)}>
              Approvals
            </Link>
          </Button>
          <Button asChild size="sm" variant="secondary" className="text-xs">
            <Link to="/reports/notifications" onClick={() => setOpen(false)}>
              Full log
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="text-xs">
            <Link to="/settings/notifications" onClick={() => setOpen(false)}>
              Alerts
            </Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** One row per request, in the same shape as an activity entry. */
function RequestList({
  rows,
  empty,
  onClear,
  actionLabel,
  onAction,
}: {
  rows: AuthorizationRequest[];
  empty: string;
  onClear: (id: string) => void;
  actionLabel?: string;
  onAction?: () => void;
}) {
  if (rows.length === 0) {
    return <p className="px-3 py-6 text-center text-xs text-muted-foreground">{empty}</p>;
  }
  return (
    <>
      {rows.map((r) => (
        <div key={r.id} className="border-b border-border/60 px-3 py-2 last:border-0">
          <div className="flex items-center gap-2">
            <p className="min-w-0 flex-1 truncate text-xs font-medium">
              {AUTH_ACTION_LABEL[r.actionKey] ?? r.actionKey}
            </p>
            {actionLabel ? (
              <Link
                to="/approvals"
                onClick={onAction}
                className="text-[10px] text-primary underline"
              >
                {actionLabel}
              </Link>
            ) : null}
            <button
              type="button"
              className="text-[10px] text-muted-foreground underline"
              onClick={() => onClear(r.id)}
            >
              Clear
            </button>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {r.reason || "No reason given"}
          </p>
          <p className="mt-1 text-[10px] text-muted-foreground">
            {when(r.createdAt)} · {r.requestedByName || r.requestedBy}
            {r.requestedAmount !== null ? ` · asked ${r.requestedAmount.toFixed(2)}` : ""}
            {r.approvedAmount !== null ? ` · approved ${r.approvedAmount.toFixed(2)}` : ""}
            {r.snapshot ? ` · ${r.snapshot.lines.length} item(s)` : ""}
          </p>
        </div>
      ))}
    </>
  );
}