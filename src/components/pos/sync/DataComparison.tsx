/**
 * Server vs. shop data comparison.
 *
 * Holds this till's own tables next to the company server's copy of the same
 * branch, table by table, so a manager can see at a glance whether anything
 * recorded here has failed to travel — and push or pull the difference.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

import { compareServerRows, compareServerSummary } from "@/lib/data-compare.functions";
import {
  buildComparison,
  diffRows,
  overallVerdict,
  windowStart,
  WINDOW_LABELS,
  VERDICT_LABELS,
  type CompareSide,
  type CompareTableRow,
  type CompareVerdict,
  type CompareWindow,
  type RowDiff,
} from "@/lib/data-compare";
import { getPosCallerAuth } from "@/lib/pos-caller-auth";
import { localDb } from "@/core/local-db/local-db";

const VERDICT_TONE: Record<CompareVerdict, string> = {
  matched: "border-emerald-500/40 text-emerald-600 dark:text-emerald-400",
  "to-upload": "border-amber-500/40 text-amber-600 dark:text-amber-400",
  "to-download": "border-sky-500/40 text-sky-600 dark:text-sky-400",
  mismatch: "border-destructive/40 text-destructive",
  unknown: "border-muted-foreground/30 text-muted-foreground",
};

const stamp = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleString() : "—";

export function DataComparison() {
  const bridge = localDb();
  const [win, setWin] = useState<CompareWindow>("7d");
  const [loading, setLoading] = useState(false);
  const [shop, setShop] = useState<CompareSide[] | null>(null);
  const [server, setServer] = useState<CompareSide[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [openTable, setOpenTable] = useState<string | null>(null);
  const [rowDiff, setRowDiff] = useState<(RowDiff & { table: string }) | null>(null);
  const [busyRows, setBusyRows] = useState(false);

  const since = useMemo(() => windowStart(win), [win]);

  const compare = useCallback(async () => {
    setLoading(true);
    setError(null);
    setRowDiff(null);
    setOpenTable(null);
    try {
      const auth = await getPosCallerAuth();
      const [local, remote] = await Promise.all([
        bridge?.compareSummary
          ? bridge.compareSummary({ since }).catch((err: unknown) => ({
              ok: false,
              error: err instanceof Error ? err.message : String(err),
            }))
          : Promise.resolve(null),
        compareServerSummary({
          data: {
            ...(auth.accessToken ? { accessToken: auth.accessToken } : {}),
            ...(auth.cashierToken ? { cashierToken: auth.cashierToken } : {}),
            since,
          },
        }).catch((err: unknown) => ({
          ok: false as const,
          error: err instanceof Error ? err.message : String(err),
          tables: [],
        })),
      ]);

      setShop(local && "tables" in local ? (local.tables ?? null) : null);
      setServer(remote.ok ? remote.tables : null);
      if (!remote.ok) setError(remote.error ?? "The server refused the comparison.");
      else if (local && !local.ok) setError(local.error ?? "This till's database did not answer.");
      else if (!bridge?.compareSummary)
        setError("Shop-side figures need the desktop till app; only server counts are shown.");
      setCheckedAt(new Date().toISOString());
    } finally {
      setLoading(false);
    }
  }, [bridge, since]);

  useEffect(() => {
    void compare();
  }, [compare]);

  const rows = useMemo(() => buildComparison(shop, server), [shop, server]);
  const verdict = overallVerdict(rows);
  const differing = rows.filter((r) => r.verdict === "to-upload" || r.verdict === "to-download");

  const inspect = useCallback(
    async (table: string) => {
      if (openTable === table) {
        setOpenTable(null);
        setRowDiff(null);
        return;
      }
      setOpenTable(table);
      setRowDiff(null);
      setBusyRows(true);
      try {
        const auth = await getPosCallerAuth();
        const [local, remote] = await Promise.all([
          bridge?.compareRows ? bridge.compareRows(table, { since }) : Promise.resolve(null),
          compareServerRows({
            data: {
              table,
              ...(auth.accessToken ? { accessToken: auth.accessToken } : {}),
              ...(auth.cashierToken ? { cashierToken: auth.cashierToken } : {}),
              since,
            },
          }),
        ]);
        setRowDiff({ table, ...diffRows(local?.rows ?? [], remote.rows ?? []) });
        if (!remote.ok) toast.error(remote.error ?? "Could not read the server records.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not compare the records.");
      } finally {
        setBusyRows(false);
      }
    },
    [bridge, openTable, since],
  );

  const runSync = useCallback(
    async (direction: "push" | "pull") => {
      if (!bridge) {
        toast.error("Syncing runs from the desktop till app.");
        return;
      }
      const res = direction === "push" ? await bridge.push() : await bridge.pull();
      if (!res.ok) {
        toast.error(res.error ?? `Could not ${direction} the outstanding records.`);
        return;
      }
      toast.success(direction === "push" ? "Uploaded to the server." : "Downloaded from the server.");
      void compare();
    },
    [bridge, compare],
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              Server vs. shop data
              <Badge variant="outline" className={VERDICT_TONE[verdict]}>
                {VERDICT_LABELS[verdict]}
              </Badge>
            </CardTitle>
            <CardDescription>
              Live record counts on this till held next to the company server for this branch.
              {checkedAt ? ` Checked ${stamp(checkedAt)}.` : ""}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={win} onValueChange={(v) => setWin(v as CompareWindow)}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(WINDOW_LABELS) as CompareWindow[]).map((key) => (
                  <SelectItem key={key} value={key}>
                    {WINDOW_LABELS[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => void compare()} disabled={loading}>
              <RefreshCw className={`mr-2 size-4 ${loading ? "animate-spin" : ""}`} />
              Compare again
            </Button>
            <Button variant="outline" onClick={() => void runSync("push")} disabled={!bridge}>
              <ArrowUpFromLine className="mr-2 size-4" />
              Upload
            </Button>
            <Button variant="outline" onClick={() => void runSync("pull")} disabled={!bridge}>
              <ArrowDownToLine className="mr-2 size-4" />
              Download
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {error ? (
            <p className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-400">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              {error}
            </p>
          ) : null}

          {loading && !shop && !server ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="py-2">Records</th>
                    <th className="py-2 text-right">This shop</th>
                    <th className="py-2 text-right">Server</th>
                    <th className="py-2 text-right">Difference</th>
                    <th className="py-2">Newest here</th>
                    <th className="py-2">Newest on server</th>
                    <th className="py-2">Status</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <TableRow key={row.table} row={row} onInspect={() => void inspect(row.table)} />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {differing.length && !loading ? (
            <p className="text-xs text-muted-foreground">
              {differing.length} table{differing.length === 1 ? "" : "s"} differ. Open a row to see
              exactly which records are missing on each side.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {openTable ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Records that differ — {openTable}</CardTitle>
            <CardDescription>
              {busyRows ? "Reading both sides…" : "Identifiers only; no customer detail is shown."}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <IdList
              title="Only on this shop"
              hint="Waiting to upload"
              ids={(rowDiff?.shopOnly ?? []).map((r) => r.id)}
              busy={busyRows}
            />
            <IdList
              title="Only on the server"
              hint="Not yet downloaded"
              ids={(rowDiff?.serverOnly ?? []).map((r) => r.id)}
              busy={busyRows}
            />
            <IdList
              title="Changed on both sides"
              hint="Newest copy wins on sync"
              ids={(rowDiff?.different ?? []).map((r) => r.id)}
              busy={busyRows}
            />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function TableRow({ row, onInspect }: { row: CompareTableRow; onInspect: () => void }) {
  const diff = row.difference;
  return (
    <tr className="border-t">
      <td className="py-2 font-medium">{row.label}</td>
      <td className="py-2 text-right tabular-nums">{row.shop ? row.shop.count : "—"}</td>
      <td className="py-2 text-right tabular-nums">{row.server ? row.server.count : "—"}</td>
      <td className="py-2 text-right tabular-nums">
        {row.shop && row.server ? (diff > 0 ? `+${diff}` : diff) : "—"}
      </td>
      <td className="py-2 text-xs text-muted-foreground">{stamp(row.shop?.maxUpdatedAt)}</td>
      <td className="py-2 text-xs text-muted-foreground">{stamp(row.server?.maxUpdatedAt)}</td>
      <td className="py-2">
        <Badge variant="outline" className={VERDICT_TONE[row.verdict]}>
          {VERDICT_LABELS[row.verdict]}
        </Badge>
      </td>
      <td className="py-2 text-right">
        <Button variant="ghost" size="sm" onClick={onInspect}>
          Inspect
        </Button>
      </td>
    </tr>
  );
}

function IdList({
  title,
  hint,
  ids,
  busy,
}: {
  title: string;
  hint: string;
  ids: string[];
  busy: boolean;
}) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-sm font-medium">
        {title} <span className="text-muted-foreground">({busy ? "…" : ids.length})</span>
      </p>
      <p className="mb-2 text-xs text-muted-foreground">{hint}</p>
      <div className="max-h-56 space-y-1 overflow-y-auto font-mono text-xs">
        {ids.slice(0, 200).map((id) => (
          <p key={id} className="truncate text-muted-foreground">
            {id}
          </p>
        ))}
        {!busy && !ids.length ? <p className="text-muted-foreground">Nothing outstanding.</p> : null}
      </div>
    </div>
  );
}
