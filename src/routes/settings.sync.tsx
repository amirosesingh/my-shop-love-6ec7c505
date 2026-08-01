import { createFileRoute } from "@tanstack/react-router";
import { SettingsFrame } from "@/components/pos/settings/SettingsFrame";
import { SyncSettings } from "@/components/pos/SyncSettings";
import { BranchSettings } from "@/components/pos/BranchSettings";

export const Route = createFileRoute("/settings/sync")({
  head: () => ({
    meta: [
      { title: "Sync & Backup — Northwind POS" },
      { name: "description", content: "Branch identity, offline-first sync toggle, pending transaction queue, local SQL Server connection and database backups." },
      { property: "og:title", content: "Sync & Backup — Northwind POS" },
      { property: "og:description", content: "Offline sync, branch identity and backup controls." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <SettingsFrame
      title="Sync & backup"
      description="This till always sells offline against its local database. Sync pushes finished bills to the central server whenever a connection is available."
    >
      <BranchSettings />
      <SyncSettings />
    </SettingsFrame>
  ),
});
