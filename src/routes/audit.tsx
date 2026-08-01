import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  CloudOff,
  Cloud,
  Download,
  Eye,
  ShieldAlert,
  ShoppingCart,
  RefreshCw,
  Tag,
  MousePointerClick,
  Compass,
  Search as SearchIcon,
  PanelTop,
  UserRound,
  Settings2,
  List,
  Rows3,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/pos/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AUDIT_CATEGORIES,
  auditToCsv,
  logger,
  useAuditLogs,
  useSyncState,
  type AuditLog,
} from "@/lib/audit-log";
import { useAuth } from "@/lib/pos-auth";
import { describeLog } from "@/lib/audit-format";
import { TablePagination, usePagination } from "@/components/pos/TablePagination";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export const Route = createFileRoute("/audit")({
  head: () => ({
    meta: [
      { title: "Audit Logs & Activity Trail — Northwind POS" },
      {
        name: "description",
        content:
          "Filterable compliance trail of every click, sale, inventory edit and sync event captured across the point of sale.",
      },
      { property: "og:title", content: "Audit Logs & Activity Trail — Northwind POS" },
      {
        property: "og:description",
        content: "Staff activity telemetry with detail inspector and CSV export.",
      },
    ],
  }),
  component: AuditPage,
});

type RangeKey = "all" | "today" | "yesterday" | "custom";

const categoryVisual: Record<
  string,
  { icon: typeof ShoppingCart; className: string }
> = {
  sale_event: { icon: ShoppingCart, className: "bg-emerald-500/15 text-emerald-500" },
  inventory_edit: { icon: Tag, className: "bg-sky-500/15 text-sky-500" },
  member_event: { icon: UserRound, className: "bg-violet-500/15 text-violet-500" },
  settings: { icon: Settings2, className: "bg-amber-500/15 text-amber-500" },
  sync: { icon: RefreshCw, className: "bg-orange-500/15 text-orange-500" },
  navigation: { icon: Compass, className: "bg-teal-500/15 text-teal-500" },
  search: { icon: SearchIcon, className: "bg-slate-500/15 text-slate-400" },
  modal: { icon: PanelTop, className: "bg-indigo-500/15 text-indigo-400" },
  ui_click: { icon: MousePointerClick, className: "bg-muted text-muted-foreground" },
};

const visualFor = (l: AuditLog) => {
  if (l.action.toLowerCase().includes("exchange"))
    return { icon: RefreshCw, className: "bg-orange-500/15 text-orange-500" };
  return categoryVisual[l.category] ?? categoryVisual["ui_click"]!;
};

const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

function AuditPage() {
  const { isAdmin, staff } = useAuth();
  const logs = useAuditLogs();
  const sync = useSyncState();
  const [range, setRange] = useState<RangeKey>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [who, setWho] = useState("all");
  const [category, setCategory] = useState("all");
  const [q, setQ] = useState("");
  const [detail, setDetail] = useState<AuditLog | null>(null);
  const [view, setView] = useState<"table" | "stream">("table");

  const rows = useMemo(() => {
    const now = new Date();
    const today = dayStart(now);
    const yesterday = today - 86_400_000;
    const text = q.trim().toLowerCase();
    return logs.filter((l) => {
      const t = new Date(l.at).getTime();
      if (range === "today" && t < today) return false;
      if (range === "yesterday" && (t < yesterday || t >= today)) return false;
      if (range === "custom") {
        if (from && t < new Date(`${from}T00:00:00`).getTime()) return false;
        if (to && t > new Date(`${to}T23:59:59`).getTime()) return false;
      }
      if (who !== "all" && l.staffId !== who) return false;
      if (category !== "all" && l.category !== category) return false;
      if (
        text &&
        !`${describeLog(l)} ${l.action} ${l.module} ${l.staffName} ${l.staffId} ${l.route} ${JSON.stringify(
          l.details,
        )}`
          .toLowerCase()
          .includes(text)
      )
        return false;
      return true;
    });
  }, [logs, range, from, to, who, category, q]);

  const pager = usePagination(rows, 25);

  if (!isAdmin) {
    return (
      <AppShell>
        <div className="flex min-h-screen items-center justify-center p-6">
          <div className="max-w-sm rounded-lg border border-destructive/40 bg-destructive/10 p-6 text-center">
            <ShieldAlert className="mx-auto size-6 text-destructive" />
            <p className="mt-2 font-semibold">Admins only</p>
            <p className="mt-1 text-sm text-muted-foreground">
              The activity trail contains company-wide telemetry.
            </p>
          </div>
        </div>
      </AppShell>
    );
  }

  function exportCsv() {
    const blob = new Blob([auditToCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    logger.log("sync", "Exported audit logs", "audit", { rows: rows.length, format: "csv" });
    toast.success(`Exported ${rows.length} log rows`);
  }

  return (
    <AppShell>
      <div className="space-y-5 p-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Audit logs &amp; activity trail</h1>
            <p className="text-sm text-muted-foreground">
              {rows.length} of {logs.length} events · local-first telemetry
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={sync.online ? "secondary" : "destructive"} className="gap-1">
              {sync.online ? <Cloud className="size-3" /> : <CloudOff className="size-3" />}
              {sync.online ? "Online" : "Offline"} · {sync.pending} pending
            </Badge>
            <Button variant="outline" onClick={exportCsv}>
              <Download className="size-4" /> Export logs
            </Button>
          </div>
        </header>

        <section className="grid gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-4">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Date range</Label>
            <Select value={range} onValueChange={(v) => setRange(v as RangeKey)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All time</SelectItem>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="yesterday">Yesterday</SelectItem>
                <SelectItem value="custom">Custom range</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Staff member</Label>
            <Select value={who} onValueChange={setWho}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All staff</SelectItem>
                <SelectItem value="admin">Store Admin</SelectItem>
                {staff.map((s) => (
                  <SelectItem key={s.id} value={s.staffId}>
                    {s.name} ({s.staffId})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {AUDIT_CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Search details</Label>
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search action, module or payload"
            />
          </div>
          {range === "custom" && (
            <>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">From</Label>
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">To</Label>
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
            </>
          )}
        </section>

        <section className="rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>Staff</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Module</TableHead>
                <TableHead>Sync</TableHead>
                <TableHead className="text-right">Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.slice(0, 300).map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="numeric whitespace-nowrap text-muted-foreground">
                    {new Date(l.at).toLocaleString()}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {l.staffName}
                    <span className="numeric block text-[11px] text-muted-foreground">
                      {l.staffId}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{l.category}</Badge>
                  </TableCell>
                  <TableCell className="font-medium">{l.action}</TableCell>
                  <TableCell className="capitalize text-muted-foreground">{l.module}</TableCell>
                  <TableCell>
                    <Badge variant={l.synced_to_cloud ? "secondary" : "outline"}>
                      {l.synced_to_cloud ? "synced" : "pending"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => setDetail(l)}>
                      <Eye className="size-4" /> View details
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!rows.length && (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                    No activity matches these filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </section>
      </div>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{detail?.action}</DialogTitle>
            <DialogDescription>
              {detail && new Date(detail.at).toLocaleString()} · {detail?.module}
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <div className="space-y-4">
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <Row label="Staff" value={`${detail.staffName} (${detail.staffId})`} />
                <Row label="Category" value={detail.category} />
                <Row label="Route" value={detail.route} />
                <Row label="Store" value={detail.storeId ?? "all stores"} />
                <Row
                  label="Cloud sync"
                  value={
                    detail.synced_to_cloud
                      ? `synced ${new Date(detail.syncedAt!).toLocaleTimeString()}`
                      : "pending (queued locally)"
                  }
                />
              </dl>
              <Separator />
              <div>
                <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                  Action metadata
                </p>
                <pre className="numeric max-h-80 overflow-auto rounded-md border border-border bg-muted/40 p-3 text-xs">
                  {JSON.stringify(detail.details, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border p-2">
      <dt className="text-[11px] uppercase text-muted-foreground">{label}</dt>
      <dd className="break-words font-medium">{value}</dd>
    </div>
  );
}
