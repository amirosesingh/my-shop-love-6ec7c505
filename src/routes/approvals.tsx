/**
 * Pending approvals.
 *
 * Anyone allowed to authorise an action sees the requests waiting on them and
 * decides from their own signed-in session — no PIN, because they are already
 * authenticated. Everything decided here is written to the authorisation log.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Check, Clock3, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/platforms/web/components/pos/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { notifyError } from "@/lib/notify";
import { usePosOptional } from "@/lib/pos-store";
import { getPosCallerAuth } from "@/lib/pos-caller-auth";
import {
  cancelAuthorizationRequest,
  decideAuthorizationRequest,
  listAuthorizationRequests,
} from "@/lib/authorization.functions";
import { AUTH_ACTION_LABEL, type AuthorizationRequest } from "@/lib/authorization";

export const Route = createFileRoute("/approvals")({
  component: ApprovalsPage,
  head: () => ({
    meta: [
      { title: "Pending Approvals · Till" },
      {
        name: "description",
        content:
          "Review and decide authorisation requests raised at the tills — refunds, price overrides and edits to posted records.",
      },
      { property: "og:title", content: "Pending Approvals · Till" },
      {
        property: "og:description",
        content: "Approve or reject sensitive till actions waiting on authorisation.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const STATUS_TONE: Record<string, string> = {
  pending: "bg-amber-500/15 text-amber-600",
  approved: "bg-emerald-500/15 text-emerald-600",
  rejected: "bg-destructive/15 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
  expired: "bg-muted text-muted-foreground",
};

const ago = (iso: string) => {
  const ms = Date.now() - Date.parse(iso || "");
  if (!Number.isFinite(ms)) return "";
  const mins = Math.max(0, Math.round(ms / 60000));
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  return hrs < 24 ? `${hrs} h ago` : `${Math.round(hrs / 24)} d ago`;
};

function ApprovalsPage() {
  const pos = usePosOptional();
  const storeId = pos?.currentStore?.id ?? "";
  const [rows, setRows] = useState<AuthorizationRequest[]>([]);
  const [me, setMe] = useState<{ id: string; role: string } | null>(null);
  const [allBranches, setAllBranches] = useState(false);
  const [history, setHistory] = useState(false);
  const [note, setNote] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const auth = await getPosCallerAuth();
      const res = await listAuthorizationRequests({
        data: {
          ...auth,
          storeId,
          allBranches,
          status: history ? "all" : "pending",
        },
      });
      setError(res.ok ? "" : (res.error ?? ""));
      setRows(res.requests as AuthorizationRequest[]);
      setMe(res.ok ? (res.me ?? null) : null);
    } catch (e) {
      setError((e as Error).message);
    }
    setLoading(false);
  }, [storeId, allBranches, history]);

  useEffect(() => {
    void load();
  }, [load]);

  // The queue is decided from another screen, so it refreshes on its own and
  // whenever this window is looked at again.
  useEffect(() => {
    const timer = window.setInterval(() => void load(), 30_000);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  const decide = async (row: AuthorizationRequest, approve: boolean) => {
    setBusy(row.id);
    try {
      const auth = await getPosCallerAuth();
      const res = await decideAuthorizationRequest({
        data: { ...auth, id: row.id, approve, note: note[row.id] ?? "" },
      });
      if (!res.ok) toast.error(res.error ?? "Could not record the decision");
      else toast.success(approve ? "Approved" : "Rejected");
      await load();
    } catch (e) {
      notifyError(e, "Could not record the decision");
    }
    setBusy(null);
  };

  const withdraw = async (row: AuthorizationRequest) => {
    setBusy(row.id);
    try {
      const auth = await getPosCallerAuth();
      const res = await cancelAuthorizationRequest({ data: { ...auth, id: row.id } });
      if (!res.ok) toast.error(res.error ?? "Could not cancel");
      await load();
    } catch (e) {
      notifyError(e, "Could not cancel");
    }
    setBusy(null);
  };

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-4xl space-y-4 p-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Pending approvals</h1>
            <p className="text-sm text-muted-foreground">
              Actions waiting on someone who is allowed to authorise them.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch id="all-branches" checked={allBranches} onCheckedChange={setAllBranches} />
              <Label htmlFor="all-branches" className="text-xs">
                All branches
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="history" checked={history} onCheckedChange={setHistory} />
              <Label htmlFor="history" className="text-xs">
                Include decided
              </Label>
            </div>
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={`mr-1 size-4 ${loading ? "animate-spin" : ""}`} /> Refresh
            </Button>
          </div>
        </header>

        {error ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        {!loading && rows.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
              <Clock3 className="size-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Nothing is waiting for a decision right now.
              </p>
            </CardContent>
          </Card>
        ) : null}

        {rows.map((row) => {
          const mine = !!me && row.requestedBy.toLowerCase() === me.id.toLowerCase();
          const payload = Object.entries(row.payload ?? {});
          return (
            <Card key={row.id}>
              <CardHeader className="flex flex-row items-start justify-between gap-3 pb-2">
                <div>
                  <CardTitle className="text-base">
                    {AUTH_ACTION_LABEL[row.actionKey] ?? row.actionKey}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {row.requestedByName || row.requestedBy} · {row.storeId || "all branches"}
                    {row.terminalId ? ` · ${row.terminalId}` : ""} · {ago(row.createdAt)}
                  </p>
                </div>
                <Badge className={STATUS_TONE[row.status] ?? ""} variant="secondary">
                  {row.status}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                {row.reason ? <p className="text-sm">“{row.reason}”</p> : null}
                {payload.length ? (
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-md bg-muted/50 p-3 text-xs">
                    {payload.map(([k, v]) => (
                      <div key={k} className="contents">
                        <dt className="text-muted-foreground">{k.replace(/_/g, " ")}</dt>
                        <dd className="font-medium">{String(v)}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
                {row.status === "pending" ? (
                  mine ? (
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs text-muted-foreground">
                        Waiting for someone else to decide this.
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy === row.id}
                        onClick={() => void withdraw(row)}
                      >
                        Withdraw
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        className="h-9 flex-1 min-w-[12rem]"
                        placeholder="Note (optional)"
                        value={note[row.id] ?? ""}
                        onChange={(e) =>
                          setNote((n) => ({ ...n, [row.id]: e.target.value.slice(0, 400) }))
                        }
                      />
                      <Button
                        size="sm"
                        disabled={busy === row.id}
                        onClick={() => void decide(row, true)}
                      >
                        <Check className="mr-1 size-4" /> Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy === row.id}
                        onClick={() => void decide(row, false)}
                      >
                        <X className="mr-1 size-4" /> Reject
                      </Button>
                    </div>
                  )
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {row.decidedByName || row.decidedBy
                      ? `${row.status} by ${row.decidedByName || row.decidedBy}`
                      : row.status}
                    {row.decisionNote ? ` — ${row.decisionNote}` : ""}
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </AppShell>
  );
}
