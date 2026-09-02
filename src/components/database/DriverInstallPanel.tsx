/**
 * Shown when the connection ladder reports EDRIVER: the PC has no Microsoft
 * ODBC driver, so Windows Integrated authentication cannot sign in.
 *
 * One button downloads the pinned official installer, verifies its fingerprint
 * and runs it. Windows raises its own permission prompt — the panel says so
 * before the click, so nothing appears to freeze.
 */
import { useEffect, useState } from "react";
import { Download, ExternalLink, RotateCw, ShieldCheck, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  MANUAL_ODBC_URL,
  describeInstallResult,
  describeProgress,
  driverBridge,
  installDriver,
  listDrivers,
  type DriverCatalogEntry,
  type DriverInstallResult,
  type DriverProgress,
} from "@/core/local-db/driver-install";

export function DriverInstallPanel({ onInstalled }: { onInstalled?: () => void }) {
  const [entries, setEntries] = useState<DriverCatalogEntry[]>([]);
  const [supported, setSupported] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<DriverProgress | null>(null);
  const [result, setResult] = useState<DriverInstallResult | null>(null);

  const refresh = () => {
    void listDrivers().then((res) => {
      setSupported(!!res.supported);
      setEntries(res.drivers ?? []);
    });
  };

  useEffect(() => {
    refresh();
    const bridge = driverBridge();
    return bridge?.onDriverProgress((p) => setProgress(p));
  }, []);

  const target =
    entries.find((d) => d.recommended && !d.installed) ??
    entries.find((d) => d.kind === "odbc" && !d.installed) ??
    null;

  const run = async (id: string) => {
    setBusy(true);
    setResult(null);
    setProgress({ phase: "download", percent: 0 });
    const res = await installDriver(id);
    setBusy(false);
    setProgress(null);
    setResult(res);
    refresh();
    if (res.ok && !res.restartRequired) onInstalled?.();
  };

  const manualUrl = result?.manualUrl ?? target?.manualUrl ?? MANUAL_ODBC_URL;
  const progressLine = describeProgress(progress);

  return (
    <div className="space-y-2 rounded-md border border-border bg-muted/40 p-3">
      <p className="flex items-center gap-2 text-sm font-medium">
        <ShieldCheck className="h-4 w-4 text-primary" />
        Microsoft ODBC driver required
      </p>
      <p className="text-xs text-muted-foreground">
        Windows authentication needs a Microsoft ODBC SQL Server driver on this PC.
        {target
          ? ` This installs ${target.name} ${target.version} (x64) straight from Microsoft, checks its fingerprint, then retries the connection.`
          : " No pinned installer is available for this machine."}
      </p>

      {supported && target && (
        <p className="text-xs text-muted-foreground">
          Windows will ask for permission — approve the prompt to continue. Nothing installs until
          the download matches Microsoft&apos;s published fingerprint.
        </p>
      )}

      {progressLine && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">{progressLine}</p>
          <Progress value={progress?.phase === "download" ? progress.percent : 100} />
        </div>
      )}

      {result && (
        <p
          className={`flex items-start gap-1.5 text-xs ${
            result.ok ? "text-muted-foreground" : "text-destructive"
          }`}
        >
          {!result.ok && <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
          {describeInstallResult(result)}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {supported && target && (
          <Button type="button" size="sm" disabled={busy} onClick={() => void run(target.id)}>
            {busy ? (
              <RotateCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="mr-1.5 h-3.5 w-3.5" />
            )}
            {busy ? "Installing…" : "Install driver automatically"}
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => window.open(manualUrl, "_blank", "noopener")}
        >
          <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
          Download manually
        </Button>
        {result?.restartRequired && (
          <span className="self-center text-xs text-muted-foreground">
            Restart Windows to finish the installation.
          </span>
        )}
      </div>

      {!!entries.length && (
        <p className="text-xs text-muted-foreground">
          Detected:{" "}
          {entries.filter((d) => d.installed).map((d) => d.name).join(", ") || "no SQL Server driver"}
        </p>
      )}
    </div>
  );
}
