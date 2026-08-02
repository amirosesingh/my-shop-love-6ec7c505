import { DownloadCloud, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useAppUpdates } from "@/lib/app-updates";

const LABELS: Record<string, string> = {
  idle: "Not checked yet",
  checking: "Checking for updates…",
  current: "You are on the latest version",
  downloading: "Downloading update…",
  ready: "Update ready — restart to install",
  error: "Update check failed",
  unavailable: "Automatic updates are not available in this build",
};

/** Desktop-only card: current version, manual check, and restart-to-install. */
export function AppUpdateSettings() {
  const { state, supported, check, install } = useAppUpdates();
  if (!supported) return null;

  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <DownloadCloud className="size-4 text-primary" /> App updates
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        This till checks for new versions in the background. Updates never interrupt a shift — they
        install when you restart. Your terminal registration is kept.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
        <span className="numeric rounded-md border border-border px-2 py-1 text-xs">
          v{state.version || "—"}
        </span>
        <span className="text-muted-foreground">{LABELS[state.status] ?? state.status}</span>
        {state.available && state.status !== "current" && (
          <span className="numeric text-xs text-primary">→ v{state.available}</span>
        )}
      </div>

      {state.status === "downloading" && (
        <Progress value={state.percent} className="mt-3 h-2" aria-label="Update download progress" />
      )}

      {state.error && <p className="mt-2 text-xs text-destructive">{state.error}</p>}

      <div className="mt-4 flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={state.status === "checking" || state.status === "downloading"}
          onClick={() => void check()}
        >
          {state.status === "checking" ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <RefreshCw className="size-3.5" />
          )}
          Check for updates
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