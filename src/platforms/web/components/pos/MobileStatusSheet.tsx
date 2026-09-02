/**
 * Everything the desktop header shows, folded into one sheet for the phone.
 *
 * The Android top bar is far too narrow for the sync pill, the system health
 * pill, the security bell and the activity bell side by side, so they are
 * reached from a single status button instead. Nothing is dropped: the sheet
 * lists connection state, database mode, queued work, security alerts and the
 * activity feed, each at full size.
 */
import { useEffect, useState, type ReactNode } from "react";
import { CloudCheck, CloudOff, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { SyncStatus } from "@/platforms/web/components/pos/SyncStatus";
import {
  ConnectionStatusButton,
  SystemAlertsButton,
} from "@/platforms/web/components/pos/StatusCluster";
import { ActivityBell } from "@/platforms/web/components/pos/ActivityBell";
import { databaseModeLabel, effectiveDatabaseMode, subscribeDatabaseMode } from "@/core/local-db/db-mode";
import { subscribeOutbox } from "@/lib/sync-outbox";
import { subscribeSyncState } from "@/lib/sync-status";
import { Link } from "@tanstack/react-router";
import { useSystemStatus } from "@/lib/system-status";
import { cn } from "@/lib/utils";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface-2 px-3 py-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

export function MobileStatusSheet({ className }: { className?: string }) {
  const [, force] = useState(0);
  const bump = () => force((n) => n + 1);

  useEffect(() => {
    const offs = [subscribeOutbox(bump), subscribeDatabaseMode(bump), subscribeSyncState(bump)];
    window.addEventListener("online", bump);
    window.addEventListener("offline", bump);
    const timer = window.setInterval(bump, 10000);
    return () => {
      offs.forEach((off) => off());
      window.removeEventListener("online", bump);
      window.removeEventListener("offline", bump);
      window.clearInterval(timer);
    };
  }, []);

  const status = useSystemStatus();
  const online = status.connectivity === "online";
  const pending = status.pending;
  const busy = status.syncing;
  const tone = !online ? "text-warning" : pending ? "text-accent" : "text-success";

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          aria-label="Connection and alerts"
          className={cn("h-8 shrink-0 gap-1 px-2 text-[11px]", className)}
        >
          {!online ? (
            <CloudOff className={cn("size-3.5", tone)} />
          ) : busy || pending ? (
            <RefreshCw className={cn("size-3.5", tone, busy && "animate-spin")} />
          ) : (
            <CloudCheck className={cn("size-3.5", tone)} />
          )}
          <span className={tone}>{pending ? pending : online ? "OK" : "Off"}</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
        <SheetTitle className="text-sm">Status &amp; alerts</SheetTitle>
        <div className="mt-3 space-y-2 pb-6">
          <Row label="Connection">
            <span className={cn("text-xs font-medium", tone)}>
              {online ? "Online — central database" : "Offline — this device"}
            </span>
          </Row>
          <Row label="Database in use">
            <span
              className={cn(
                "text-xs font-medium",
                effectiveDatabaseMode() === "local" ? "text-warning" : "text-success",
              )}
            >
              {databaseModeLabel()}
            </span>
          </Row>
          <Row label="Waiting to sync">
            <span className="text-xs font-medium">{pending ? `${pending} item(s)` : "Nothing"}</span>
          </Row>
          {/* One trigger only: the sync panel owns starting a sync. */}
          <Button asChild size="sm" variant="outline" className="w-full">
            <Link to="/settings/sync">
              <RefreshCw className={cn("mr-1.5 size-3.5", busy && "animate-spin")} /> Open sync panel
            </Link>
          </Button>

          <Row label="Connection detail">
            <ConnectionStatusButton />
          </Row>
          <Row label="Sync detail">
            <SyncStatus />
          </Row>
          <Row label="System &amp; security">
            <SystemAlertsButton />
          </Row>
          <Row label="Activity">
            <ActivityBell />
          </Row>
        </div>
      </SheetContent>
    </Sheet>
  );
}
