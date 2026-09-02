import { createFileRoute } from "@tanstack/react-router";
import { SettingsFrame } from "@/platforms/web/components/pos/settings/SettingsFrame";
import { DatabaseExplorer } from "@/platforms/web/components/database/DatabaseExplorer";
import { useAuth } from "@/lib/pos-auth";

export const Route = createFileRoute("/settings/database-explorer")({
  head: () => ({
    meta: [
      { title: "Database Explorer — Northwind POS" },
      {
        name: "description",
        content:
          "Connect this till to its local Microsoft SQL Server, browse databases, tables and columns, and run read-only checks.",
      },
      { property: "og:title", content: "Database Explorer — Northwind POS" },
      {
        property: "og:description",
        content: "SSMS-style local SQL Server browsing for the desktop till.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DatabaseExplorerPage,
});

function DatabaseExplorerPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  return (
    <SettingsFrame
      wide
      title="Database explorer"
      description="Connect to the Microsoft SQL Server on this machine, browse its databases and tables, and run read-only checks. This connection is separate from the one the register uses, so browsing never interrupts a sale."
    >
      {isAdmin ? (
        <DatabaseExplorer />
      ) : (
        <div className="rounded-md border border-border px-4 py-3 text-sm text-muted-foreground">
          Only an administrator can open the database explorer.
        </div>
      )}
    </SettingsFrame>
  );
}
