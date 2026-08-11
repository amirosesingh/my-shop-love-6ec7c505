import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/pos/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TablePagination, usePagination } from "@/components/pos/TablePagination";
import { ReportHeader, downloadCsv, stamp } from "@/components/pos/report-kit";
import { supabaseExternal as supabase } from "@/integrations/supabase/external-client";
import { listSystemAudit } from "@/lib/system-audit.functions";

export const Route = createFileRoute("/reports/history")({
  head: () => ({
    meta: [
      { title: "Edit History & Audit Trail — Northwind POS" },
      {
        name: "description",
        content:
          "Permanent record of price overrides, voids, discounts, shift edits, account changes and sign-in attempts with actor, terminal and timestamp.",
      },
      { property: "og:title", content: "Edit History & Audit Trail — Northwind POS" },
      {
        property: "og:description",
        content: "Tamper-proof log of every critical action taken in the system.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: EditHistoryReport,
});

type Row = {
  id: string;
  actor_id: string | null;
  actor_name: string | null;
  actor_role: string | null;
  action_type: string;
  entity_affected: string | null;
  entity_id: string | null;
  old_value: string | null;
  new_value: string | null;
  terminal_id: string | null;
  store_id: string | null;
  note: string | null;
  created_at: string;
};

function EditHistoryReport() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const accessToken = (await supabase.auth.getSession()).data.session?.access_token ?? "";
    if (!accessToken) {
      setError("Sign in with a supervisor or administrator account to view the edit history.");
      setRows([]);
      setLoading(false);
      return;
    }
    const res = await listSystemAudit({ data: { accessToken, limit: 500 } });
    setError(res.ok ? "" : (res.error ?? "Could not load the edit history"));
    setRows((res.rows ?? []) as Row[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) =>
      [
        r.actor_name,
        r.actor_id,
        r.actor_role,
        r.action_type,
        r.entity_affected,
        r.entity_id,
        r.note,
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [rows, q]);

  const page = usePagination(filtered.length);

  const exportCsv = () => {
    downloadCsv(
      `edit-history-${stamp()}.csv`,
      ["When", "Who", "Role", "Action", "Affected", "Reference", "Before", "After", "Terminal"],
      filtered.map((r) => [
        new Date(r.created_at).toLocaleString(),
        r.actor_name ?? r.actor_id ?? "",
        r.actor_role ?? "",
        r.action_type,
        r.entity_affected ?? "",
        r.entity_id ?? "",
        r.old_value ?? "",
        r.new_value ?? "",
        r.terminal_id ?? "",
      ]),
    );
  };

  return (
    <AppShell>
      <div className="space-y-4 p-4">
        <ReportHeader
          title="Edit History"
          subtitle="A permanent, tamper-proof record of every critical action. Entries can never be changed or removed."
          onExport={exportCsv}
        />

        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-1">
            <Label htmlFor="history-search">Search</Label>
            <Input
              id="history-search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Person, action or reference"
              className="w-64"
            />
          </div>
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            Refresh
          </Button>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading the edit history…</p>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : !filtered.length ? (
          <p className="text-sm text-muted-foreground">No recorded actions yet.</p>
        ) : (
          <>
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Who</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Affected</TableHead>
                    <TableHead>Before → After</TableHead>
                    <TableHead>Terminal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.slice(page.start, page.end).map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap text-xs">
                        {new Date(r.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-sm">
                        <div className="font-medium">{r.actor_name ?? r.actor_id ?? "Unknown"}</div>
                        {r.actor_role ? (
                          <Badge variant="outline" className="mt-1">
                            {r.actor_role}
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-sm">{r.action_type}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {[r.entity_affected, r.entity_id].filter(Boolean).join(" · ")}
                      </TableCell>
                      <TableCell className="max-w-[26rem] text-xs text-muted-foreground">
                        <div className="truncate">{r.old_value ?? "—"}</div>
                        <div className="truncate text-foreground">{r.new_value ?? "—"}</div>
                        {r.note ? <div className="truncate italic">{r.note}</div> : null}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.terminal_id ? r.terminal_id.slice(0, 8) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <TablePagination {...page} />
          </>
        )}
      </div>
    </AppShell>
  );
}
