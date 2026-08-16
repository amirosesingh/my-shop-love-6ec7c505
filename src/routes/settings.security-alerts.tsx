import { createFileRoute, redirect } from "@tanstack/react-router";

/** Legacy standalone page — everything now lives inside the System & general hub. */
export const Route = createFileRoute("/settings/security-alerts")({
  beforeLoad: () => {
    throw redirect({ to: "/settings/system", search: { tab: "security-alerts" }, replace: true });
  },
});
