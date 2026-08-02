import { createFileRoute } from "@tanstack/react-router";
import { SettingsFrame } from "@/components/pos/settings/SettingsFrame";
import { DisplayScalingSettings } from "@/components/pos/DisplayScalingSettings";
import { ReceiptPrinterSettings } from "@/components/pos/ReceiptPrinterSettings";
import { AppUpdateSettings } from "@/components/pos/AppUpdateSettings";

export const Route = createFileRoute("/settings/display")({
  head: () => ({
    meta: [
      { title: "Display & Text Size — Northwind POS" },
      { name: "description", content: "Scale fonts, buttons and density so the till stays touch-friendly on any Windows screen, and switch between light and dark themes." },
      { property: "og:title", content: "Display & Text Size — Northwind POS" },
      { property: "og:description", content: "Interface scaling, density and theme controls for the register." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <SettingsFrame
      title="Display & text size"
      description="Scale the interface for the screen this till runs on, and pick a light or dark theme."
    >
      <DisplayScalingSettings bare />
      <div className="mt-6">
        <ReceiptPrinterSettings />
      </div>
      <div className="mt-6">
        <AppUpdateSettings />
      </div>
    </SettingsFrame>
  ),
});
