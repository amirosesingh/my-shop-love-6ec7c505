import { Database } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useSystemStatus } from "@/lib/system-status";

/**
 * Live state of the operational branch SQL Server—the same pool used by sales,
 * sync and Local Database settings. Reads the one shared status source so it
 * can never disagree with the cloud/sync indicator beside it. Renders nothing
 * in the browser build.
 */
export function OperationalDatabaseBadge({ className = "" }: { className?: string }) {
  const { local } = useSystemStatus();

  if (!local.connected) return null;

  return (
    <Badge
      variant="outline"
      className={`shrink-0 gap-1 border-emerald-500/40 bg-emerald-500/10 text-[11px] text-emerald-600 ${className}`}
      title={`${local.server ?? "Branch SQL Server"} \u00b7 ${local.database ?? "database"}`}
    >
      <span className="size-1.5 rounded-full bg-emerald-500" />
      <Database className="size-3" />
      Branch SQL Server
      {local.database ? ` \u00b7 ${local.database}` : ""}
    </Badge>
  );
}
