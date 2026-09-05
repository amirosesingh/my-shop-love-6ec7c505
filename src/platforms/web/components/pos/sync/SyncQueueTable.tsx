/**
 * THE list of changes this till has not got confirmed yet.
 *
 * One table, used once, on the Sync page: what the change was, which branch
 * and till it came from, when it happened, why it is stuck, how many attempts
 * it has had and when it will next be tried. Retry one, retry every parked
 * change, or discard — discarding always puts the local copy back so the till
 * never keeps showing something that will never be sent.
 */
import { useEffect, useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { describeError, showNotification } from "@/lib/notify";
import { drainOutbox } from "@/lib/sync-engine";
import type { SyncFailureKind } from "@/lib/sync-log";
import { queueFailureKind } from "@/lib/sync-summary";
import {
  discardOp,
  discardQuarantined,
  queueView,
  retryOp,
  retryQuarantined,
  subscribeOutbox,
  type QueueView,
} from "@/lib/sync-outbox";
import { cn } from "@/lib/utils";

const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString() : "—");

const STATE_LABEL: Record<QueueView["state"], string> = {
  waiting: "Waiting to send",
  retrying: "Retrying",
  refused: "Needs attention",
};

const REASON_LABEL: Record<SyncFailureKind, string> = {
  network: "Connection",
  auth: "Sign-in",
  conflict: "Clash",
  validation: "Data problem",
  unknown: "Unknown",
};

const REASON_CLASS: Record<SyncFailureKind, string> = {
  network: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  auth: "border-destructive/40 bg-destructive/10 text-destructive",
  conflict: "border-primary/40 bg-primary/10 text-primary",
  validation: "border-destructive/40 bg-destructive/10 text-destructive",
  unknown: "border-border bg-muted text-muted-foreground",
};

type Filter = "all" | "waiting" | "refused";

export function SyncQueueTable({ className }: { className?: string }) {
  const [rows, setRows] = useState<QueueView[]>(() => queueView());
  const [filter, setFilter] = useState<Filter>("all");
  const [reason, setReason] = useState<"all" | SyncFailureKind>("all");

  useEffect(() => {
    const refresh = () => setRows(queueView());
    refresh();
    const off = subscribeOutbox(refresh);
    const timer = window.setInterval(refresh, 5000);
    return () => {
      off();
      window.clearInterval(timer);
    };
  }, []);

  const shown = useMemo(
    () =>
      rows.filter((row) => {
        if (filter === "refused" && row.state !== "refused") return false;
        if (filter === "waiting" && row.state === "refused") return false;
        if (reason !== "all" && queueFailureKind(row) !== reason) return false;
        return true;
      }),
    [rows, filter, reason],
  );

  const refused = rows.filter((r) => r.state === "refused");

  if (!rows.length) {
    return (
      <p
        className={cn(
          "rounded-md border border-border px-3 py-2 text-xs text-muted-foreground",
          className,
        )}
      >
        Nothing is waiting — every change on this till has reached the central database.
      </p>
    );
  }

  return (
    <section className={cn("space-y-2 rounded-md border border-border p-3", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto text-sm font-medium">Changes held on this till ({rows.length})</p>
        <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
          All
        </FilterChip>
        <FilterChip active={filter === "waiting"} onClick={() => setFilter("waiting")}>
          Waiting
        </FilterChip>
        <FilterChip active={filter === "refused"} onClick={() => setFilter("refused")}>
          Needs attention ({refused.length})
        </FilterChip>
        <select
          aria-label="Filter by reason"
          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          value={reason}
          onChange={(e) => setReason(e.target.value as "all" | SyncFailureKind)}
        >
          <option value="all">Every reason</option>
          {(Object.keys(REASON_LABEL) as SyncFailureKind[]).map((kind) => (
            <option key={kind} value={kind}>
              {REASON_LABEL[kind]}
            </option>
          ))}
        </select>
      </div>

      <p className="text-xs text-muted-foreground">
        These are already saved on this till and are safe. They are sent in the order they happened
        as soon as the connection allows.
      </p>

      {refused.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              retryQuarantined();
              void drainOutbox();
              showNotification("Retrying every parked change", "success");
            }}
          >
            <RotateCcw className="size-3.5" /> Retry all ({refused.length})
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive"
            onClick={() => {
              const typed = window.prompt(
                `Discard ${refused.length} change(s) for good?\n\nThey will never reach the central database. Type DISCARD to confirm.`,
              );
              if (typed?.trim().toUpperCase() !== "DISCARD") return;
              discardQuarantined();
              showNotification(`${refused.length} change(s) discarded`, "success");
            }}
          >
            Discard all
          </Button>
        </div>
      )}

      <div className="max-h-96 overflow-auto rounded-md border border-border">
        <table className="w-full min-w-[680px] text-left text-xs">
          <thead className="sticky top-0 bg-muted/60 text-muted-foreground">
            <tr>
              <th className="px-2 py-1.5 font-medium">Change</th>
              <th className="px-2 py-1.5 font-medium">Happened</th>
              <th className="px-2 py-1.5 font-medium">Branch / till</th>
              <th className="px-2 py-1.5 font-medium">Status</th>
              <th className="px-2 py-1.5 font-medium">Reason</th>
              <th className="px-2 py-1.5 font-medium">Tries</th>
              <th className="px-2 py-1.5 font-medium">Next try</th>
              <th className="px-2 py-1.5" />
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr>
                <td colSpan={8} className="px-2 py-3 text-muted-foreground">
                  Nothing matches this filter.
                </td>
              </tr>
            )}
            {shown.map((row) => {
              const kind = queueFailureKind(row);
              return (
                <tr key={row.id} className="border-t border-border align-top">
                  <td className="px-2 py-1.5">
                    <span className="block">{row.context}</span>
                    <span className="text-muted-foreground">{row.op.table}</span>
                  </td>
                  <td className="numeric px-2 py-1.5">{when(row.occurredAt ?? row.createdAt)}</td>
                  <td className="px-2 py-1.5 text-muted-foreground">
                    {row.branchId ?? "—"}
                    {row.terminalId ? ` · ${row.terminalId}` : ""}
                  </td>
                  <td className="px-2 py-1.5">
                    <span className={row.state === "refused" ? "text-destructive" : ""}>
                      {STATE_LABEL[row.state]}
                    </span>
                  </td>
                  <td className="px-2 py-1.5">
                    {kind ? (
                      <>
                        <Badge variant="outline" className={REASON_CLASS[kind]}>
                          {REASON_LABEL[kind]}
                        </Badge>
                        <span className="mt-0.5 block text-muted-foreground">
                          {describeError(row.reason, "Sending this change")}
                        </span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="numeric px-2 py-1.5 text-muted-foreground">{row.attempts}</td>
                  <td className="numeric px-2 py-1.5 text-muted-foreground">
                    {row.state === "refused" ? "Paused" : when(row.nextAttemptAt)}
                  </td>
                  <td className="px-2 py-1.5 text-right whitespace-nowrap">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        retryOp(row.id);
                        void drainOutbox();
                      }}
                    >
                      Retry
                    </Button>
                    {row.state === "refused" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => {
                          const ok = window.confirm(
                            `Discard "${row.context}"? This change will never reach the central database.`,
                          );
                          if (!ok) return;
                          discardOp(row.id);
                          showNotification("Change discarded", "success");
                        }}
                      >
                        Discard
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md border px-2 py-1 text-xs",
        active ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground",
      )}
    >
      {children}
    </button>
  );
}
