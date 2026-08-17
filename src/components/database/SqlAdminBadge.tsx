import { useEffect, useState } from "react";
import { Database } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { hasSqlAdmin, sqlAdmin, type SqlAdminStatus } from "@/lib/sql-admin";

/**
 * Live state of the administration connection: server, selected database and
 * whether the pool is open. Renders nothing in the browser build.
 */
export function SqlAdminBadge({ className = "" }: { className?: string }) {
  const [status, setStatus] = useState<SqlAdminStatus | null>(null);

  useEffect(() => {
    if (!hasSqlAdmin()) return;
    let alive = true;
    const read = async () => {
      const next = await sqlAdmin()?.status();
      if (alive && next) setStatus(next);
    };
    void read();
    const timer = setInterval(read, 10_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  if (!status?.connected) return null;

  return (
    <Badge
      variant="outline"
      className={`shrink-0 gap-1 border-emerald-500/40 bg-emerald-500/10 text-[11px] text-emerald-600 ${className}`}
      title={`${status.serverName ?? status.server ?? "SQL Server"} · ${status.database ?? "master"}`}
    >
      <span className="size-1.5 rounded-full bg-emerald-500" />
      <Database className="size-3" />
      {status.serverName ?? status.server}
      {status.database ? ` · ${status.database}` : ""}
    </Badge>
  );
}
