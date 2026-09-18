import { createFileRoute, redirect } from "@tanstack/react-router";

/** The local SQL Server explorer was removed with Electron offline storage. */
export const Route = createFileRoute("/settings/database-explorer")({
  beforeLoad: () => {
    throw redirect({ to: "/settings/database", replace: true });
  },
});
