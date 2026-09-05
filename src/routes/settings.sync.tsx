import { createFileRoute } from "@tanstack/react-router";
import { SettingsFrame } from "@/platforms/web/components/pos/settings/SettingsFrame";
import { SyncPanel } from "@/platforms/web/components/pos/sync/SyncPanel";
import { SyncHub } from "@/platforms/web/components/pos/sync/SyncHub";
import { SyncSettings } from "@/platforms/web/components/pos/SyncSettings";

export const Route = createFileRoute("/settings/sync")({
  head: () => ({
    meta: [
      { title: "Sync — Northwind POS" },
      {
        name: "description",
        content:
          "The one place sync runs from: live table-by-table status, every change still waiting, why it is stuck, the audit ledger and backups.",
      },
      { property: "og:title", content: "Sync — Northwind POS" },
      { property: "og:description", content: "Trigger sync, watch progress and clear the queue." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <SettingsFrame
      wide
      title="Sync"
      description="This till always sells against its own database. Sync pushes finished work to the central database whenever a connection is available — start it here, and only here."
    >
      <SyncPanel />
      <SyncHub />
      <SyncSettings />
    </SettingsFrame>
  ),
});
