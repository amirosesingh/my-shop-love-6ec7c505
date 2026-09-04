import { createFileRoute } from "@tanstack/react-router";
import { SettingsFrame } from "@/platforms/web/components/pos/settings/SettingsFrame";
import { DatabaseConnectionSettings } from "@/platforms/web/components/pos/DatabaseConnectionSettings";
import { SchemaHealthPanel } from "@/platforms/web/components/database/SchemaHealthPanel";
import { BranchSettings } from "@/platforms/web/components/pos/BranchSettings";
import { ConnectionSummary } from "@/platforms/web/components/pos/settings/ConnectionSummary";

export const Route = createFileRoute("/settings/database")({
  head: () => ({
    meta: [
      { title: "Database Connection — Northwind POS" },
      {
        name: "description",
        content:
          "Central database credentials, the local SQL Server connection, connection tests and the setup health check for this till.",
      },
      { property: "og:title", content: "Database Connection — Northwind POS" },
      {
        property: "og:description",
        content: "Cloud and local database connections, tests and schema health in one place.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <SettingsFrame
      wide
      title="Database connection"
      description="Where this till reads and writes: the central database, the SQL Server on this machine, and whether both carry the tables this app version expects. Sync itself lives on the Sync page."
    >
      <ConnectionSummary />
      <BranchSettings />
      <DatabaseConnectionSettings />
      <SchemaHealthPanel />
    </SettingsFrame>
  ),
});
