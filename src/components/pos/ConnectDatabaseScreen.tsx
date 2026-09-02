/**
 * Step 1 of first-run setup on a terminal app: point this device at the
 * central database.
 *
 * It is not a one-time wizard — it comes back as the start-up screen any time
 * the device has no working database connection and no valid registration.
 * Terminal activation is a separate step that follows it.
 */
import { useNavigate } from "@tanstack/react-router";
import { CloudCog, LifeBuoy, Loader2, RefreshCw } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { CloudConnectionPanel } from "@/components/pos/settings/panels/CloudConnectionPanel";
import { BackendAddressPanel } from "@/components/pos/settings/panels/BackendAddressPanel";
import { checkCloudConnected } from "@/lib/registration-status";

export function ConnectDatabaseScreen({
  cloudConfigured,
  onRetry,
}: {
  /** keys are saved but the link is down */
  cloudConfigured: boolean;
  onRetry: () => void;
}) {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(false);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0f172a] p-6 text-slate-100">
      <div className="w-full max-w-lg space-y-4 rounded-2xl border border-slate-700/70 bg-slate-900/80 p-6">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-sky-500/15 text-sky-400 ring-1 ring-sky-500/40">
            <CloudCog className="size-6" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Connect to the database</h1>
            <p className="text-xs text-slate-400">Step 1 of 2 · then activate this terminal</p>
          </div>
        </div>

        <p className="text-sm text-slate-400">
          {cloudConfigured
            ? "The saved database details are not answering right now. Check the address and key below, or try again once the network is back."
            : "Enter the central database address and publishable key for your company. They are sealed in this device's secure store."}
        </p>

        <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-4">
          <CloudConnectionPanel />
        </div>
        <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-4">
          <BackendAddressPanel />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            className="bg-sky-500 text-slate-950 hover:bg-sky-400"
            disabled={checking}
            onClick={async () => {
              setChecking(true);
              try {
                await checkCloudConnected();
              } finally {
                setChecking(false);
                onRetry();
              }
            }}
          >
            {checking ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            Test and continue
          </Button>
          <Button
            variant="outline"
            className="border-slate-700 bg-slate-800/60 text-slate-100 hover:bg-slate-800"
            onClick={() => void navigate({ to: "/recovery" })}
          >
            <LifeBuoy className="size-4" />
            Emergency access
          </Button>
        </div>
      </div>
    </div>
  );
}
