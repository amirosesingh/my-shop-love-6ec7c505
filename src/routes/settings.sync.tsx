import { createFileRoute, redirect } from "@tanstack/react-router";

/** Sync is not a separate operation on online-only clients. */
export const Route = createFileRoute("/settings/sync")({
  beforeLoad: () => {
    throw redirect({ to: "/settings/database", replace: true });
  },
});
