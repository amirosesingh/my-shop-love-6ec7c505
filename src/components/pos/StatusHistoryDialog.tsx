/**
 * The story of one record.
 *
 * Shows every state it has been through — what it was, what it became, who
 * moved it, why and when — newest first. Read-only: history is added to by
 * the actions themselves and can never be edited here.
 */
import { useEffect, useState } from "react";
import { History } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { loadStatusHistory } from "@/lib/status-history.functions";
import { readCredentials } from "@/lib/pos-credentials";
import type { HistoryEntity } from "@/lib/status-history";

type Entry = {
  status_kind: string;
  previous_status: string | null;
  new_status: string;
  reason: string | null;
  actor_name: string | null;
  actor_role: string | null;
  occurred_at: string;
};

const pretty = (value: string | null) =>
  !value ? "—" : value.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
};

export function StatusHistoryDialog({
  entity,
  entityId,
  title,
  open,
  onOpenChange,
}: {
  entity: HistoryEntity;
  entityId: string;
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let live = true;
    setEntries(null);
    setError(null);
    void (async () => {
      try {
        const creds = await readCredentials();
        const res = await loadStatusHistory({
          data: {
            entityType: entity,
            entityId,
            ...(creds?.sessionToken ? { sessionToken: creds.sessionToken } : {}),
            ...(creds?.cashierToken ? { cashierToken: creds.cashierToken } : {}),
            ...(creds?.terminalToken ? { terminalToken: creds.terminalToken } : {}),
            ...(creds?.accessToken ? { accessToken: creds.accessToken } : {}),
          },
        });
        if (!live) return;
        if (!res.ok) {
          setError(res.error ?? "History could not be read");
          setEntries([]);
          return;
        }
        setEntries(res.entries as Entry[]);
      } catch {
        if (!live) return;
        setError("History is only available when this till is connected.");
        setEntries([]);
      }
    })();
    return () => {
      live = false;
    };
  }, [open, entity, entityId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="size-4" aria-hidden="true" />
            History · {title}
          </DialogTitle>
          <DialogDescription>
            Every change to this record, newest first. Nothing here can be edited.
          </DialogDescription>
        </DialogHeader>

        {entries === null ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Reading history…</p>
        ) : entries.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {error ?? "No changes have been recorded for this record yet."}
          </p>
        ) : (
          <ol className="max-h-96 space-y-3 overflow-y-auto pr-1">
            {entries.map((e, i) => (
              <li
                key={`${e.occurred_at}-${i}`}
                className="rounded-md border border-border bg-card p-3 text-sm"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">
                    {pretty(e.previous_status)} → {pretty(e.new_status)}
                  </span>
                  <span className="text-xs text-muted-foreground">{when(e.occurred_at)}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {e.status_kind !== "status" ? `${pretty(e.status_kind)} · ` : ""}
                  {e.actor_name ?? "Unknown"}
                  {e.actor_role ? ` (${e.actor_role})` : ""}
                </p>
                {e.reason ? <p className="mt-2">{e.reason}</p> : null}
              </li>
            ))}
          </ol>
        )}
      </DialogContent>
    </Dialog>
  );
}
