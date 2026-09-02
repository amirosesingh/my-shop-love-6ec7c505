/**
 * Header sync pill.
 *
 * Kept as a thin wrapper so existing call sites don't change: everything it
 * shows now comes from the one unified status indicator.
 */
import { SystemStatusBadge } from "@/platforms/web/components/pos/status/SystemStatus";

export function SyncStatus({ className = "" }: { className?: string }) {
  return <SystemStatusBadge className={className} />;
}
