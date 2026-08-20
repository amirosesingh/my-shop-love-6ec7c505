import { Link } from "@tanstack/react-router";
import { Download, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAppUpdates } from "@/lib/app-updates";

/**
 * Software updates next to the settings gear, so nobody has to hunt through
 * Settings to find them. A dot appears the moment a release is waiting.
 */
export function UpdateHeaderButton({ className }: { className?: string }) {
  const { state } = useAppUpdates();
  const waiting = state.status === "ready" || !!state.available;
  const busy = state.status === "checking" || state.status === "downloading";

  return (
    <Button
      asChild
      variant="ghost"
      size="icon"
      className={cn("relative shrink-0", className)}
      aria-label={waiting ? "Software update available" : "Software updates"}
      title={waiting ? "A new version is ready to install" : "Software updates"}
    >
      <Link to="/settings/updates">
        {busy ? (
          <RefreshCw className="size-4 animate-spin" />
        ) : (
          <Download className="size-4" />
        )}
        {waiting && (
          <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-primary ring-2 ring-sidebar" />
        )}
      </Link>
    </Button>
  );
}
