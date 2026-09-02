import { createFileRoute } from "@tanstack/react-router";
import { SectionHub } from "@/platforms/web/components/pos/SectionHub";

export const Route = createFileRoute("/inventory-hub")({
  head: () => ({
    meta: [
      { title: "Inventory & Supply — Northwind POS" },
      {
        name: "description",
        content:
          "Product catalog, purchase orders and receiving, branch stock transfers and warehouse locations.",
      },
      { property: "og:title", content: "Inventory & Supply — Northwind POS" },
      {
        property: "og:description",
        content: "Stock, suppliers and branch logistics for the point of sale.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <SectionHub groupId="inventory" />,
});