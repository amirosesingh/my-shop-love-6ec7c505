import { createFileRoute } from "@tanstack/react-router";
import { SettingsFrame } from "@/platforms/web/components/pos/settings/SettingsFrame";
import { AppUpdateSettings } from "@/platforms/web/components/pos/AppUpdateSettings";
import { SystemHealthCard } from "@/platforms/web/components/pos/SystemHealthCard";

export const Route = createFileRoute("/settings/updates")({
  head: () => ({
    meta: [
      { title: "Software Updates — Northwind POS" },
      {
        name: "description",
        content:
          "Check the installed till version, download new releases in the background, restart to install, and roll back to the last version that started cleanly.",
      },
      { property: "og:title", content: "Software Updates — Northwind POS" },
      {
        property: "og:description",
        content: "Background updates, version status and safe-mode rollback for the register.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <SettingsFrame
      title="Software updates"
      description="New versions download quietly in the background and install when you restart — a shift is never interrupted."
    >
      {/* Wide screens get a workspace + system-health rail; phones stack. */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0">
          <AppUpdateSettings />
        </div>
        <aside className="min-w-0 xl:sticky xl:top-4 xl:self-start">
          <SystemHealthCard />
        </aside>
      </div>
    </SettingsFrame>
  ),
});
