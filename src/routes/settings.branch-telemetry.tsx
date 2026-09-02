import { createFileRoute } from "@tanstack/react-router";
import { SettingsFrame } from "@/platforms/web/components/pos/settings/SettingsFrame";
import { TelemetryPanel } from "@/platforms/web/components/pos/settings/panels/TelemetryPanel";

export const Route = createFileRoute("/settings/branch-telemetry")({
  head: () => ({
    meta: [
      { title: "Branch Telemetry Centre — Northwind POS" },
      {
        name: "description",
        content:
          "Live health of every till: connection state, storage engine, unsynced changes and the last successful sync, with data-only remote commands.",
      },
      { property: "og:title", content: "Branch Telemetry Centre — Northwind POS" },
      {
        property: "og:description",
        content: "Monitor every terminal and send sync or catalogue refresh requests.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BranchTelemetry,
});

function BranchTelemetry() {
  return (
    <SettingsFrame
      title="Branch telemetry centre"
      description="Read-only health of every till. Nothing here changes a terminal's own settings — the only actions available are data requests, and each one waits until that till's unsynced sales have reached the central database."
      wide
    >
      <TelemetryPanel />
    </SettingsFrame>
  );
}
