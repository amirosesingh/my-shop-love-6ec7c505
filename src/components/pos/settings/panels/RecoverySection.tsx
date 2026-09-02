/**
 * Recovery — if this till's database were deleted tonight, what would a
 * replacement terminal get back?
 *
 * The verdict per feature is derived from the feature registry and the till's
 * own sync lists, so it cannot drift from what the sync loop really does. On
 * web and Android there is no local database, so only the declared intent is
 * shown.
 */
import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { localDb, type RestoreCheck, type RestoreDrill } from "@/core/local-db/local-db";
import {
  recoveryVerdicts,
  RECOVERY_VERDICT_TEXT,
  type Recovery,
  type RecoveryVerdict,
} from "@/lib/sync-coverage";

const TONE: Record<RecoveryVerdict, string> = {
  full: "text-foreground",
  partial: "text-amber-600 dark:text-amber-400",
  none: "text-destructive",
  "not-needed": "text-muted-foreground",
};

export function RecoverySection() {
  const bridge = localDb();
  const [contract, setContract] = useState<{
    push: string[];
    pull: string[];
    restore: string[];
  } | null>(null);
  const [loading, setLoading] = useState(!!bridge?.syncContract);
  const [evidence, setEvidence] = useState<{
    check: RestoreCheck | null;
    drill: RestoreDrill | null;
  } | null>(null);

  useEffect(() => {
    let alive = true;
    if (!bridge?.restoreEvidence) return;
    bridge
      .restoreEvidence()
      .then((res) => {
        if (alive && res) setEvidence({ check: res.check ?? null, drill: res.drill ?? null });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [bridge]);

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

  const rows: Recovery[] = useMemo(
    () => recoveryVerdicts(contract ?? { push: [], pull: [], restore: [] }),
    [contract],
  );
  const good = rows.filter((r) => r.verdict === "full" || r.verdict === "not-needed").length;

  return (
    <section className="space-y-3 rounded-md border border-border p-4">
      <div>
        <h3 className="text-sm font-medium">If this till had to be rebuilt</h3>
        <p className="text-xs text-muted-foreground">
          {contract
            ? `${good} of ${rows.length} features come back in full from head office.`
            : "Connect a till database to check this against the live sync loop."}
        </p>
      </div>

      <p className="text-xs text-muted-foreground">
        {evidence?.drill
          ? evidence.drill.verdict === "pass"
            ? `Proven: a wipe-and-restore drill passed on ${new Date(
                evidence.drill.finishedAt ?? evidence.drill.startedAt ?? Date.now(),
              ).toLocaleString()}.`
            : "The last wipe-and-restore drill failed — see Sync for which table came back short."
          : evidence?.check
            ? evidence.check.verdict === "complete"
              ? "The rebuild check matches head office, but no drill has been run yet."
              : "The last rebuild check found tables that would come back short — see Sync."
            : "Untested — run the rebuild check in Sync to turn this from a claim into evidence."}
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading the sync loop…
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-xs">
            <thead className="bg-muted/50">
              <tr className="text-left">
                <th className="px-3 py-2 font-medium">Feature</th>
                <th className="px-3 py-2 font-medium">After a rebuild</th>
                <th className="px-3 py-2 font-medium">What would be missing</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.feature} className="border-t border-border align-top">
                  <td className="px-3 py-2">{r.name}</td>
                  <td className={`px-3 py-2 whitespace-nowrap ${TONE[r.verdict]}`}>
                    {RECOVERY_VERDICT_TEXT[r.verdict]}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {r.losses.length
                      ? r.losses.map((l) => l.what).join("; ")
                      : r.central.length
                        ? "Nothing — the rest is read from head office as needed."
                        : "Nothing."}
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
