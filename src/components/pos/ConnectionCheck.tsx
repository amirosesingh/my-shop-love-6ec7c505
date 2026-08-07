import { useState } from "react";
import { Button } from "@/components/ui/button";
import { supabaseExternal } from "@/integrations/supabase/external-client";
import { readTerminalConfig } from "@/lib/terminal-tokens";
import { ensureTerminalSession } from "@/lib/terminal-session";
import { probeRelay } from "@/lib/sync-relay";

type Check = { label: string; ok: boolean; detail: string };

/** Tells staff, in plain words, whether this till can save to the cloud. */
export function ConnectionCheck() {
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    const results: Check[] = [];

    const config = readTerminalConfig();
    results.push({
      label: "Terminal registered",
      ok: !!config,
      detail: config ? config.locationName || config.locationId : "This till is not activated yet",
    });

    const signedIn = await ensureTerminalSession();
    const session = (await supabaseExternal.auth.getSession()).data.session;
    results.push({
      label: "Signed in to the central database",
      ok: signedIn || !!session,
      detail: session?.user?.email ?? "No cloud account on this till",
    });

    const relay = await probeRelay();
    results.push({
      label: "Server backup route",
      ok: relay.ok,
      detail: relay.ok ? "Writes can go through the server" : (relay.error ?? "Unavailable"),
    });

    setChecks(results);
    setBusy(false);
  };

  return (
    <div className="space-y-2 rounded-md border border-border px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm">Saving to the central database</p>
          <p className="text-xs text-muted-foreground">
            Checks that shifts, sales and sign-ins from this till are accepted by the server.
          </p>
        </div>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void run()}>
          {busy ? "Checking…" : "Run check"}
        </Button>
      </div>
      {checks && (
        <ul className="space-y-1 text-xs">
          {checks.map((c) => (
            <li key={c.label} className={c.ok ? "text-muted-foreground" : "text-destructive"}>
              {c.ok ? "✓" : "✕"} {c.label} — {c.detail}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}