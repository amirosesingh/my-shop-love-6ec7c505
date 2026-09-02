import { createFileRoute } from "@tanstack/react-router";
import { SettingsFrame } from "@/platforms/web/components/pos/settings/SettingsFrame";
import { HardwarePanel } from "@/platforms/web/components/pos/settings/panels/HardwarePanel";

export const Route = createFileRoute("/settings/hardware")({
  head: () => ({
    meta: [
      { title: "Terminal Hardware — Northwind POS" },
      {
        name: "description",
        content:
          "Printer, cash drawer and device settings that belong to this till alone and are never copied to another terminal.",
      },
      { property: "og:title", content: "Terminal Hardware — Northwind POS" },
      {
        property: "og:description",
        content: "Local-only printer and drawer configuration for this machine.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HardwareSettings,
});

function HardwareSettings() {
  return (
    <SettingsFrame
      title="Terminal hardware"
      description="Everything on this page is stored on this machine only. It is never sent to the central database, never copied to another till, and an administrator cannot change it remotely."
    >
      <HardwarePanel />
    </SettingsFrame>
  );
}
