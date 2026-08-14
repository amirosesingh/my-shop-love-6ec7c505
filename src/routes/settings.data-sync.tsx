import { createFileRoute } from "@tanstack/react-router";
import { SettingsFrame } from "@/components/pos/settings/SettingsFrame";
import { SyncHub } from "@/components/pos/sync/SyncHub";

export const Route = createFileRoute("/settings/data-sync")({
  head: () => ({
    meta: [
      { title: "Data Sync & Audit — Northwind POS" },
      {
        name: "description",
        content:
          "Live sync status, cloud versus local record counts, force push and pull controls, and a full audit ledger of every sync operation on this till.",
      },
      { property: "og:title", content: "Data Sync & Audit — Northwind POS" },
      {
        property: "og:description",
        content: "Sync telemetry, force push/pull and the audit ledger for this terminal.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <SettingsFrame
      title="Data sync & audit"
      description="What this till has sent, what is still waiting, and every sync operation it has recorded."
    >
      <SyncHub />
    </SettingsFrame>
  ),
});
