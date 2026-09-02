/**
 * Emergency Access hub — everything a dead terminal needs to come back to life,
 * on one screen, behind the recovery PIN.
 *
 * A till that was never activated, or lost its database keys, cannot reach
 * Settings: every other screen sits behind activation, sign-in or a live
 * connection. So each of those setup steps is repeated here as its own card,
 * with a live status chip, and nothing on this page needs the network, a
 * signed-in user or a working database.
 */
import { Component, useEffect, useState, type ReactNode } from "react";
import {
  Building2,
  ChevronDown,
  Database,
  KeyRound,
  MonitorCog,
  Server,
  ShieldCheck,
} from "lucide-react";

import { BackendAddressPanel } from "@/components/pos/settings/panels/BackendAddressPanel";
import { CloudConnectionPanel } from "@/components/pos/settings/panels/CloudConnectionPanel";
import { LocalDatabaseSettings } from "@/components/pos/LocalDatabaseSettings";
import { ReceiptPrinterSettings } from "@/components/pos/ReceiptPrinterSettings";
import { TerminalActivation } from "@/components/pos/TerminalActivation";
import { isElectron, isTerminalApp } from "@/platform-config/platform";
import { readTerminalConfig } from "@/core/activation/terminal-tokens";
import { backendUrl } from "@/lib/backend-config";
import { cloudKeyStatus, subscribeCloudKeys } from "@/lib/secure-cloud-config";
import { boundBranchName } from "@/lib/active-branch";
import { emergencyMode, useStartupGate } from "@/core/activation/registration-status";
import { graceDays, setGraceDays } from "@/core/activation/activation-record";

type Health = "ok" | "todo" | "info";

/** One card must never take the whole screen down with it. */
class CardBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) {
      return (
        <p className="text-sm text-muted-foreground">
          This setting could not be loaded on this device. The other cards still work.
        </p>
      );
    }
    return this.props.children;
  }
}

function Chip({ health, label }: { health: Health; label: string }) {
  const tone =
    health === "ok"
      ? "border-success/40 bg-success/10 text-success"
      : health === "todo"
        ? "border-warning/40 bg-warning/10 text-warning"
        : "border-border bg-muted text-muted-foreground";
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[11px] ${tone}`}>{label}</span>
  );
}

function Card({
  icon: Icon,
  title,
  blurb,
  health,
  status,
  defaultOpen,
  children,
}: {
  icon: typeof Server;
  title: string;
  blurb: string;
  health: Health;
  status: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  return (
    <section className="rounded-lg border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-3 p-4 text-left"
      >
        <Icon className="mt-0.5 size-4 shrink-0 text-primary" />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-foreground">{title}</span>
            <Chip health={health} label={status} />
          </span>
          <span className="mt-0.5 block text-xs text-muted-foreground">{blurb}</span>
        </span>
        <ChevronDown
          className={`mt-0.5 size-4 shrink-0 text-muted-foreground transition ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="border-t border-border p-4">
          <CardBoundary>{children}</CardBoundary>
        </div>
      )}
    </section>
  );
}

/** The four emergency-access branches, spelled out for the operator. */
function ModeBanner() {
  const gate = useStartupGate();
  if (gate.loading) return null;
  const mode = emergencyMode(gate);
  const until = gate.record ? new Date(gate.record.graceUntil).toLocaleDateString() : "";
  const copy: Record<string, { tone: string; text: string }> = {
    "online-verified": {
      tone: "border-success/40 bg-success/10 text-success",
      text: "Registered and connected — activation is verified online.",
    },
    "offline-grace": {
      tone: "border-warning/40 bg-warning/10 text-warning",
      text: until
        ? `Verified offline — valid until ${until}. Emergency access is granted in offline mode.`
        : "Verified offline — emergency access is granted in offline mode.",
    },
    "online-unregistered": {
      tone: "border-warning/40 bg-warning/10 text-warning",
      text: "This terminal is not activated. Set the database URL and key below, then activate it.",
    },
    "offline-unregistered": {
      tone: "border-border bg-muted text-muted-foreground",
      text: "Offline emergency mode — limited local functions only. Nothing can be verified until a connection returns.",
    },
  };
  const { tone, text } = copy[mode]!;
  return (
    <div className={`rounded-lg border px-3 py-2 text-xs ${tone}`}>
      {text}
      {mode !== "online-verified" && (
        <span className="ml-1 opacity-80">
          Offline grace period: {graceDays()} days.
        </span>
      )}
    </div>
  );
}

export function RecoveryHub() {
  const terminalApp = isTerminalApp();
  const desktop = isElectron();
  const [activated, setActivated] = useState<boolean | null>(null);
  const [backend, setBackend] = useState("");
  const [cloud, setCloud] = useState<boolean | null>(null);
  const [branch, setBranch] = useState<string | null>(null);

  useEffect(() => {
    setActivated(Boolean(readTerminalConfig()));
    setBranch(boundBranchName());
    void backendUrl()
      .then(setBackend)
      .catch(() => setBackend(""));
    const read = () =>
      void cloudKeyStatus()
        .then((s) => setCloud(Boolean(s.configured)))
        .catch(() => setCloud(false));
    read();
    return subscribeCloudKeys(read);
  }, []);

  return (
    <div className="space-y-3">
      <ModeBanner />

      {terminalApp && (
        <Card
          icon={ShieldCheck}
          title="Terminal activation"
          blurb="Link this machine to a location with an activation code or phone pairing."
          health={activated ? "ok" : "todo"}
          status={activated ? "Activated" : "Not activated"}
          defaultOpen={activated === false}
        >
          <TerminalActivation embedded onActivated={() => window.location.reload()} />
        </Card>
      )}

      {terminalApp && (
        <Card
          icon={Server}
          title="Backend address"
          blurb="Where this device sends sign-in, sync and health calls."
          health={backend ? "ok" : "todo"}
          status={backend ? "Set" : "Not set"}
          defaultOpen={!backend}
        >
          <BackendAddressPanel />
        </Card>
      )}

      <Card
        icon={KeyRound}
        title="Central database keys"
        blurb="Cloud database URL and publishable key held in this device's secure store."
        health={cloud ? "ok" : "todo"}
        status={cloud === null ? "Checking…" : cloud ? "Configured" : "Missing"}
        defaultOpen={cloud === false}
      >
        <CloudConnectionPanel />
      </Card>

      {desktop && (
        <Card
          icon={Database}
          title="Local database (SQL Server)"
          blurb="The Microsoft SQL Server on this machine, its driver and the connection test."
          health="info"
          status="This PC only"
        >
          <LocalDatabaseSettings />
        </Card>
      )}

      <Card
        icon={Building2}
        title="Branch binding"
        blurb="Which store or warehouse this terminal books its sales and stock to."
        health={branch ? "ok" : "todo"}
        status={branch ?? "Not bound"}
      >
        <p className="text-sm text-muted-foreground">
          {branch
            ? `This device is bound to ${branch}. The binding comes from the activation code — re-activate above with a code issued for another location to move it.`
            : "No branch is bound yet. Activate this terminal with a code issued for the right location; the binding is applied automatically."}
        </p>
      </Card>

      <Card
        icon={ShieldCheck}
        title="Offline grace period"
        blurb="How long this terminal keeps working after its last successful verification."
        health="info"
        status={`${graceDays()} days`}
      >
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          Days
          <input
            type="number"
            min={1}
            defaultValue={graceDays()}
            onChange={(e) => setGraceDays(Number(e.target.value))}
            className="w-24 rounded-md border border-border bg-background px-2 py-1 text-foreground"
          />
        </label>
      </Card>

      <Card
        icon={MonitorCog}
        title="Receipt printer & cash drawer"
        blurb="Finish the hardware setup without leaving this screen."
        health="info"
        status="This device only"
      >
        <ReceiptPrinterSettings />
      </Card>
    </div>
  );
}
