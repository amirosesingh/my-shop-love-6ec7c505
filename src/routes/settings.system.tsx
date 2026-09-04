import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { SettingsFrame } from "@/platforms/web/components/pos/settings/SettingsFrame";
import { SettingsTabs } from "@/platforms/web/components/pos/settings/SettingsTabs";
import { SystemStatusPanel } from "@/platforms/web/components/pos/settings/panels/SystemStatusPanel";
import { CloudConnectionPanel } from "@/platforms/web/components/pos/settings/panels/CloudConnectionPanel";
import { DatabaseHealthPanel } from "@/platforms/web/components/pos/settings/panels/DatabaseHealthPanel";
import { LogicHealthPanel } from "@/platforms/web/components/pos/settings/panels/LogicHealthPanel";
import { SecurityAlertsPanel } from "@/platforms/web/components/pos/settings/panels/SecurityAlertsPanel";
import { InheritancePanel } from "@/platforms/web/components/pos/settings/panels/InheritancePanel";
import { SyncHub } from "@/platforms/web/components/pos/sync/SyncHub";
import { DataComparison } from "@/platforms/web/components/pos/sync/DataComparison";
import { SYSTEM_TAB_IDS, systemTab, type SystemTabId } from "@/lib/settings-groups";

export const Route = createFileRoute("/settings/system")({
  validateSearch: (search: Record<string, unknown>): { tab?: SystemTabId } => {
    const tab = search["tab"];
    return SYSTEM_TAB_IDS.includes(tab as SystemTabId) ? { tab: tab as SystemTabId } : {};
  },
  head: () => ({
    meta: [
      { title: "System & General Settings — Northwind POS" },
      {
        name: "description",
        content:
          "One window for connection health, database integrity, code logic health, security alerts, data sync and settings inheritance on this till.",
      },
      { property: "og:title", content: "System & General Settings — Northwind POS" },
      {
        property: "og:description",
        content: "Diagnose, sync and configure every service this till depends on, in one view.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SystemSettingsPage,
});

function SystemSettingsPage() {
  const { tab = "system" } = Route.useSearch();
  const navigate = useNavigate({ from: "/settings/system" });
  const meta = systemTab(tab);

  return (
    <SettingsFrame wide title={meta.label} description={meta.blurb}>
      <SettingsTabs
        current="/settings/system"
        activeTab={tab}
        onTab={(next) =>
          void navigate({ search: { tab: next as SystemTabId }, replace: true })
        }
      />

      <div className="w-full min-w-0 max-w-full">
        {tab === "system" && (
          <div className="space-y-4">
            <CloudConnectionPanel />
            <SystemStatusPanel />
          </div>
        )}
        {tab === "database-health" && <DatabaseHealthPanel />}
        {tab === "logic-health" && <LogicHealthPanel />}
        {tab === "security-alerts" && <SecurityAlertsPanel />}
        {tab === "data-sync" && <SyncHub />}
        {tab === "data-comparison" && <DataComparison />}
        {tab === "inheritance" && <InheritancePanel />}
      </div>
    </SettingsFrame>
  );
}
