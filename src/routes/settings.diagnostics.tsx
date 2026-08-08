import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { SettingsFrame } from "@/components/pos/settings/SettingsFrame";
import { Button } from "@/components/ui/button";
import {
  formatReport,
  runDbHealth,
  runBranchCoverage,
  loadRecentRows,
  INSPECTOR_TABLES,
  type BranchCoverage,
  type DbHealthReport,
  type RecentRows,
} from "@/lib/db-health";

export const Route = createFileRoute("/settings/diagnostics")({
  head: () => ({
    meta: [
      { title: "Database health — Northwind POS" },
      {
        name: "description",
        content:
          "Check that every POS table can be read and written on the central database, with the exact reason shown when one fails.",
      },
      { property: "og:title", content: "Database health — Northwind POS" },
      {
        property: "og:description",
        content: "Per-table read and write status for the central POS database.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DiagnosticsPage,
});

const dot = (ok: boolean) =>
  ok ? "bg-emerald-500" : "bg-destructive";

function DiagnosticsPage() {
  const [report, setReport] = useState<DbHealthReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [coverage, setCoverage] = useState<BranchCoverage[] | null>(null);
  const [peek, setPeek] = useState<RecentRows | null>(null);
  const [peeking, setPeeking] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    try {
      const [health, cover] = await Promise.all([runDbHealth(), runBranchCoverage()]);
      setReport(health);
      setCoverage(cover);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const inspect = async (table: string, columns: string) => {
    setPeeking(table);
    try {
      setPeek(await loadRecentRows(table, columns));
    } finally {
      setPeeking(null);
    }
  };

  const copy = async () => {
    if (!report) return;
    await navigator.clipboard.writeText(formatReport(report));
    toast.success("Report copied");
  };

  const failing = report?.tables.filter((t) => t.read !== "ok" || t.write === "fail").length ?? 0;

  return (
    <SettingsFrame
      title="Database health"
      description="Checks that each POS table can be read and saved on the central database. Nothing is changed — the save test uses a request that matches no rows."
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={busy} onClick={() => void run()}>
          {busy ? "Checking…" : "Run check"}
        </Button>
        <Button size="sm" variant="outline" disabled={!report} onClick={() => void copy()}>
          Copy report
        </Button>
        {report && (
          <span className="text-xs text-muted-foreground">
            {failing === 0
              ? "Every table is reading and saving normally."
              : `${failing} table${failing === 1 ? "" : "s"} need attention.`}
          </span>
        )}
      </div>

      {report && (
        <div className="space-y-4">
          <ul className="space-y-1 rounded-md border border-border p-3 text-xs">
            {report.header.map((h) => (
              <li key={h.label} className="flex items-start gap-2">
                <span className={`mt-1 size-2 shrink-0 rounded-full ${dot(h.ok)}`} />
                <span className="min-w-0">
                  <span className="font-medium">{h.label}</span>{" "}
                  <span className="break-all text-muted-foreground">{h.detail}</span>
                </span>
              </li>
            ))}
          </ul>

          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr className="text-left">
                  <th className="px-3 py-2 font-medium">Table</th>
                  <th className="px-3 py-2 font-medium">Reading</th>
                  <th className="px-3 py-2 font-medium">Saving</th>
                </tr>
              </thead>
              <tbody>
                {report.tables.map((t) => (
                  <tr key={t.table} className="border-t border-border align-top">
                    <td className="px-3 py-2">
                      <div className="font-medium">{t.label}</div>
                      <div className="text-muted-foreground">{t.table}</div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-start gap-2">
                        <span className={`mt-1 size-2 shrink-0 rounded-full ${dot(t.read === "ok")}`} />
                        <span className={t.read === "ok" ? "text-muted-foreground" : "text-destructive"}>
                          {t.readDetail}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {t.write === "skipped" ? (
                        <span className="text-muted-foreground">Not tested</span>
                      ) : (
                        <div className="flex items-start gap-2">
                          <span className={`mt-1 size-2 shrink-0 rounded-full ${dot(t.write === "ok")}`} />
                          <span
                            className={t.write === "ok" ? "text-muted-foreground" : "text-destructive"}
                          >
                            {t.writeDetail}
                          </span>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {coverage && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Branch id coverage</h2>
          <p className="text-xs text-muted-foreground">
            Rows saved without a branch cannot be found by branch reports. Run{" "}
            <code>supabase/sql/21_backfill_branch_ids.sql</code> on your database to repair
            older rows.
          </p>
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr className="text-left">
                  <th className="px-3 py-2 font-medium">Table</th>
                  <th className="px-3 py-2 font-medium">Rows</th>
                  <th className="px-3 py-2 font-medium">Without a branch</th>
                </tr>
              </thead>
              <tbody>
                {coverage.map((c) => (
                  <tr key={c.table} className="border-t border-border">
                    <td className="px-3 py-2">
                      <div className="font-medium">{c.label}</div>
                      <div className="text-muted-foreground">{c.table}</div>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{c.total ?? "—"}</td>
                    <td className="px-3 py-2">
                      {c.error ? (
                        <span className="text-destructive">{c.error}</span>
                      ) : (
                        <span
                          className={c.missing ? "font-semibold text-destructive" : "text-muted-foreground"}
                        >
                          {c.missing ?? "—"}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">What is stored right now</h2>
        <p className="text-xs text-muted-foreground">
          The newest rows straight from your own database, read the same way the till reads
          them.
        </p>
        <div className="flex flex-wrap gap-2">
          {INSPECTOR_TABLES.map((t) => (
            <Button
              key={t.table}
              size="sm"
              variant={peek?.table === t.table ? "default" : "outline"}
              disabled={peeking === t.table}
              onClick={() => void inspect(t.table, t.columns)}
            >
              {peeking === t.table ? "Loading…" : t.label}
            </Button>
          ))}
        </div>

        {peek && (
          <div className="overflow-x-auto rounded-md border border-border">
            {peek.error ? (
              <p className="p-3 text-xs text-destructive">{peek.error}</p>
            ) : peek.rows.length === 0 ? (
              <p className="p-3 text-xs text-muted-foreground">
                No rows in {peek.label} yet.
              </p>
            ) : (
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr className="text-left">
                    {Object.keys(peek.rows[0]).map((k) => (
                      <th key={k} className="px-3 py-2 font-medium">
                        {k}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {peek.rows.map((row, i) => (
                    <tr key={i} className="border-t border-border">
                      {Object.keys(peek.rows[0]).map((k) => (
                        <td key={k} className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                          {row[k] == null ? "—" : String(row[k])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </section>
    </SettingsFrame>
  );
}