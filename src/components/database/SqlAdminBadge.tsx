import { useEffect, useState } from "react";
import { Database } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { hasLocalDb, localDb, type LocalSyncStatus } from "@/lib/local-db";

/**
 * Live state of the operational branch SQL Server—the same pool used by sales,
 * sync and Local Database settings. Renders nothing in the browser build.
 */
export function OperationalDatabaseBadge({ className = "" }: { className?: string }) {
  const [status, setStatus] = useState<LocalSyncStatus | null>(null);

  useEffect(() => {
    if (!hasLocalDb()) return;
    const bridge = localDb();
    if (!bridge) return;
    let alive = true;
    const read = async () => {
      const next = await bridge.status();
      if (alive && next) setStatus(next);
    };
    void read();
    const off = bridge.onStatus((next) => setStatus(next));
    const timer = setInterval(read, 10_000);
    return () => {
      alive = false;
      clearInterval(timer);
      off();
    };
  }, []);

  if (!status?.connected) return null;

  return (
    <Badge
      variant="outline"
      className={`shrink-0 gap-1 border-emerald-500/40 bg-emerald-500/10 text-[11px] text-emerald-600 ${className}`}
      title={`${status.server ?? "Branch SQL Server"} · ${status.database ?? "database"}`}
    >
      <span className="size-1.5 rounded-full bg-emerald-500" />
      <Database className="size-3" />
      Branch SQL Server
      {status.database ? ` · ${status.database}` : ""}
    </Badge>
  );
}
