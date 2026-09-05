/**
 * The one status indicator for the whole app (web, desktop till and Android).
 *
 * A single cloud icon says everything:
 *   pulsing cloud  — still checking the connection (start-up)
 *   plain cloud    — online and synced
 *   pulsing cloud with a count — syncing / changes waiting
 *   slashed cloud  — offline
 *   warning cloud  — sync failed or the keys were rejected
 *
 * Tapping it opens a details panel with the pending count, the last sync, the
 * local database picture and the last error. Nothing here ever blocks the
 * cashier: no modal, no toast.
 */
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Cloud, CloudAlert, CloudOff, Database, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useSystemStatus, type StatusTone } from "@/lib/system-status";
import { heartbeat } from "@/core/activation/connection-health";
import { drainOutbox } from "@/lib/sync-engine";

const TONE_TEXT: Record<StatusTone, string> = {
  connecting: "text-muted-foreground",
  ok: "text-success",
  busy: "text-warning",
  offline: "text-destructive",
  error: "text-destructive",
};

const TONE_CHIP: Record<StatusTone, string> = {
  connecting: "border-border bg-surface-2 text-muted-foreground",
  ok: "border-success/40 bg-success/10 text-success",
  busy: "border-warning/40 bg-warning/10 text-warning",
  offline: "border-destructive/40 bg-destructive/10 text-destructive",
  error: "border-destructive/40 bg-destructive/10 text-destructive",
};

/** The cloud icon in the state the tone describes. */
export function CloudStateIcon({
  tone,
  className,
}: {
  tone: StatusTone;
  className?: string;
}) {
  const Icon = tone === "offline" ? CloudOff : tone === "error" ? CloudAlert : Cloud;
  return (
    <Icon
      aria-hidden
      className={cn(
        "size-4",
        TONE_TEXT[tone],
        (tone === "connecting" || tone === "busy") && "animate-pulse",
        className,
      )}
    />
  );
}

const time = (value: string | null) =>
  value ? new Date(value).toLocaleTimeString() : "—";

/** Start-up / full-screen version: just the cloud, nothing else. */
export function ConnectingCloud({ className }: { className?: string }) {
  const { tone, label } = useSystemStatus();
  return (
    <div
      className={cn("flex min-h-screen items-center justify-center", className)}
      role="status"
      aria-label={label}
    >
      <CloudStateIcon tone={tone} className="size-10" />
    </div>
  );
}

/** The persistent badge plus its details panel. */
export function SystemStatusBadge({
  className,
  showLabel = true,
}: {
  className?: string;
  showLabel?: boolean;
}) {
  const status = useSystemStatus();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = () => {
    setBusy(true);
    void Promise.all([heartbeat(), drainOutbox()]).finally(() => setBusy(false));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Connection: ${status.label}`}
          title={status.detail}
          className={cn(
            "flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs",
            TONE_CHIP[status.tone],
            className,
          )}
        >
          <CloudStateIcon tone={status.tone} className="size-3.5" />
          {showLabel && <span className="whitespace-nowrap">{status.label}</span>}
          {!showLabel && status.pending > 0 && (
            <span className="text-[10px] font-semibold">{status.pending}</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-3">
        <div className="flex items-center gap-2">
          <CloudStateIcon tone={status.tone} />
          <p className="text-sm font-semibold">Connection &amp; sync</p>
          <span className="ml-auto text-[11px] text-muted-foreground">{status.label}</span>
        </div>
        <p className="text-[11px] text-muted-foreground">{status.detail}</p>

        <dl className="space-y-1.5 text-[11px]">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Database in use</dt>
            <dd className="truncate font-medium">{status.databaseMode}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Waiting to sync</dt>
            <dd className="font-medium">
              {status.pending ? `${status.pending} item(s)` : "Nothing"}
            </dd>
          </div>
          {status.conflicts > 0 && (
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Needs attention</dt>
              <dd className="font-medium text-destructive">{status.conflicts}</dd>
            </div>
          )}
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Last backup / sync</dt>
            <dd className="font-medium">{time(status.lastSyncAt)}</dd>
          </div>
        </dl>

        {status.local.connected && (
          <div className="rounded-md border border-border bg-surface-2 p-2">
            <div className="flex items-center gap-1.5">
              <Database className="size-3.5 text-success" />
              <p className="text-xs font-medium">This terminal's database</p>
            </div>
            <p className="mt-1 break-all text-[11px] text-muted-foreground">
              {status.local.server ?? "Local instance"}
              {status.local.database ? ` · ${status.local.database}` : ""}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Last read {time(status.local.lastReadAt)} · last write{" "}
              {time(status.local.lastWriteAt)}
            </p>
          </div>
        )}

        {status.lastError && (
          <p className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-[11px] text-destructive">
            {status.lastError}
          </p>
        )}

        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="flex-1" disabled={busy} onClick={refresh}>
            <RefreshCw className={cn("size-3.5", busy && "animate-spin")} /> Sync now
          </Button>
          <Button asChild size="sm" className="flex-1">
            <Link
              to={status.credentialsInvalid ? "/settings/system" : "/settings/sync"}
              onClick={() => setOpen(false)}
            >
              Sync hub
            </Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
