/**
 * One-line note telling the operator whether a screen is showing live data or
 * the last copy this terminal pulled down.
 */
import { CloudOff } from "lucide-react";

export function OfflineDataNotice({
  source,
  what = "data",
  className = "",
}: {
  source: "cloud" | "local";
  /** What the screen is listing, e.g. "history" or "staff". */
  what?: string;
  className?: string;
}) {
  if (source === "cloud") return null;
  return (
    <p
      className={`flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground ${className}`}
    >
      <CloudOff className="size-3.5 shrink-0" />
      Connection is down — showing the last {what} synced to this terminal.
    </p>
  );
}
