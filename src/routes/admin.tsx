import { createFileRoute } from "@tanstack/react-router";
import { SectionHub } from "@/platforms/web/components/pos/SectionHub";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Staff & Admin — Northwind POS" },
      {
        name: "description",
        content:
          "Staff accounts, PINs, roles and the permission matrix, plus the full audit trail of register activity.",
      },
      { property: "og:title", content: "Staff & Admin — Northwind POS" },
      {
        property: "og:description",
        content: "People, permissions and compliance logs for the till.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <SectionHub groupId="staff" />,
});