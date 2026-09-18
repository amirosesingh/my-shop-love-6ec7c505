import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { SettingsFrame } from "@/platforms/web/components/pos/settings/SettingsFrame";
import { DatabaseConnectionSettings } from "@/platforms/web/components/pos/DatabaseConnectionSettings";
import { BranchSettings } from "@/platforms/web/components/pos/BranchSettings";
import { ConnectionSummary } from "@/platforms/web/components/pos/settings/ConnectionSummary";

const SchemaHealthPanel = lazy(() =>
  import("@/platforms/web/components/database/SchemaHealthPanel").then((module) => ({
    default: module.SchemaHealthPanel,
  })),
);

export const Route = createFileRoute("/settings/database")({
  head: () => ({
    meta: [
      { title: "Database Connection — Retail" },
      {
        name: "description",
        content:
          "Central database credentials, the local SQL Server connection, connection tests and the setup health check for this till.",
      },
      { property: "og:title", content: "Database Connection — Retail" },
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
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading schema checks…</p>}>
        <SchemaHealthPanel />
      </Suspense>
    </SettingsFrame>
  ),
});
