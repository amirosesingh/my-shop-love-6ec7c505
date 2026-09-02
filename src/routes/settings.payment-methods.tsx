import { createFileRoute } from "@tanstack/react-router";
import { SettingsFrame } from "@/platforms/web/components/pos/settings/SettingsFrame";
import { PaymentMethodsPanel } from "@/platforms/web/components/pos/settings/panels/PaymentMethodsPanel";

export const Route = createFileRoute("/settings/payment-methods")({
  head: () => ({
    meta: [
      { title: "Payment Methods — Northwind POS" },
      {
        name: "description",
        content:
          "Add, rename, reorder, disable or delete the payment collection types offered at the till, including government voucher tenders that require a serial number.",
      },
      { property: "og:title", content: "Payment Methods — Northwind POS" },
      {
        property: "og:description",
        content: "Manage the tenders cashiers can collect, including voucher and coupon redemptions.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <SettingsFrame
      title="Payment methods"
      description="The tenders a cashier can collect at checkout. Changes reach every till on its next refresh."
    >
      <PaymentMethodsPanel />
    </SettingsFrame>
  ),
});

