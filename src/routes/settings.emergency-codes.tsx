import { createFileRoute } from "@tanstack/react-router";
import { SettingsFrame } from "@/platforms/web/components/pos/settings/SettingsFrame";
import { EmergencyCodesPanel } from "@/platforms/web/components/pos/settings/EmergencyCodesPanel";

export const Route = createFileRoute("/settings/emergency-codes")({
  head: () => ({
    meta: [
      { title: "Emergency Codes — POS Settings" },
      {
        name: "description",
        content:
          "Read the live one-minute recovery code for any registered till, without running a script or visiting the machine.",
      },
      { property: "og:title", content: "Emergency Codes — POS Settings" },
      {
        property: "og:description",
        content: "Owner-only screen showing the current emergency access code for each terminal.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <SettingsFrame
      wide
      title="Emergency codes"
      description="The six digits that open the Emergency Access screen on a till. Codes change every minute, are shown to owners only and every reveal is recorded."
    >
      <EmergencyCodesPanel />
    </SettingsFrame>
  ),
});
