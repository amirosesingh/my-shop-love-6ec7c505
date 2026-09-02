/**
 * Quiet "new version ready" strip for the Android till, fed by the same
 * update bucket the Windows app uses.
 */
import { Download, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  dismissAndroidUpdate,
  isAndroidUpdateDismissed,
  useAndroidUpdates,
} from "@/platforms/mobile/android-updates";

export function AndroidUpdateBanner() {
  const { state, available, install, installDownloaded } = useAndroidUpdates();

  if (!state.supported) return null;

  // The APK is on the phone but Android did not open its installer — offer it
  // again rather than leaving the counter with a downloaded file and no way in.
  if (state.readyUri) {
    return (
      <div className="fixed inset-x-0 bottom-0 z-50 flex items-center gap-3 border-t border-border bg-card px-4 py-3 shadow-lg">
        <Download className="h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-medium text-foreground">Update downloaded</p>
          <p className="truncate text-xs text-muted-foreground">
            {state.error ?? "Tap to install the new version."}
          </p>
        </div>
        <Button size="sm" onClick={() => void installDownloaded()}>
          Tap to install
        </Button>
      </div>
    );
  }

  if (!available || !state.latest) return null;
  if (isAndroidUpdateDismissed(state.latest)) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex items-center gap-3 border-t border-border bg-card px-4 py-3 shadow-lg">
      <Download className="h-4 w-4 shrink-0 text-primary" />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-medium text-foreground">Version {state.latest} is available</p>
        <p className="truncate text-xs text-muted-foreground">
          {state.downloading
            ? `Downloading… ${state.percent}%`
            : (state.error ?? `You are on ${state.installed}`)}
        </p>
      </div>
      <Button size="sm" onClick={() => void install()} disabled={state.downloading}>
        {state.downloading ? "Downloading" : "Update"}
      </Button>
      <Button
        size="icon"
        variant="ghost"
        aria-label="Dismiss update"
        onClick={() => dismissAndroidUpdate(state.latest!)}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}