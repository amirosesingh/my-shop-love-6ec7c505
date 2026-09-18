import { createFileRoute } from "@tanstack/react-router";
import { SettingsFrame } from "@/platforms/web/components/pos/settings/SettingsFrame";
import { DatabaseConnectionSettings } from "@/platforms/web/components/pos/DatabaseConnectionSettings";
import { BranchSettings } from "@/platforms/web/components/pos/BranchSettings";

export const Route = createFileRoute("/settings/database")({
  head: () => ({
    meta: [
      { title: "Database Connection — Retail" },
      {
        name: "description",
        content: "Central database credentials and a live connection check for this device.",
      },
      { property: "og:title", content: "Database Connection — Retail" },
      {
        property: "og:description",
        content: "Cloud database connection and live connection test.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <SettingsFrame
      wide
      title="Database connection"
      description="Connect this device to the central database. Electron, Android and web all read and write online only."
    >
      <BranchSettings />
      <DatabaseConnectionSettings />
    </SettingsFrame>
  ),
});
