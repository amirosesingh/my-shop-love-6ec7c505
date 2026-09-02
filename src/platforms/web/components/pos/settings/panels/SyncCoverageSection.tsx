/**
 * Sync coverage — what each feature says its data needs, next to what this
 * till actually does with it.
 *
 * On a till the contract comes straight from the sync worker, so the table
 * cannot drift from reality. On web and Android there is no local database,
 * so only the declared intent is shown.
 */
import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { localDb } from "@/core/local-db/local-db";
import {
  buildCoverage,
  conflictRule,
  CONFLICT_RULE_TEXT,
  mismatches,
  type Coverage,
} from "@/lib/sync-coverage";

const DIRECTION_LABEL: Record<string, string> = {
  push: "Sent to head office",
  pull: "Received from head office",
  both: "Kept in step both ways",
  "cloud-only": "Lives centrally only",
};

/** Plain wording for the written conflict rule of each table. */
const RULE_LABEL: Record<string, string> = {
  "cloud-wins": "Head office wins",
  "till-wins": "Till wins",
  "append-only": "Both kept",
  immutable: "Never changes",
};

const CLASS_LABEL: Record<string, string> = {
  financial: "Money",
  governance: "Audit trail",
  operational: "Day to day",
  reference: "Reference data",
};

export function SyncCoverageSection() {
  const bridge = localDb();
  const [contract, setContract] = useState<{
    push: string[];
    pull: string[];
    restore: string[];
  } | null>(null);
  const [loading, setLoading] = useState(!!bridge?.syncContract);

  useEffect(() => {
    let alive = true;
    if (!bridge?.syncContract) return;
    bridge
      .syncContract()
      .then((res) => {
        if (alive && res) setContract(res);
      })
      .catch(() => undefined)
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [bridge]);

  const rows: Coverage[] = useMemo(
    () => buildCoverage(contract ?? { push: [], pull: [], restore: [] }),
    [contract],
  );
  const gaps = useMemo(() => (contract ? mismatches(rows) : []), [contract, rows]);

  const tick = (on: boolean) => (
    <span className={on ? "text-foreground" : "text-muted-foreground"}>{on ? "Yes" : "—"}</span>
  );

  return (
    <section className="space-y-3 rounded-md border border-border p-4">
      <div>
        <h3 className="text-sm font-medium">Sync coverage</h3>
        <p className="text-xs text-muted-foreground">
          Built from the feature list, so a new feature cannot quietly skip the sync loop.
          {contract
            ? gaps.length
              ? ` ${gaps.length} table${gaps.length === 1 ? "" : "s"} need attention.`
              : " Everything matches what the till actually does."
            : " Connect a till database to compare this against the live sync loop."}
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading the sync loop…
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-xs">
            <thead className="bg-muted/50">
              <tr className="text-left">
                <th className="px-3 py-2 font-medium">Data</th>
                <th className="px-3 py-2 font-medium">Kind</th>
                <th className="px-3 py-2 font-medium">Intended</th>
                <th className="px-3 py-2 font-medium">Sent up</th>
                <th className="px-3 py-2 font-medium">Brought down</th>
                <th className="px-3 py-2 font-medium">Recoverable</th>
                <th className="px-3 py-2 font-medium">If both change</th>
                <th className="px-3 py-2 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.table} className="border-t border-border align-top">
                  <td className="px-3 py-2 whitespace-nowrap">
                    <code>{r.table}</code>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                    {r.securityClass ? CLASS_LABEL[r.securityClass] : "—"}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                    {r.declared ? DIRECTION_LABEL[r.declared] : "Not decided"}
                  </td>
                  <td className="px-3 py-2">{tick(r.push)}</td>
                  <td className="px-3 py-2">{tick(r.pull)}</td>
                  <td className="px-3 py-2">
                    {tick(r.restore)}
                    {r.restoreRequired && !r.restore && contract ? (
                      <span className="ml-1 text-destructive">required</span>
                    ) : null}
                  </td>
                  <td
                    className="px-3 py-2 whitespace-nowrap text-muted-foreground"
                    title={CONFLICT_RULE_TEXT[conflictRule(r.table)]}
                  >
                    {RULE_LABEL[conflictRule(r.table)]}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {contract && r.issues?.length ? (
                      <span className="text-destructive">{r.issues.join(" ")}</span>
                    ) : (
                      (r.note ?? "")
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
