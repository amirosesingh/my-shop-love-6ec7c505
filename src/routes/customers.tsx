import { createFileRoute } from "@tanstack/react-router";
import { SectionHub } from "@/platforms/web/components/pos/SectionHub";

export const Route = createFileRoute("/customers")({
  head: () => ({
    meta: [
      { title: "Customers & Marketing — Northwind POS" },
      {
        name: "description",
        content:
          "Loyalty member directory, membership tiers and the promotions engine for discounts and free-of-charge offers.",
      },
      { property: "og:title", content: "Customers & Marketing — Northwind POS" },
      {
        property: "og:description",
        content: "Members, loyalty points and running promotions.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <SectionHub groupId="people" />,
});