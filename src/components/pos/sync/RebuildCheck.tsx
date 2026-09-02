/**
 * "Would this till come back?"
 *
 * Two things live here. The rebuild check counts what the till holds against
 * what head office holds, table by table, and changes nothing — it can be run
 * at any time. The drill actually wipes this branch's history and restores it,
 * keeping a copy so a failure costs nothing but time; it is only offered when
 * the queue is empty, no shift is open and head office is reachable.
 */
import { useCallback, useEffect, useState } from "react";
import { ClipboardCheck, Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { localDb, type RestoreCheck, type RestoreDrill } from "@/core/local-db/local-db";

const when = (iso?: string | null) => (iso ? new Date(iso).toLocaleString() : "—");

export function RebuildCheck() {
  const bridge = localDb();
  const [check, setCheck] = useState<RestoreCheck | null>(null);
  const [drill, setDrill] = useState<RestoreDrill | null>(null);
  const [blockers, setBlockers] = useState<string[]>([]);
  const [checking, setChecking] = useState(false);
  const [drilling, setDrilling] = useState(false);

  const refresh = useCallback(() => {
    if (!bridge?.restoreEvidence) return;
    void bridge
      .restoreEvidence()
      .then((res) => {
        if (!res) return;
        setCheck(res.check ?? null);
        setDrill(res.drill ?? null);
        setBlockers(res.blockers ?? []);
      })
      .catch(() => undefined);
  }, [bridge]);

  useEffect(refresh, [refresh]);

  // Rebuilding needs a local database to rebuild into, which only the Windows
  // till has. Say so rather than hiding the feature on phones and the web.
  if (!bridge?.restoreVerify) {
    return (
      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <ClipboardCheck className="size-4 text-primary" /> Rebuild check & restore drill
        </h2>
        <p className="mt-2 text-xs text-muted-foreground">
          Available on the Windows till only — it compares and restores that machine's local
          database. This device reads straight from head office, so there is nothing to rebuild.
        </p>
      </section>
    );
  }

  const runCheck = async () => {
    setChecking(true);
    try {
      const res = await bridge.restoreVerify!({ days: 90 });
      if (res?.ok) {
        setCheck(res);
        toast.success(
          res.verdict === "complete"
            ? "This till would rebuild completely."
            : `${res.short.length} table(s) would come back short.`,
        );
      } else {
        toast.error(res?.error ?? "The check could not run");
      }
    } catch (err) {
      toast.error(String((err as Error)?.message ?? err));
    } finally {
      setChecking(false);
      refresh();
    }
  };

  const runDrill = async () => {
    const ok = window.confirm(
      "Run the wipe-and-restore drill?\n\n" +
        "This branch's last 90 days of history are copied, cleared, and pulled " +
        "back down from head office. If anything comes back short the copy is " +
        "put back automatically. Do not trade while it runs.",
    );
    if (!ok) return;
    setDrilling(true);
    try {
      const res = await bridge.restoreDrill!({ days: 90 });
      setDrill(res as RestoreDrill);
      if (res?.ok) toast.success("Drill passed — everything came back.");
      else toast.error(res?.error ?? "Drill failed — the copy was put back.");
    } catch (err) {
      toast.error(String((err as Error)?.message ?? err));
    } finally {
      setDrilling(false);
      refresh();
    }
  };

  const short = check?.tables.filter((t) => t.behind > 0) ?? [];
  const ahead = check?.tables.filter((t) => t.ahead > 0) ?? [];

  return (
    <section className="space-y-3 rounded-md border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium">If this till had to be rebuilt</h3>
          <p className="text-xs text-muted-foreground">
            {check
              ? check.verdict === "complete"
                ? `Checked ${when(check.at)} — every table matches head office.`
                : `Checked ${when(check.at)} — ${short.length} table(s) would come back short.`
              : "Not checked yet on this till."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={checking} onClick={() => void runCheck()}>
            {checking ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ClipboardCheck className="size-4" />
            )}
            {checking ? "Checking…" : "Rebuild check"}
          </Button>
          {bridge.restoreDrill ? (
            <Button
              size="sm"
              variant="outline"
              disabled={drilling || blockers.length > 0}
              title={blockers.join(" ")}
              onClick={() => void runDrill()}
            >
              {drilling ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ShieldAlert className="size-4" />
              )}
              {drilling ? "Running drill…" : "Wipe & restore drill"}
            </Button>
          ) : null}
        </div>
      </div>

      {blockers.length ? (
        <p className="text-xs text-muted-foreground">
          The drill is not available: {blockers.join(" ")}
        </p>
      ) : null}

      {short.length ? (
        <ul className="space-y-1 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs">
          {short.map((t) => (
            <li key={t.table}>
              <code>{t.table}</code> — head office holds {t.central}, this till holds {t.local}.
            </li>
          ))}
        </ul>
      ) : null}

      {ahead.length ? (
        <p className="text-xs text-muted-foreground">
          Ahead of head office (work still in the queue):{" "}
          {ahead.map((t) => `${t.table} +${t.ahead}`).join(", ")}.
        </p>
      ) : null}

      {drill ? (
        <div className="rounded-md border border-border p-3 text-xs">
          <p>
            Last drill {when(drill.finishedAt ?? drill.startedAt)} —{" "}
            {drill.verdict === "pass"
              ? "passed; everything came back."
              : `failed${drill.rolledBack ? "; the copy was put back" : ""}.`}
            {drill.error ? ` ${drill.error}` : ""}
          </p>
          {drill.tables?.some((t) => !t.pass) ? (
            <ul className="mt-2 space-y-1 text-destructive">
              {drill.tables
                .filter((t) => !t.pass)
                .map((t) => (
                  <li key={t.table}>
                    <code>{t.table}</code> — {t.missing} row(s) did not come back.
                  </li>
                ))}
            </ul>
          ) : null}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          No drill has been run on this till, so "rebuilds completely" is a claim, not evidence.
        </p>
      )}
    </section>
  );
}
