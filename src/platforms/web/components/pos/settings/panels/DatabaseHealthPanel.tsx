import { useState } from "react";
import { toast } from "sonner";
import { notifyError } from "@/lib/notify";
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
import { importSampleData } from "@/core/api/pos-db";
import { FeatureSchemaReport } from "@/platforms/web/components/pos/settings/panels/FeatureSchemaReport";
import { RelationFlowGraph } from "@/platforms/web/components/pos/settings/RelationFlowGraph";
import {
  formatRelationalReport,
  runRelationalHealth,
  STATUS_CLASS,
  STATUS_LABEL,
  type RelationalReport,
} from "@/lib/db-relations";
import { formatLogicReport, logicReport } from "@/lib/logic-health";
import { settingsDuplicates } from "@/lib/settings-groups";

const dot = (ok: boolean) =>
  ok ? "bg-emerald-500" : "bg-destructive";

export function DatabaseHealthPanel() {
  const [report, setReport] = useState<DbHealthReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [coverage, setCoverage] = useState<BranchCoverage[] | null>(null);
  const [peek, setPeek] = useState<RecentRows | null>(null);
  const [peeking, setPeeking] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [relations, setRelations] = useState<RelationalReport | null>(null);
  const [relBusy, setRelBusy] = useState(false);
  const [summary, setSummary] = useState<string[] | null>(null);

  /** Relational picture of the trading tables — no sign-in tables are read. */
  const runRelations = async () => {
    setRelBusy(true);
    try {
      const rep = await runRelationalHealth();
      setRelations(rep);
      if (rep.error) toast.error("Could not read the table links", { description: rep.error });
      return rep;
    } finally {
      setRelBusy(false);
    }
  };

  /** One button: table links, read/write probe, settings duplicates, logic scan. */
  const runEverything = async () => {
    setBusy(true);
    try {
      const [health, cover, rel] = await Promise.all([
        runDbHealth(),
        runBranchCoverage(),
        runRelationalHealth(),
      ]);
      setReport(health);
      setCoverage(cover);
      setRelations(rel);
      const logic = logicReport();
      const dupes = settingsDuplicates();
      const risky = rel.tables.filter((t) => t.status !== "healthy");
      setSummary([
        `Database links: ${rel.error ? `check failed — ${rel.error}` : `${rel.tables.length - risky.length} of ${rel.tables.length} operational tables connected and clean`}`,
        `Integrity risks: ${rel.tables.filter((t) => t.status === "integrity-risk").length} table(s) with orphan records`,
        `Missing relations: ${rel.tables.filter((t) => t.status === "missing-fk").length} table(s) without a declared link`,
        `Reading / saving: ${health.tables.filter((t) => t.read !== "ok" || t.write === "fail").length} table(s) need attention`,
        `Logic flaws: ${logic.counts.critical} critical, ${logic.counts.warning} warning, ${logic.counts.info} info`,
        `Duplicate settings: ${dupes.length === 0 ? "none — every page has one home" : dupes.map((d) => d.route).join(", ")}`,
      ]);
      toast.success("Full system scan finished");
    } catch (e) {
      notifyError(e);
    } finally {
      setBusy(false);
    }
  };

  const copyAll = async () => {
    const parts = [
      relations ? formatRelationalReport(relations) : "",
      report ? formatReport(report) : "",
      formatLogicReport(logicReport()),
    ].filter(Boolean);
    await navigator.clipboard.writeText(parts.join("\n\n"));
    toast.success("Consolidated report copied");
  };

  /** Demo catalogue, on request only — nothing is ever inserted automatically. */
  const loadSample = async () => {
    if (!window.confirm("Add the demo products, members and promotions to the central database?")) return;
    setSeeding(true);
    try {
      await importSampleData();
      toast.success("Sample data added");
    } catch (e) {
      notifyError(e);
    } finally {
      setSeeding(false);
    }
  };

  const run = async () => {
    setBusy(true);
    try {
      const [health, cover] = await Promise.all([runDbHealth(), runBranchCoverage()]);
      setReport(health);
      setCoverage(cover);
    } catch (e) {
      notifyError(e);
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
    <div className="w-full max-w-full space-y-5">

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={busy || relBusy} onClick={() => void runEverything()}>
          {busy ? "Scanning…" : "Run full system health & logic scan"}
        </Button>
        <Button size="sm" disabled={busy} onClick={() => void run()}>
          {busy ? "Checking…" : "Run check"}
        </Button>
        <Button size="sm" variant="outline" disabled={!report} onClick={() => void copy()}>
          Copy report
        </Button>
        <Button size="sm" variant="outline" onClick={() => void copyAll()}>
          Copy everything
        </Button>
        <Button size="sm" variant="outline" disabled={seeding} onClick={() => void loadSample()}>
          {seeding ? "Adding…" : "Load sample data"}
        </Button>
        {report && (
          <span className="text-xs text-muted-foreground">
            {failing === 0
              ? "Every table is reading and saving normally."
              : `${failing} table${failing === 1 ? "" : "s"} need attention.`}
          </span>
        )}
      </div>

      {summary && (
        <section className="space-y-1 rounded-lg border border-border bg-muted/40 p-4">
          <h2 className="text-sm font-semibold">Consolidated scan</h2>
          <ul className="space-y-0.5 text-xs text-muted-foreground">
            {summary.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      )}

      <FeatureSchemaReport />

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">Operational table links</h2>
            <p className="text-xs text-muted-foreground">
              Trading data only — sales, bookings, catalogue, members, purchasing, stock and
              coupons. Staff accounts, roles and sign-in tables are never inspected here.
            </p>
          </div>
          <Button size="sm" variant="outline" disabled={relBusy} onClick={() => void runRelations()}>
            {relBusy ? "Checking links…" : "Check table links"}
          </Button>
        </div>

        {relations?.error && <p className="text-xs text-destructive">{relations.error}</p>}

        {relations && !relations.error && (
          <>
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr className="text-left">
                    <th className="px-3 py-2 font-medium">Table</th>
                    <th className="px-3 py-2 font-medium">Relationships</th>
                    <th className="px-3 py-2 font-medium">Integrity</th>
                  </tr>
                </thead>
                <tbody>
                  {relations.tables.map((t) => (
                    <tr key={t.table} className="border-t border-border align-top">
                      <td className="px-3 py-2">
                        <div className="font-medium">{t.label}</div>
                        <div className="text-muted-foreground">
                          {t.table} · {t.rows} rows
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        {t.links.length === 0 ? (
                          <span className="text-muted-foreground">Stands alone — no parents.</span>
                        ) : (
                          <ul className="space-y-0.5">
                            {t.links.map((l) => (
                              <li key={l.label}>
                                <span className="font-medium">{l.label}</span>{" "}
                                {!l.declared ? (
                                  <span className="text-amber-600 dark:text-amber-400">
                                    no link defined
                                  </span>
                                ) : l.orphans ? (
                                  <span className="text-destructive">
                                    {l.orphans} record{l.orphans === 1 ? "" : "s"} point at a
                                    missing {l.parent} row
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">linked, no orphans</span>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`whitespace-nowrap rounded-full border px-2 py-0.5 ${STATUS_CLASS[t.status]}`}
                        >
                          {STATUS_LABEL[t.status]}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <RelationFlowGraph tables={relations.tables} />
          </>
        )}
      </section>

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
    </div>
  );
}