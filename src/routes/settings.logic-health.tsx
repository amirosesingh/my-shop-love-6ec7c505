import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Copy, Info, ShieldAlert, Layers } from "lucide-react";
import { SettingsFrame } from "@/components/pos/settings/SettingsFrame";
import { SettingsTabs } from "@/components/pos/settings/SettingsTabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  formatLogicReport,
  logicReport,
  SEVERITY_BLURB,
  SEVERITY_LABEL,
  type LogicSeverity,
} from "@/lib/logic-health";
import { settingsDuplicates } from "@/lib/settings-groups";

export const Route = createFileRoute("/settings/logic-health")({
  head: () => ({
    meta: [
      { title: "Logic Health — Northwind POS" },
      {
        name: "description",
        content:
          "Unfinished logic, buttons with no action and money paths without failure handling, grouped by how badly they can hurt trading.",
      },
      { property: "og:title", content: "Logic Health — Northwind POS" },
      {
        property: "og:description",
        content: "Code health findings for the point of sale, grouped by severity.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LogicHealthPage,
});

const ORDER: LogicSeverity[] = ["critical", "warning", "info"];

const TONE: Record<LogicSeverity, string> = {
  critical: "border-destructive/40 bg-destructive/10 text-destructive",
  warning: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  info: "border-border bg-muted/40 text-muted-foreground",
};

const ICON: Record<LogicSeverity, typeof Info> = {
  critical: ShieldAlert,
  warning: AlertTriangle,
  info: Info,
};

function LogicHealthPage() {
  const report = useMemo(() => logicReport(), []);
  const duplicates = useMemo(() => settingsDuplicates(), []);
  const [query, setQuery] = useState("");
  const [only, setOnly] = useState<LogicSeverity | "all">("all");

  const term = query.trim().toLowerCase();
  const rows = report.findings.filter(
    (f) =>
      (only === "all" || f.severity === only) &&
      (!term ||
        f.file.toLowerCase().includes(term) ||
        f.rule.toLowerCase().includes(term) ||
        f.detail.toLowerCase().includes(term)),
  );

  const copy = async () => {
    await navigator.clipboard.writeText(formatLogicReport(report));
    toast.success("Logic report copied");
  };

  return (
    <SettingsFrame
      title="Logic health"
      description="A scan of the application code for unfinished work, controls that do nothing and money paths that could fail silently."
    >
      <SettingsTabs current="/settings/logic-health" />

      <div className="grid gap-3 sm:grid-cols-3">
        {ORDER.map((sev) => {
          const Icon = ICON[sev];
          return (
            <button
              key={sev}
              type="button"
              onClick={() => setOnly(only === sev ? "all" : sev)}
              aria-pressed={only === sev}
              className={`rounded-lg border p-4 text-left transition-colors ${TONE[sev]} ${
                only === sev ? "ring-2 ring-primary/40" : ""
              }`}
            >
              <span className="flex items-center gap-2 text-sm font-semibold">
                <Icon className="size-4" /> {SEVERITY_LABEL[sev]}
              </span>
              <span className="numeric mt-1 block text-2xl font-semibold">
                {report.counts[sev]}
              </span>
              <span className="mt-1 block text-xs opacity-80">{SEVERITY_BLURB[sev]}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by file, rule or text…"
          aria-label="Filter logic findings"
          className="h-9 max-w-xs"
        />
        {only !== "all" && (
          <Button size="sm" variant="outline" onClick={() => setOnly("all")}>
            Show all severities
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={() => void copy()}>
          <Copy className="size-3.5" /> Copy report
        </Button>
        <span className="text-xs text-muted-foreground">
          {report.filesScanned} files scanned{" "}
          {new Date(report.generatedAt).toLocaleString()} · {rows.length} shown
        </span>
      </div>

      <section className="space-y-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Layers className="size-4 text-primary" /> Duplicate settings
        </h2>
        {duplicates.length === 0 ? (
          <p className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
            Every settings page has exactly one home. Tax, bill numbering and SKU rules sit under
            POS rules; receipt design under Receipts &amp; printing; scheduling under Booking
            rules.
          </p>
        ) : (
          <ul className="space-y-1 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
            {duplicates.map((d) => (
              <li key={d.route}>
                <code>{d.route}</code> appears under {d.groups.join(" and ")}.
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-xs">
          <thead className="bg-muted/50">
            <tr className="text-left">
              <th className="px-3 py-2 font-medium">Severity</th>
              <th className="px-3 py-2 font-medium">What was found</th>
              <th className="px-3 py-2 font-medium">Where</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={3} className="px-3 py-4 text-center text-muted-foreground">
                  Nothing matches that filter.
                </td>
              </tr>
            )}
            {rows.slice(0, 400).map((f) => (
              <tr key={f.id} className="border-t border-border align-top">
                <td className="px-3 py-2">
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] ${TONE[f.severity]}`}>
                    {SEVERITY_LABEL[f.severity]}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <div className="font-medium">{f.rule}</div>
                  <div className="break-all text-muted-foreground">{f.detail}</div>
                  <div className="text-muted-foreground/80">{f.hint}</div>
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <code className="text-muted-foreground">
                    {f.file}:{f.line}
                  </code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > 400 && (
        <p className="text-xs text-muted-foreground">
          Showing the first 400 of {rows.length} findings — filter to narrow the list.
        </p>
      )}
    </SettingsFrame>
  );
}