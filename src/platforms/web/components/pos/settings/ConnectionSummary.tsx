/**
 * Plain-language summary at the top of the Data & connectivity page.
 *
 * Read-only: every figure comes from the status the app already keeps. The
 * buttons re-use the existing sync entry points, they do not add new ones.
 */
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSystemStatus, useLocalDbHealth } from "@/lib/system-status";
import { runExclusive } from "@/lib/sync-engine";
import { supabaseConfig } from "@/lib/external-supabase-config";

const when = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString() : "Not yet";

function Cell({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-0 space-y-0.5">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`truncate text-sm font-medium ${tone ?? ""}`}>{value}</p>
    </div>
  );
}

export function ConnectionSummary() {
  const status = useSystemStatus();
  const local = useLocalDbHealth();
  const [busy, setBusy] = useState(false);

  let server = "Not set";
  try {
    const cfg = supabaseConfig();
    server = cfg?.url ? new URL(cfg.url).host : "Not set";
  } catch {
    server = "Not set";
  }

  const tone =
    status.tone === "ok"
      ? "text-success"
      : status.tone === "error"
        ? "text-destructive"
        : "text-warning";

  return (
    <section className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Cell label="Company server" value={server} />
        <Cell label="This machine's database" value={local.connected ? (local.database ?? local.server ?? "In use") : "Not in use"} />
        <Cell label="Sending changes" value={status.label} tone={tone} />
        <Cell label="Last successful send" value={when(status.lastSyncAt)} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={busy || status.syncing}
          onClick={async () => {
            setBusy(true);
            try {
              await runExclusive("settings-summary");
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy || status.syncing ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          Send changes now
        </Button>
        <Button size="sm" variant="ghost" asChild>
          <Link to="/settings/sync">View sync status</Link>
        </Button>
      </div>
    </section>
  );
}
