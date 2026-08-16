import { createFileRoute, redirect } from "@tanstack/react-router";

/** Legacy standalone page — everything now lives inside the System & general hub. */
export const Route = createFileRoute("/settings/data-sync")({
  beforeLoad: () => {
    throw redirect({ to: "/settings/system", search: { tab: "data-sync" }, replace: true });
  },
});
