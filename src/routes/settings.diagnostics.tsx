import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { SettingsFrame } from "@/components/pos/settings/SettingsFrame";
import { Button } from "@/components/ui/button";
import { formatReport, runDbHealth, type DbHealthReport } from "@/lib/db-health";

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

  const run = async () => {
    setBusy(true);
    try {
      setReport(await runDbHealth());
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
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
    </SettingsFrame>
  );
}