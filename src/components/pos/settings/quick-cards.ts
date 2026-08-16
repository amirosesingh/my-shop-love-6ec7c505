/**
 * The six areas an administrator opens most. They appear at the top of the
 * settings hub and open in place, without leaving the page.
 */
import type { ComponentType } from "react";
import { Activity, Building2, Landmark, MonitorCog, MessageCircle, Users } from "lucide-react";
import { BrandingPanel } from "@/components/pos/settings/panels/BrandingPanel";
import { HardwarePanel } from "@/components/pos/settings/panels/HardwarePanel";
import { IntegrationsPanel } from "@/components/pos/settings/panels/IntegrationsPanel";
import { PaymentMethodsPanel } from "@/components/pos/settings/panels/PaymentMethodsPanel";
import { StaffSecurityPanel } from "@/components/pos/settings/panels/StaffSecurityPanel";
import { TelemetryPanel } from "@/components/pos/settings/panels/TelemetryPanel";

export type QuickCardId =
  | "branding"
  | "telemetry"
  | "hardware"
  | "payment-methods"
  | "integrations"
  | "staff";

export type QuickCard = {
  id: QuickCardId;
  label: string;
  blurb: string;
  icon: typeof MonitorCog;
  panel: ComponentType;
  /** full page fallback / deep link */
  deepLink: string;
  /** hidden on desktop builds that manage this in the web console */
  cloudOnly?: boolean;
};

export const QUICK_CARDS: QuickCard[] = [
  {
    id: "branding",
    label: "Company branding & logo",
    blurb: "Trading name and the transparent PNG used on slips and screens.",
    icon: Building2,
    panel: BrandingPanel,
    deepLink: "/settings/identity",
  },
  {
    id: "telemetry",
    label: "Live terminal & branch telemetry",
    blurb: "Which tills are online, what is still waiting to sync, remote data requests.",
    icon: Activity,
    panel: TelemetryPanel,
    deepLink: "/settings/branch-telemetry",
  },
  {
    id: "hardware",
    label: "Hardware & printers",
    blurb: "Printer, cash drawer and device identity for this machine only.",
    icon: MonitorCog,
    panel: HardwarePanel,
    deepLink: "/settings/hardware",
  },
  {
    id: "payment-methods",
    label: "Payment methods & vouchers",
    blurb: "Tenders cashiers can collect, including voucher serial numbers.",
    icon: Landmark,
    panel: PaymentMethodsPanel,
    deepLink: "/settings/payment-methods",
  },
  {
    id: "integrations",
    label: "Integrations & APIs",
    blurb: "WhatsApp bill delivery and the backend credentials behind it.",
    icon: MessageCircle,
    panel: IntegrationsPanel,
    deepLink: "/settings/whatsapp",
  },
  {
    id: "staff",
    label: "Staff roles & PIN security",
    blurb: "Roles, permissions and the staff accounts that sign in at the till.",
    icon: Users,
    panel: StaffSecurityPanel,
    deepLink: "/staff",
  },
];
