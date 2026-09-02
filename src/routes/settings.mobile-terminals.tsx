import { createFileRoute } from "@tanstack/react-router";
import { SettingsFrame } from "@/platforms/web/components/pos/settings/SettingsFrame";
import { TerminalTokens } from "@/platforms/web/components/pos/TerminalTokens";

export const Route = createFileRoute("/settings/mobile-terminals")({
  head: () => ({
    meta: [
      { title: "Mobile Terminals — POS Settings" },
      {
        name: "description",
        content:
          "Register and manage phones and tablets running the POS, separately from the Windows counter tills.",
      },
      { property: "og:title", content: "Mobile Terminals — POS Settings" },
      {
        property: "og:description",
        content: "Issue activation codes for phones and tablets and disconnect them remotely.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <SettingsFrame
      title="Mobile terminals"
      description="Phones and tablets get their own activation codes here. Windows counter tills are managed on the Terminal activation page."
    >
      <TerminalTokens only="mobile" />
    </SettingsFrame>
  ),
});