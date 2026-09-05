import { createFileRoute, redirect } from "@tanstack/react-router";

/** Legacy standalone page — sync now lives in one place, the Sync page. */
export const Route = createFileRoute("/settings/data-sync")({
  beforeLoad: () => {
    throw redirect({ to: "/settings/sync", replace: true });
  },
});
