import { DownloadCloud, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { APP_VERSION, useAppUpdates } from "@/lib/app-updates";

const LABELS: Record<string, string> = {
  idle: "Not checked yet",
  checking: "Checking for updates…",
  current: "You are on the latest version",
  downloading: "Downloading update…",
  ready: "Update ready — restart to install",
  error: "Update check failed",
  unavailable: "Automatic updates are not available in this build",
};

/** Current version, manual check, and restart-to-install. On the web build the
 *  card still shows the running version, with checks disabled. */
export function AppUpdateSettings() {
  const { state, supported, check, install, lastChecked } = useAppUpdates();
  const version = state.version || APP_VERSION;

  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <DownloadCloud className="size-4 text-primary" /> App updates
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        {supported
          ? "This till checks for new versions in the background. Updates never interrupt a shift — they install when you restart. Your terminal registration is kept."
          : "You are running the browser version, which is always up to date. Automatic updates apply to the Windows desktop till."}
      </p>

      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-md border border-border px-3 py-2">
          <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Installed version
          </dt>
          <dd className="numeric text-sm font-semibold">v{version}</dd>
        </div>
        <div className="rounded-md border border-border px-3 py-2">
          <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Status</dt>
          <dd className="text-sm">
            {supported ? (LABELS[state.status] ?? state.status) : LABELS["unavailable"]}
            {state.available && state.status !== "current" && (
              <span className="numeric ml-1 text-primary">→ v{state.available}</span>
            )}
          </dd>
          {lastChecked && (
            <dd className="text-[11px] text-muted-foreground">
              Last checked {lastChecked.toLocaleString()}
            </dd>
          )}
        </div>
      </dl>

      {state.status === "downloading" && (
        <Progress value={state.percent} className="mt-3 h-2" aria-label="Update download progress" />
      )}

      {state.error && <p className="mt-2 text-xs text-destructive">{state.error}</p>}

      <div className="mt-4 flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={!supported || state.status === "checking" || state.status === "downloading"}
          onClick={() => void check()}
        >
          {state.status === "checking" ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <RefreshCw className="size-3.5" />
          )}
          Check for updates now
        </Button>
        {state.status === "ready" && (
          <Button size="sm" onClick={() => void install()}>
            Restart and install
          </Button>
        )}
      </div>
    </section>
  );
}