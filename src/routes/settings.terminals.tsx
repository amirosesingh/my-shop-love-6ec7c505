import { createFileRoute } from "@tanstack/react-router";
import { SettingsFrame } from "@/platforms/web/components/pos/settings/SettingsFrame";
import { CurrentTerminalPanel } from "@/platforms/web/components/pos/CurrentTerminalPanel";
import { TerminalTokens } from "@/platforms/web/components/pos/TerminalTokens";

export const Route = createFileRoute("/settings/terminals")({
  head: () => ({
    meta: [
      { title: "Terminal Activation — POS Settings" },
      {
        name: "description",
        content:
          "Issue and revoke activation tokens that bind each Windows POS terminal to a location or warehouse.",
      },
      { property: "og:title", content: "Terminal Activation — POS Settings" },
      {
        property: "og:description",
        content: "Register Windows tills per location and disconnect them remotely.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <SettingsFrame
      wide
      title="Terminal activation"
      description="Every Windows till registers once with a code issued here. Phones and tablets live on the Mobile terminals page. Revoke a token to cut a machine off from the company data."
    >
      <div className="space-y-5">
        <CurrentTerminalPanel />
        <TerminalTokens only="pc" />
      </div>
    </SettingsFrame>
  ),
});
