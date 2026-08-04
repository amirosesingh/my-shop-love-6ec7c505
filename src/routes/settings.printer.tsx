import { createFileRoute } from "@tanstack/react-router";
import { SettingsFrame } from "@/components/pos/settings/SettingsFrame";
import { ReceiptPrinterSettings } from "@/components/pos/ReceiptPrinterSettings";

export const Route = createFileRoute("/settings/printer")({
  head: () => ({
    meta: [
      { title: "Receipt Printer — Northwind POS" },
      {
        name: "description",
        content:
          "Choose the thermal printer for this till, set encoding, line endings, page margins and the cash drawer kick pin, then print a test slip.",
      },
      { property: "og:title", content: "Receipt Printer — Northwind POS" },
      { property: "og:description", content: "Printer, margins and cash drawer settings for this terminal." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <SettingsFrame
      title="Receipt printer"
      description="Printer hardware for this terminal: device, encoding, margins and the cash drawer pulse."
    >
      <ReceiptPrinterSettings />
    </SettingsFrame>
  ),
});