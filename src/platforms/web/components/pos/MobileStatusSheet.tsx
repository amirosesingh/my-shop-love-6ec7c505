/**
 * Everything the desktop header shows, folded into one sheet for the phone.
 *
 * The Android top bar is far too narrow for the connection status, system health
 * pill, the security bell and the activity bell side by side, so they are
 * reached from a single status button instead. Nothing is dropped: the sheet
 * lists connection state, security alerts and the
 * activity feed, each at full size.
 */
import type { ReactNode } from "react";
import { CloudCheck, CloudOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  ConnectionStatusButton,
  SystemAlertsButton,
} from "@/platforms/web/components/pos/StatusCluster";
import { ActivityBell } from "@/platforms/web/components/pos/ActivityBell";
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
  const status = useSystemStatus();
  const online = status.connectivity === "online";
  const tone = !online ? "text-warning" : "text-success";

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
          ) : (
            <CloudCheck className={cn("size-3.5", tone)} />
          )}
          <span className={tone}>{online ? "OK" : "Off"}</span>
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
          <Row label="Connection detail">
            <ConnectionStatusButton />
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
