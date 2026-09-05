import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { AppShell } from "@/platforms/web/components/pos/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemedSelect } from "@/platforms/web/components/pos/ThemedSelect";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TablePagination, usePagination } from "@/platforms/web/components/pos/TablePagination";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/pos-auth";
import {
  EVENT_CATALOG,
  EVENT_LABELS,
  SEVERITY_TONE,
  isActivityLogMissing,
  listActivityEvents,
  markActivitySeen,
  toCsv,
  type ActivityEvent,
  type EventSeverity,
} from "@/lib/activity-events";

const TYPE_OPTIONS = [
  { value: "all", label: "All events" },
  ...EVENT_CATALOG.flatMap((g) => g.types.map((t) => ({ value: t.type, label: t.label }))),
];

const SEVERITY_OPTIONS = [
  { value: "all", label: "Any importance" },
  { value: "critical", label: "Critical" },
  { value: "warning", label: "Warning" },
  { value: "info", label: "Information" },
];

const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
};

function NotificationsReport() {
  const { isSupervisor } = useAuth();
  const [rows, setRows] = useState<ActivityEvent[]>([]);
  const [type, setType] = useState("all");
  const [severity, setSeverity] = useState("all");
  const [actor, setActor] = useState("");
  const [busy, setBusy] = useState(false);
  const [missing, setMissing] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    const list = await listActivityEvents({
      limit: 500,
      types: type === "all" ? undefined : [type],
      severities: severity === "all" ? undefined : [severity as EventSeverity],
    });
    setRows(list);
    setMissing(isActivityLogMissing());
    markActivitySeen(list[0]?.createdAt ?? new Date().toISOString());
    setBusy(false);
  }, [type, severity]);

  useEffect(() => {
    if (isSupervisor) void load();
  }, [isSupervisor, load]);

  const filtered = useMemo(() => {
    const needle = actor.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(
      (r) =>
        r.actorName.toLowerCase().includes(needle) ||
        r.title.toLowerCase().includes(needle) ||
        r.message.toLowerCase().includes(needle),
    );
  }, [rows, actor]);

  const page = usePagination(filtered);
  const visible = page.pageItems;

  const exportCsv = () => {
    const url = URL.createObjectURL(
      new Blob([toCsv(filtered)], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `activity-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isSupervisor) {
    return (
      <AppShell>
        <p className="p-6 text-sm text-muted-foreground">
          The activity log is available to supervisors and admins.
        </p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-4 p-4">
        {missing && (
          <p className="rounded-md border border-border bg-surface-2 p-3 text-xs text-muted-foreground">
            The activity log is not set up on this database yet. Run{" "}
            <span className="font-medium">supabase/schema.sql</span> once
            against your database to start recording events.
          </p>
        )}
        <div className="flex flex-wrap items-end gap-3">
          <div className="mr-auto">
            <h1 className="text-lg font-semibold">Activity & notifications</h1>
            <p className="text-xs text-muted-foreground">
              Every recorded sign-in, shift, sale, drawer open and staff change, with WhatsApp
              delivery status.
            </p>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Event</Label>
            <ThemedSelect
              className="h-9 w-56"
              value={type}
              onChange={setType}
              options={TYPE_OPTIONS}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Importance</Label>
            <ThemedSelect
              className="h-9 w-40"
              value={severity}
              onChange={setSeverity}
              options={SEVERITY_OPTIONS}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Search</Label>
            <Input
              className="h-9 w-52"
              placeholder="Person or text"
              value={actor}
              onChange={(e) => setActor(e.target.value)}
            />
          </div>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={busy}>
            <RefreshCw className={cn("size-4", busy && "animate-spin")} /> Refresh
          </Button>
          <Button variant="secondary" size="sm" onClick={exportCsv}>
            <Download className="size-4" /> Export CSV
          </Button>
        </div>

        <div className="rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-44">When</TableHead>
                <TableHead className="w-40">Event</TableHead>
                <TableHead>What happened</TableHead>
                <TableHead className="w-40">Person</TableHead>
                <TableHead className="w-32">Terminal</TableHead>
                <TableHead className="w-24">Branch</TableHead>
                <TableHead className="w-28">WhatsApp</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-xs text-muted-foreground">
                    No events match these filters.
                  </TableCell>
                </TableRow>
              ) : (
                visible.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs">{when(r.createdAt)}</TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "rounded border px-1.5 py-0.5 text-[10px]",
                          SEVERITY_TONE[r.severity],
                        )}
                      >
                        {EVENT_LABELS[r.type] ?? r.type}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs">
                      <p className="font-medium">{r.title}</p>
                      {r.message && <p className="text-muted-foreground">{r.message}</p>}
                    </TableCell>
                    <TableCell className="text-xs">
                      {r.actorName || "—"}
                      {r.actorRole && (
                        <span className="block text-[10px] capitalize text-muted-foreground">
                          {r.actorRole}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">{r.terminalName || "—"}</TableCell>
                    <TableCell className="text-xs">{r.storeId || "—"}</TableCell>
                    <TableCell className="text-xs capitalize">{r.whatsappStatus}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        <TablePagination
          page={page.page}
          pageCount={page.pageCount}
          pageSize={page.pageSize}
          total={page.total}
          from={page.from}
          to={page.to}
          label="events"
          onPage={page.setPage}
          onPageSize={page.setPageSize}
        />
      </div>
    </AppShell>
  );
}

export const Route = createFileRoute("/reports/notifications")({
  head: () => ({
    meta: [
      { title: "Activity & Notifications Log — Northwind POS" },
      {
        name: "description",
        content:
          "Searchable history of sign-ins, shift changes, sales, refunds, drawer opens and staff edits, with WhatsApp delivery status and CSV export.",
      },
      { property: "og:title", content: "Activity & Notifications Log — Northwind POS" },
      {
        property: "og:description",
        content: "Every till event with who did it, where, and whether an alert went out.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: NotificationsReport,
});