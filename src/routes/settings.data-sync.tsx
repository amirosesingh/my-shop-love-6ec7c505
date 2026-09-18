import { createFileRoute, redirect } from "@tanstack/react-router";

/** Legacy standalone page — online-only clients use the central database connection page. */
export const Route = createFileRoute("/settings/data-sync")({
  beforeLoad: () => {
    throw redirect({ to: "/settings/database", replace: true });
  },
});
